import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from secrets import token_urlsafe
from urllib.parse import urlencode
from uuid import UUID

import bcrypt
from fastapi import HTTPException, status
import httpx
import jwt as pyjwt
from jwt import InvalidTokenError, PyJWK
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.log_sanitize import anonymize_email_for_log
from app.models.models import AppUser
from app.repositories.auth_repo import AuthRepository
from app.repositories.profile_repo import ProfileRepository
from app.services.email_service import send_email_verification_email, send_password_reset_email

TOKEN_DAYS = 7
ACCESS_TOKEN_MINUTES = 15
PERSISTENT_REFRESH_COOKIE_DAYS = 90
logger = logging.getLogger(__name__)

_GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
_APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
_GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
_APPLE_ISSUER = "https://appleid.apple.com"


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _jwt_secret() -> str:
    return get_settings().jwt_secret.strip()


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: str, email: str, token_version: int = 0) -> str:
    secret = _jwt_secret()
    if not secret:
        raise RuntimeError("JWT_SECRET no configurado")
    exp = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES)
    return pyjwt.encode(
        {"sub": user_id, "email": email, "tv": int(token_version or 0), "exp": int(exp.timestamp())},
        secret,
        algorithm="HS256",
    )


def _hash_refresh_token(token: str) -> str:
    secret = _jwt_secret() or get_settings().secret_key
    return sha256(f"refresh:{secret}:{token}".encode("utf-8")).hexdigest()


def _hash_reset_token(token: str) -> str:
    secret = _jwt_secret() or get_settings().secret_key
    return sha256(f"{secret}:{token}".encode("utf-8")).hexdigest()


def _hash_email_verification_token(token: str) -> str:
    secret = _jwt_secret() or get_settings().secret_key
    return sha256(f"verify:{secret}:{token}".encode("utf-8")).hexdigest()


def _password_reset_url(token: str) -> str:
    base_url = get_settings().password_reset_url.strip()
    separator = "&" if "?" in base_url else "?"
    return f"{base_url}{separator}{urlencode({'token': token})}"


def _email_verification_url(token: str) -> str:
    base_url = get_settings().email_verification_url.strip()
    separator = "&" if "?" in base_url else "?"
    return f"{base_url}{separator}{urlencode({'token': token})}"


@dataclass(frozen=True)
class AuthSessionBundle:
    access_token: str
    refresh_token: str
    user: AppUser
    remember_me: bool


def _csv_values(raw: str) -> list[str]:
    return [v.strip() for v in (raw or "").split(",") if v.strip()]


def _bool_claim(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower().strip() == "true"
    return False


async def _fetch_jwks(url: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, dict) or not isinstance(data.get("keys"), list):
                raise ValueError("jwks_invalid")
            return data
    except Exception as exc:
        logger.warning("No se pudieron obtener claves OIDC desde %s: %s", url, type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Login social no disponible temporalmente.",
        ) from exc


async def _verify_oidc_id_token(
    id_token: str,
    *,
    jwks_url: str,
    audiences: list[str],
    issuers: set[str],
    algorithms: list[str],
) -> dict:
    if not audiences:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Login social no configurado.",
        )
    try:
        header = pyjwt.get_unverified_header(id_token)
    except InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token social invalido.") from exc

    kid = header.get("kid")
    jwks = await _fetch_jwks(jwks_url)
    jwk = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if not jwk:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token social invalido.")

    try:
        key = PyJWK.from_dict(jwk).key
        payload = pyjwt.decode(
            id_token,
            key=key,
            algorithms=algorithms,
            audience=audiences,
            options={"verify_iss": False},
        )
    except InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token social invalido.") from exc

    if str(payload.get("iss") or "") not in issuers:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token social invalido.")
    if not payload.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token social invalido.")
    return payload


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.auth_repo = AuthRepository(db)
        self.profile_repo = ProfileRepository(db)

    async def _issue_session(self, user: AppUser, remember_me: bool) -> AuthSessionBundle:
        access_token = create_access_token(str(user.id), user.email, int(user.token_version or 0))
        refresh_token = token_urlsafe(48)
        expires_at = None if remember_me else _now_utc() + timedelta(days=TOKEN_DAYS)
        await self.auth_repo.create_refresh_token(
            user_id=user.id,
            token_hash=_hash_refresh_token(refresh_token),
            token_version=int(user.token_version or 0),
            expires_at=expires_at,
        )
        return AuthSessionBundle(
            access_token=access_token,
            refresh_token=refresh_token,
            user=user,
            remember_me=remember_me,
        )

    async def register(self, email: str, password: str, display_name: str | None, remember_me: bool = True) -> AuthSessionBundle:
        existing = await self.auth_repo.get_by_email(email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe una cuenta con este email",
            )
        user = await self.auth_repo.create(email, hash_password(password))
        uid_str = str(user.id)
        name = (display_name or "").strip() or email.split("@")[0]
        await self.profile_repo.create(user_id=uid_str, display_name=name)
        return await self._issue_session(user, remember_me)

    async def login(self, email: str, password: str, remember_me: bool = True) -> AuthSessionBundle:
        user = await self.auth_repo.get_by_email(email)
        if not user or not verify_password(password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Email o contraseña incorrectos",
            )
        return await self._issue_session(user, remember_me)

    async def refresh_session(self, refresh_token: str | None) -> AuthSessionBundle:
        if not refresh_token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")
        now = _now_utc()
        token_hash = _hash_refresh_token(refresh_token)
        stored = await self.auth_repo.get_refresh_token(token_hash)
        if not stored or stored.revoked_at is not None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesion expirada. Inicia sesion de nuevo.")
        if stored.expires_at is not None and stored.expires_at <= now:
            await self.auth_repo.revoke_refresh_token(token_hash, now)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesion expirada. Inicia sesion de nuevo.")

        user = await self.auth_repo.get_by_id(str(stored.user_id))
        if not user or int(stored.token_version or 0) != int(user.token_version or 0):
            await self.auth_repo.revoke_refresh_token(token_hash, now)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesion expirada. Inicia sesion de nuevo.")

        new_refresh = token_urlsafe(48)
        new_hash = _hash_refresh_token(new_refresh)
        await self.auth_repo.create_refresh_token(
            user_id=user.id,
            token_hash=new_hash,
            token_version=int(user.token_version or 0),
            expires_at=stored.expires_at,
        )
        await self.auth_repo.revoke_refresh_token(token_hash, now, replaced_by_hash=new_hash)
        return AuthSessionBundle(
            access_token=create_access_token(str(user.id), user.email, user.token_version),
            refresh_token=new_refresh,
            user=user,
            remember_me=stored.expires_at is None,
        )

    async def revoke_refresh_token(self, refresh_token: str | None) -> None:
        if not refresh_token:
            return
        await self.auth_repo.revoke_refresh_token(_hash_refresh_token(refresh_token), _now_utc())

    async def change_password(self, user_id: str, current_password: str, new_password: str) -> None:
        user = await self.auth_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")
        if not user.password_hash or not verify_password(current_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La contrasena actual no es correcta",
            )
        now = _now_utc()
        await self.auth_repo.update_password_hash_and_bump_token_version(user.id, hash_password(new_password))
        await self.auth_repo.revoke_refresh_tokens_for_user(user.id, now)

    async def oauth_login(self, provider: str, id_token: str, remember_me: bool = True, display_name: str | None = None) -> AuthSessionBundle:
        normalized_provider = provider.lower().strip()
        settings = get_settings()
        if normalized_provider == "google":
            claims = await _verify_oidc_id_token(
                id_token,
                jwks_url=_GOOGLE_JWKS_URL,
                audiences=_csv_values(settings.google_oauth_client_ids),
                issuers=_GOOGLE_ISSUERS,
                algorithms=["RS256"],
            )
            email_verified = _bool_claim(claims.get("email_verified"))
        elif normalized_provider == "apple":
            claims = await _verify_oidc_id_token(
                id_token,
                jwks_url=_APPLE_JWKS_URL,
                audiences=_csv_values(settings.apple_client_ids),
                issuers={_APPLE_ISSUER},
                algorithms=["RS256"],
            )
            email_verified = _bool_claim(claims.get("email_verified")) or bool(claims.get("email"))
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Proveedor social no soportado.")

        subject = str(claims.get("sub") or "").strip()
        email_raw = str(claims.get("email") or "").strip().lower()
        email = email_raw or f"{normalized_provider}-{subject}@oauth.local"
        name = (display_name or claims.get("name") or "").strip() or email.split("@")[0]

        identity = await self.auth_repo.get_identity(normalized_provider, subject)
        if identity:
            user = await self.auth_repo.get_by_id(str(identity.user_id))
            if not user:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Cuenta social no valida.")
            return await self._issue_session(user, remember_me)

        user = await self.auth_repo.get_by_email(email)
        if not user:
            user = await self.auth_repo.create(email, None)
            await self.profile_repo.create(user_id=str(user.id), display_name=name)
        elif user.password_hash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe una cuenta con este email. Inicia sesion con tu contrasena y vincula el proveedor social desde Ajustes.",
            )
        if email_verified and user.email_verified_at is None:
            await self.auth_repo.mark_email_verified(user.id, _now_utc())
            user.email_verified_at = _now_utc()

        await self.auth_repo.create_identity(
            user_id=user.id,
            provider=normalized_provider,
            provider_subject=subject,
            email=email_raw or None,
            email_verified=email_verified,
        )
        return await self._issue_session(user, remember_me)

    async def prepare_password_reset(self, email: str) -> tuple[str, str, int] | None:
        user = await self.auth_repo.get_by_email(email)
        if not user:
            return None

        now = _now_utc()
        settings = get_settings()
        expires_minutes = max(5, min(settings.password_reset_token_minutes, 120))
        token = token_urlsafe(32)
        await self.auth_repo.revoke_password_reset_tokens(user.id, now)
        await self.auth_repo.create_password_reset_token(
            user_id=user.id,
            token_hash=_hash_reset_token(token),
            expires_at=now + timedelta(minutes=expires_minutes),
        )
        return user.email, _password_reset_url(token), expires_minutes

    async def prepare_email_verification(self, email: str) -> tuple[str, str, int] | None:
        user = await self.auth_repo.get_by_email(email)
        if not user or user.email_verified_at is not None:
            return None

        now = _now_utc()
        settings = get_settings()
        expires_minutes = max(15, min(settings.email_verification_token_minutes, 10080))
        token = token_urlsafe(32)
        await self.auth_repo.revoke_email_verification_tokens(user.id, now)
        await self.auth_repo.create_email_verification_token(
            user_id=user.id,
            token_hash=_hash_email_verification_token(token),
            expires_at=now + timedelta(minutes=expires_minutes),
        )
        return user.email, _email_verification_url(token), expires_minutes

    async def request_email_verification(self, email: str) -> None:
        prepared = await self.prepare_email_verification(email)
        if not prepared:
            return
        recipient, verify_url, expires_minutes = prepared
        try:
            await send_email_verification_email(recipient, verify_url, expires_minutes)
        except Exception:
            logger.exception("No se pudo enviar email de verificacion a %s", anonymize_email_for_log(recipient))

    async def verify_email(self, token: str) -> None:
        now = _now_utc()
        verification = await self.auth_repo.consume_email_verification_token(
            _hash_email_verification_token(token),
            now,
        )
        if not verification:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El enlace de verificacion no es valido o ha caducado",
            )
        await self.auth_repo.mark_email_verified(verification.user_id, now)
        await self.auth_repo.revoke_email_verification_tokens(verification.user_id, now)

    async def request_password_reset(self, email: str) -> None:
        prepared = await self.prepare_password_reset(email)
        if not prepared:
            return
        recipient, reset_url, expires_minutes = prepared
        try:
            await send_password_reset_email(recipient, reset_url, expires_minutes)
        except Exception:
            logger.exception("No se pudo enviar email de recuperacion a %s", anonymize_email_for_log(recipient))

    async def reset_password(self, token: str, new_password: str) -> None:
        now = _now_utc()
        reset_token = await self.auth_repo.consume_password_reset_token(_hash_reset_token(token), now)
        if not reset_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El enlace de recuperacion no es valido o ha caducado",
            )

        await self.auth_repo.update_password_hash_and_bump_token_version(reset_token.user_id, hash_password(new_password))
        await self.auth_repo.revoke_refresh_tokens_for_user(reset_token.user_id, now)
        await self.auth_repo.revoke_password_reset_tokens(reset_token.user_id, now)
