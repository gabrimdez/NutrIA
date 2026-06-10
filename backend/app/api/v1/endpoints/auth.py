import hmac
import logging
import secrets
import time
from hashlib import sha256

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.account_rate_limit import check_account_rate_limit
from app.db.session import get_db
from app.core.rate_limit import limit_if_enabled
from app.schemas.auth import (
    EmailVerificationConfirmRequest,
    EmailVerificationRequest,
    LoginRequest,
    LogoutRequest,
    MessageResponse,
    OAuthTokenRequest,
    PasswordChangeRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserPublic,
)
from app.core.config import get_settings
from app.core.log_sanitize import anonymize_email_for_log
from app.core.security import (
    AUTH_COOKIE_NAME,
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
    REFRESH_COOKIE_NAME,
    access_token_from_request,
    decode_access_token,
    get_current_user_id,
    require_cookie_csrf,
    security_scheme,
)
from app.repositories.auth_repo import AuthRepository
from app.services.auth_service import ACCESS_TOKEN_MINUTES, AuthService, PERSISTENT_REFRESH_COOKIE_DAYS, TOKEN_DAYS
from app.services.email_service import send_email_verification_email, send_password_reset_email

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)

_AUTH_MIN_RESPONSE_SECONDS = 0.35
_WEB_COOKIE_SESSION_TOKEN = "__web_cookie_session__"


def _email_key(prefix: str, email: str) -> str:
    normalized = email.lower().strip()
    secret = get_settings().secret_key.encode("utf-8")
    digest = hmac.new(secret, normalized.encode("utf-8"), sha256).hexdigest()[:32]
    return f"{prefix}:{digest}"


def _token_key(prefix: str, token: str) -> str:
    digest = sha256(token.encode("utf-8")).hexdigest()[:32]
    return f"{prefix}:{digest}"


async def _sleep_until_min_elapsed(start: float) -> None:
    remaining = _AUTH_MIN_RESPONSE_SECONDS - (time.monotonic() - start)
    if remaining > 0:
        import asyncio

        await asyncio.sleep(remaining)


async def _send_reset_email_safe(recipient: str, reset_url: str, expires_minutes: int) -> None:
    try:
        await send_password_reset_email(recipient, reset_url, expires_minutes)
    except Exception:
        logger.exception("No se pudo enviar email de recuperacion a %s", anonymize_email_for_log(recipient))


async def _send_verification_email_safe(recipient: str, verify_url: str, expires_minutes: int) -> None:
    try:
        await send_email_verification_email(recipient, verify_url, expires_minutes)
    except Exception:
        logger.exception("No se pudo enviar email de verificacion a %s", anonymize_email_for_log(recipient))


def _token_for_response(request: Request, token: str) -> str:
    return token


def _refresh_for_response(request: Request, token: str) -> str | None:
    return token


def _require_csrf_token_pair(request: Request) -> None:
    cookie_token = request.cookies.get(CSRF_COOKIE_NAME) or ""
    header_token = request.headers.get(CSRF_HEADER_NAME) or ""
    if not cookie_token or not header_token or not secrets.compare_digest(cookie_token, header_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF token invalido")


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str, remember_me: bool) -> None:
    secure = get_settings().environment.lower() == "production"
    # cross-origin (frontend en dominio distinto): SameSite=None requiere Secure=True
    samesite = "none" if secure else "lax"
    csrf_token = secrets.token_urlsafe(32)
    refresh_max_age = (
        PERSISTENT_REFRESH_COOKIE_DAYS * 24 * 60 * 60
        if remember_me
        else TOKEN_DAYS * 24 * 60 * 60
    )
    response.set_cookie(
        AUTH_COOKIE_NAME,
        access_token,
        max_age=ACCESS_TOKEN_MINUTES * 60,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path="/",
    )
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        refresh_token,
        max_age=refresh_max_age,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path="/",
    )
    response.set_cookie(
        CSRF_COOKIE_NAME,
        csrf_token,
        max_age=refresh_max_age,
        httponly=False,
        secure=secure,
        samesite=samesite,
        path="/",
    )


def _clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(AUTH_COOKIE_NAME, path="/")
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")


def _token_response(request: Request, bundle) -> TokenResponse:
    user = bundle.user
    return TokenResponse(
        access_token=_token_for_response(request, bundle.access_token),
        refresh_token=_refresh_for_response(request, bundle.refresh_token),
        user=UserPublic(id=user.id, email=user.email, email_verified=bool(user.email_verified_at)),
    )


@router.post("/register", response_model=TokenResponse)
@limit_if_enabled("10/minute")
async def register(
    request: Request,
    response: Response,
    data: RegisterRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    await check_account_rate_limit(db, _email_key("register", str(data.email)), limit=3, window_seconds=3600)
    service = AuthService(db)
    try:
        bundle = await service.register(data.email, data.password, data.display_name, remember_me=True)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_409_CONFLICT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se pudo crear la cuenta con esos datos",
            )
        raise
    prepared = await service.prepare_email_verification(bundle.user.email)
    if prepared:
        background_tasks.add_task(_send_verification_email_safe, *prepared)
    _set_auth_cookies(response, bundle.access_token, bundle.refresh_token, bundle.remember_me)
    return _token_response(request, bundle)


@router.post("/login", response_model=TokenResponse)
@limit_if_enabled("10/minute")
async def login(request: Request, response: Response, data: LoginRequest, db: AsyncSession = Depends(get_db)):
    await check_account_rate_limit(db, _email_key("login", str(data.email)), limit=8, window_seconds=900)
    service = AuthService(db)
    bundle = await service.login(data.email, data.password, remember_me=data.remember_me)
    _set_auth_cookies(response, bundle.access_token, bundle.refresh_token, bundle.remember_me)
    return _token_response(request, bundle)


@router.post("/refresh", response_model=TokenResponse)
@limit_if_enabled("30/minute")
async def refresh(
    request: Request,
    response: Response,
    data: RefreshRequest | None = Body(default=None),
    db: AsyncSession = Depends(get_db),
):
    refresh_token = data.refresh_token if data else None
    cookie_refresh = request.cookies.get(REFRESH_COOKIE_NAME)
    if not refresh_token and cookie_refresh:
        _require_csrf_token_pair(request)
        refresh_token = cookie_refresh
    service = AuthService(db)
    bundle = await service.refresh_session(refresh_token)
    _set_auth_cookies(response, bundle.access_token, bundle.refresh_token, bundle.remember_me)
    return _token_response(request, bundle)


@router.post("/oauth/google", response_model=TokenResponse)
@limit_if_enabled("10/minute")
async def oauth_google(
    request: Request,
    response: Response,
    data: OAuthTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    await check_account_rate_limit(db, _token_key("oauth-google", data.id_token), limit=12, window_seconds=900)
    bundle = await AuthService(db).oauth_login("google", data.id_token, data.remember_me, data.display_name)
    _set_auth_cookies(response, bundle.access_token, bundle.refresh_token, bundle.remember_me)
    return _token_response(request, bundle)


@router.post("/oauth/apple", response_model=TokenResponse)
@limit_if_enabled("10/minute")
async def oauth_apple(
    request: Request,
    response: Response,
    data: OAuthTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    await check_account_rate_limit(db, _token_key("oauth-apple", data.id_token), limit=12, window_seconds=900)
    bundle = await AuthService(db).oauth_login("apple", data.id_token, data.remember_me, data.display_name)
    _set_auth_cookies(response, bundle.access_token, bundle.refresh_token, bundle.remember_me)
    return _token_response(request, bundle)


@router.post("/password/forgot", response_model=MessageResponse)
@limit_if_enabled("5/minute")
async def forgot_password(
    request: Request,
    data: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    start = time.monotonic()
    await check_account_rate_limit(db, _email_key("forgot", str(data.email)), limit=3, window_seconds=3600)
    service = AuthService(db)
    prepared = await service.prepare_password_reset(data.email)
    if prepared:
        background_tasks.add_task(_send_reset_email_safe, *prepared)
    await _sleep_until_min_elapsed(start)
    return MessageResponse(message="Si el email existe, recibiras un enlace para recuperar tu contrasena")


@router.post("/password/change", response_model=MessageResponse)
@limit_if_enabled("5/minute")
async def change_password(
    request: Request,
    response: Response,
    data: PasswordChangeRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = AuthService(db)
    await service.change_password(user_id, data.current_password, data.new_password)
    _clear_auth_cookie(response)
    return MessageResponse(message="Contrasena actualizada. Inicia sesion de nuevo.")


@router.post("/password/reset", response_model=MessageResponse)
@limit_if_enabled("10/minute")
async def reset_password(
    request: Request,
    data: PasswordResetConfirmRequest,
    db: AsyncSession = Depends(get_db),
):
    await check_account_rate_limit(db, _token_key("reset", data.token), limit=8, window_seconds=900)
    service = AuthService(db)
    await service.reset_password(data.token, data.new_password)
    return MessageResponse(message="Contrasena actualizada correctamente")


@router.post("/email/resend-verification", response_model=MessageResponse)
@limit_if_enabled("5/minute")
async def resend_email_verification(
    request: Request,
    data: EmailVerificationRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    start = time.monotonic()
    await check_account_rate_limit(db, _email_key("verify", str(data.email)), limit=3, window_seconds=3600)
    service = AuthService(db)
    prepared = await service.prepare_email_verification(data.email)
    if prepared:
        background_tasks.add_task(_send_verification_email_safe, *prepared)
    await _sleep_until_min_elapsed(start)
    return MessageResponse(message="Si el email existe, recibiras un enlace de verificacion")


@router.post("/email/verify", response_model=MessageResponse)
@limit_if_enabled("10/minute")
async def verify_email(request: Request, data: EmailVerificationConfirmRequest, db: AsyncSession = Depends(get_db)):
    await check_account_rate_limit(db, _token_key("email-verify", data.token), limit=8, window_seconds=900)
    service = AuthService(db)
    await service.verify_email(data.token)
    return MessageResponse(message="Email verificado correctamente")


@router.get("/session", response_model=UserPublic)
async def session(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
):
    token = access_token_from_request(request, credentials)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")
    payload = decode_access_token(token)
    user = await AuthRepository(db).get_by_id(str(payload.get("sub") or ""))
    if not user or int(payload.get("tv") or 0) != int(user.token_version or 0):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")
    return UserPublic(id=user.id, email=user.email, email_verified=bool(user.email_verified_at))


@router.post("/logout", response_model=MessageResponse)
async def logout(
    request: Request,
    response: Response,
    data: LogoutRequest | None = Body(default=None),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
):
    if request.cookies.get(REFRESH_COOKIE_NAME):
        _require_csrf_token_pair(request)
    else:
        require_cookie_csrf(request, credentials)
    refresh_token = data.refresh_token if data else None
    refresh_token = refresh_token or request.cookies.get(REFRESH_COOKIE_NAME)
    await AuthService(db).revoke_refresh_token(refresh_token)
    _clear_auth_cookie(response)
    return MessageResponse(message="Sesion cerrada")
