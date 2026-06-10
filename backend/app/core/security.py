import logging
import secrets

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt as pyjwt
from jwt import ExpiredSignatureError, InvalidTokenError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db
from app.repositories.auth_repo import AuthRepository

logger = logging.getLogger(__name__)
security_scheme = HTTPBearer(auto_error=False)
AUTH_COOKIE_NAME = "nutriforce_access_token"
REFRESH_COOKIE_NAME = "nutriforce_refresh_token"
CSRF_COOKIE_NAME = "nutriforce_csrf_token"
CSRF_HEADER_NAME = "x-csrf-token"
_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_MAX_JWT_BYTES = 8192


def _jwt_secret() -> str:
    return get_settings().jwt_secret.strip()


def decode_access_token(token: str) -> dict:
    """Valida JWT HS256 emitido por POST /api/v1/auth/login|register."""
    if not token or token.count(".") != 2 or len(token.encode("utf-8")) > _MAX_JWT_BYTES:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    secret = _jwt_secret()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Servidor sin JWT_SECRET configurado",
        )

    try:
        payload = pyjwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expirado")
    except InvalidTokenError as e:
        logger.debug("JWT verification failed: %s", e)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    return payload


def access_token_from_request(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None,
) -> str | None:
    if credentials and credentials.credentials:
        return credentials.credentials
    return request.cookies.get(AUTH_COOKIE_NAME)


def _cookie_auth_csrf_required(request: Request, credentials: HTTPAuthorizationCredentials | None) -> bool:
    return (
        getattr(request, "method", "GET").upper() in _UNSAFE_METHODS
        and not (credentials and credentials.credentials)
        and bool(request.cookies.get(AUTH_COOKIE_NAME))
    )


def require_cookie_csrf(request: Request, credentials: HTTPAuthorizationCredentials | None) -> None:
    if not _cookie_auth_csrf_required(request, credentials):
        return
    cookie_token = request.cookies.get(CSRF_COOKIE_NAME) or ""
    header_token = request.headers.get(CSRF_HEADER_NAME) or ""
    if not cookie_token or not header_token or not secrets.compare_digest(cookie_token, header_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token invalido",
        )


async def get_current_user_id(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> str:
    require_cookie_csrf(request, credentials)
    token = access_token_from_request(request, credentials)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado en token",
        )
    user = await AuthRepository(db).get_by_id(str(user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado",
        )
    token_version = int(payload.get("tv") or 0)
    if token_version != int(user.token_version or 0):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesion expirada. Inicia sesion de nuevo.",
        )
    if getattr(user, "email_verified_at", None) is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verifica tu email antes de continuar.",
        )
    return str(user_id)
