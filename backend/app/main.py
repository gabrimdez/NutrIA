import logging
import re
import traceback
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.log_sanitize import sanitize_validation_errors, sanitize_validation_log_line
from app.core.rate_limit import limiter

settings = get_settings()
_IS_PRODUCTION = settings.environment.lower() == "production"
_PLACEHOLDER_SECRETS = {"", "change-me-in-production", "your-secret-key", "your-jwt-secret"}


def _require_https_in_production(name: str, value: str) -> None:
    if not _IS_PRODUCTION:
        return
    parsed = urlparse((value or "").strip())
    if parsed.scheme != "https":
        raise RuntimeError(f"{name} debe usar HTTPS en production")


def _is_weak_secret(value: str) -> bool:
    secret = (value or "").strip()
    lowered = secret.lower()
    return len(secret) < 32 or lowered in _PLACEHOLDER_SECRETS or lowered.startswith("your-")


def _require_strong_secret_in_production(name: str, value: str) -> None:
    if _IS_PRODUCTION and _is_weak_secret(value):
        raise RuntimeError(f"{name} debe ser un secreto aleatorio de al menos 32 caracteres en production")


def _cors_extra_origins(raw: str, is_production: bool) -> list[str]:
    origins = [o.strip() for o in (raw or "").split(",") if o.strip()]
    if not is_production:
        return origins
    for origin in origins:
        parsed = urlparse(origin)
        if (
            origin == "*"
            or parsed.scheme != "https"
            or not parsed.netloc
            or parsed.path not in ("", "/")
            or parsed.params
            or parsed.query
            or parsed.fragment
        ):
            raise RuntimeError("CORS_ORIGINS solo puede contener origenes HTTPS explicitos en production")
    return origins


def _docs_kwargs(is_production: bool) -> dict[str, str | None]:
    if is_production:
        return {"docs_url": None, "redoc_url": None, "openapi_url": None}
    return {"docs_url": "/docs", "redoc_url": "/redoc", "openapi_url": "/openapi.json"}


_require_https_in_production("BACKEND_URL", settings.backend_url)
_require_https_in_production("PASSWORD_RESET_URL", settings.password_reset_url)
_require_https_in_production("EMAIL_VERIFICATION_URL", settings.email_verification_url)
_require_strong_secret_in_production("JWT_SECRET", settings.jwt_secret)
_require_strong_secret_in_production("SECRET_KEY", settings.secret_key)

_secret = settings.jwt_secret.strip()
if not _IS_PRODUCTION and _is_weak_secret(_secret):
    logging.warning(
        "JWT_SECRET no está configurado o es un placeholder. "
        "La API rechazará la autenticación (401). Genera un secreto largo y añádelo al .env."
    )

logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

app = FastAPI(
    title="NutrIA API",
    description="API de nutrición y entrenamiento enfocada en fuerza e hipertrofia",
    version="1.0.0",
    **_docs_kwargs(_IS_PRODUCTION),
)

@app.exception_handler(RequestValidationError)
async def _validation_error_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    line = sanitize_validation_log_line(request.url.path, request.method, errors)
    logging.getLogger("validation").error(line)
    return JSONResponse(status_code=422, content={"detail": sanitize_validation_errors(errors)})

# Expo Web: origen suele ser http://localhost:8080 y API en http://127.0.0.1:8000 (cross-origin).
# Con Authorization hace falta preflight; reflejamos el Origin con regex (mejor que "*" en algunos casos).
# allow_credentials=True + "*" sigue siendo inválido en navegadores; JWT va en Authorization.
_cors_dev_origins = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:19006",
    "http://127.0.0.1:19006",
]
_cors_extra = _cors_extra_origins(settings.cors_origins, _IS_PRODUCTION)
_cors_allow_origins = set((_cors_dev_origins if not _IS_PRODUCTION else []) + _cors_extra)
# En desarrollo, Expo Web por IP LAN (p. ej. WSL2 172.16–31.x, Wi‑Fi 192.168.x) debe pasar preflight OPTIONS.
_cors_origin_regex = (
    r"https?://("
    r"(localhost|127\.0\.0\.1)|"
    r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
    r"192\.168\.\d{1,3}\.\d{1,3}|"
    r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
    r")(:\d+)?$"
    if not _IS_PRODUCTION
    else None
)
_cors_origin_pattern = re.compile(_cors_origin_regex) if _cors_origin_regex else None
# CORS el último add_middleware = capa más externa (preflight antes que rate limit).
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_cors_allow_origins),
    allow_origin_regex=_cors_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token", "X-Client-Platform"],
)


def _is_allowed_cors_origin(origin: str) -> bool:
    if not origin:
        return False
    if origin in _cors_allow_origins:
        return True
    return _cors_origin_pattern.fullmatch(origin) is not None if _cors_origin_pattern else False


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """Respuesta JSON acorde al resto de la API (slowapi devuelve plain por defecto)."""
    return JSONResponse(
        status_code=429,
        content={"detail": "Demasiadas peticiones. Inténtalo más tarde."},
    )

@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    logging.getLogger("uvicorn.error").error(
        "Unhandled %s on %s %s\n%s",
        type(exc).__name__,
        request.method,
        request.url.path,
        traceback.format_exc(),
    )
    origin = request.headers.get("origin", "")
    headers: dict[str, str] = {}
    if _is_allowed_cors_origin(origin):
        headers["access-control-allow-origin"] = origin
        headers["access-control-allow-credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=headers,
    )

app.include_router(api_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}
