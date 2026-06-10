import logging

from fastapi import APIRouter, Depends, HTTPException, status
import google.auth.transport.urllib3 as google_urllib3
import urllib3
from google.oauth2 import id_token as google_id_token
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db
from app.repositories.auth_repo import AuthRepository
from app.schemas.auth import OAuthTokenRequest, TokenResponse, UserPublic
from app.services.auth_service import AuthService, _now_utc

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)

_GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
_PROVIDER = "google"
_http_request = google_urllib3.Request(urllib3.PoolManager())


def _allowed_audiences() -> list[str]:
    raw = get_settings().google_oauth_client_ids or ""
    return [v.strip() for v in raw.split(",") if v.strip()]


def _verify_google_id_token(token: str) -> dict:
    audiences = _allowed_audiences()
    if not audiences:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Login con Google no configurado.",
        )
    try:
        # La librería solo acepta una audience; validamos manualmente para soportar
        # varios client IDs (web, iOS, Android) en la misma instalación.
        claims = google_id_token.verify_oauth2_token(token, _http_request)
    except ValueError as exc:
        logger.info("Google id_token invalido: %s", type(exc).__name__)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de Google invalido.") from exc

    if str(claims.get("iss") or "") not in _GOOGLE_ISSUERS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de Google invalido.")
    if claims.get("aud") not in audiences:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de Google invalido.")
    if not claims.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de Google invalido.")
    return claims


@router.post("/oauth/google", response_model=TokenResponse)
async def auth_google(data: OAuthTokenRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    claims = _verify_google_id_token(data.id_token)

    subject = str(claims.get("sub") or "").strip()
    email_raw = str(claims.get("email") or "").strip().lower()
    email = email_raw or f"{_PROVIDER}-{subject}@oauth.local"

    auth_repo = AuthRepository(db)

    identity = await auth_repo.get_identity(_PROVIDER, subject)
    if identity:
        user = await auth_repo.get_by_id(str(identity.user_id))
        if not user:
            logger.warning("Identidad Google huerfana encontrada: provider_subject=%s identity_id=%s", subject, identity.id)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Cuenta Google no valida.")
    else:
        user = await auth_repo.get_by_email(email)
        if user and user.password_hash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe una cuenta con este email. Inicia sesion con tu contrasena.",
            )
        if not user:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="El registro con Google no esta disponible todavia. Crea tu cuenta con email y contrasena.",
            )

        # Usuario existente sin password (cuenta social previa sin identidad vinculada).
        # Google siempre entrega tokens solo para emails verificados.
        if user.email_verified_at is None:
            now = _now_utc()
            await auth_repo.mark_email_verified(user.id, now)
            user.email_verified_at = now

        await auth_repo.create_identity(
            user_id=user.id,
            provider=_PROVIDER,
            provider_subject=subject,
            email=email_raw or None,
            email_verified=True,
        )

    bundle = await AuthService(db)._issue_session(user, data.remember_me)
    return TokenResponse(
        access_token=bundle.access_token,
        refresh_token=bundle.refresh_token,
        user=UserPublic(id=user.id, email=user.email, email_verified=bool(user.email_verified_at)),
    )
