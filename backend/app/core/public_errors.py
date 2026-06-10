"""Respuestas HTTP al cliente: en producción, sin filtrar detalles internos (solo logs)."""

from __future__ import annotations

from app.core.config import get_settings


def _is_production() -> bool:
    return get_settings().environment.strip().lower() == "production"


MSG_500_PUBLIC = "Error interno del servidor. Inténtalo de nuevo más tarde."
MSG_502_PUBLIC = "El servicio externo no respondió. Inténtalo más tarde."
MSG_503_PUBLIC = "El servicio no está disponible temporalmente. Inténtalo más tarde."


def detail_500(exc: BaseException | None = None) -> str:
    if _is_production() or exc is None:
        return MSG_500_PUBLIC
    s = str(exc).strip()
    if len(s) > 400:
        s = s[:397] + "..."
    return f"{MSG_500_PUBLIC} [dev {type(exc).__name__}: {s}]"


def detail_502(exc: BaseException | None = None) -> str:
    if _is_production() or exc is None:
        return MSG_502_PUBLIC
    s = str(exc).strip()
    if len(s) > 400:
        s = s[:397] + "..."
    return f"{MSG_502_PUBLIC} [dev {type(exc).__name__}: {s}]"


def detail_503_upstream(exc: BaseException | None = None) -> str:
    """Fallo genérico tras excepción en chat/IA (no confundir con 503 de configuración)."""
    if _is_production() or exc is None:
        return MSG_503_PUBLIC
    s = str(exc).strip()
    if len(s) > 400:
        s = s[:397] + "..."
    return f"{MSG_503_PUBLIC} [dev {type(exc).__name__}: {s}]"
