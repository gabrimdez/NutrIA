"""Rate limiting opcional (slowapi) para rutas costosas."""

from __future__ import annotations

import ipaddress
from functools import wraps
from typing import Any, Callable

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.core.config import get_settings


def _first_valid_ip_from_x_forwarded_for(xff: str) -> str | None:
    """Primer IP válido en la cadena X-Forwarded-For (izquierda = cliente habitual)."""
    if not xff or not xff.strip():
        return None
    for part in xff.split(","):
        raw = part.strip()
        if not raw:
            continue
        host = raw.split("%", 1)[0].strip()
        try:
            addr = ipaddress.ip_address(host)
            return str(addr)
        except ValueError:
            continue
    return None


def rate_limit_client_ip(request: Request) -> str:
    """
    Clave de rate limit por cliente.

    Si ``rate_limit_trust_x_forwarded_for`` es True, usa el primer IP válido de
    ``X-Forwarded-For``. Solo activar detrás de un proxy que controle esa cabecera.
    """
    settings = get_settings()
    if settings.rate_limit_trust_x_forwarded_for:
        xff = request.headers.get("x-forwarded-for") or ""
        client = _first_valid_ip_from_x_forwarded_for(xff)
        if client:
            return client
    return get_remote_address(request)


limiter = Limiter(key_func=rate_limit_client_ip)


def limit_if_enabled(rate: str) -> Callable[[Any], Any]:
    """Aplica límite solo si `rate_limit_enabled` en settings (p. ej. tests con env false)."""

    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        limited = limiter.limit(rate)(func)

        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            if not get_settings().rate_limit_enabled:
                return await func(*args, **kwargs)
            return await limited(*args, **kwargs)

        return wrapper

    return decorator
