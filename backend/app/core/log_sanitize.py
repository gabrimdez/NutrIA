"""Redacción de campos sensibles en logs (cuerpos JSON, etc.)."""

from __future__ import annotations

import json
import hashlib
from typing import Any

_SENSITIVE_KEYS = frozenset(
    k.lower()
    for k in (
        "password",
        "token",
        "access_token",
        "refresh_token",
        "authorization",
        "secret",
        "api_key",
        "apikey",
        "client_secret",
    )
)


def mask_json_bytes_for_log(raw: bytes, max_len: int = 2000) -> str:
    """Intenta parsear JSON y enmascarar claves sensibles; si falla, devuelve texto truncado sin parsear."""
    if not raw:
        return ""
    try:
        text = raw.decode("utf-8", errors="replace")
    except Exception:
        return "<binary>"
    if len(text) > max_len * 2:
        text = text[: max_len * 2]
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return text[:max_len] + ("…" if len(text) > max_len else "")

    masked = _mask_obj(data)
    try:
        out = json.dumps(masked, ensure_ascii=False)
    except (TypeError, ValueError):
        out = str(masked)
    if len(out) > max_len:
        return out[: max_len - 1] + "…"
    return out


def _mask_obj(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: "***" if str(k).lower() in _SENSITIVE_KEYS else _mask_obj(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_mask_obj(x) for x in obj[:50]]
    return obj


def sanitize_validation_errors(errors: list) -> list:
    safe = _mask_validation_errors(errors)
    return safe if isinstance(safe, list) else []


def sanitize_validation_log_line(path: str, method: str, errors: list) -> str:
    """Una línea de log sin volcar contraseñas en bruto."""
    safe_errors = sanitize_validation_errors(errors)
    err_short = str(safe_errors)[:1500]
    return f"422 {method} {path} errors={err_short}"


def _mask_validation_errors(errors: Any) -> Any:
    if isinstance(errors, list):
        return [_mask_validation_errors(error) for error in errors[:50]]
    if not isinstance(errors, dict):
        return errors

    masked: dict[str, Any] = {}
    loc = errors.get("loc")
    loc_parts = [str(part).lower() for part in loc] if isinstance(loc, (list, tuple)) else []
    loc_is_sensitive = any(part in _SENSITIVE_KEYS or "password" in part or "token" in part for part in loc_parts)
    for key, value in errors.items():
        key_l = str(key).lower()
        if key_l == "input":
            masked[key] = "***"
        elif key_l in _SENSITIVE_KEYS or loc_is_sensitive:
            masked[key] = "***"
        elif key_l == "ctx" and isinstance(value, dict):
            # pydantic mete excepciones crudas (p. ej. ValueError de field_validator) en ctx.error;
            # no son JSON-serializables, así que las pasamos a string.
            masked[key] = {k: str(v) if isinstance(v, BaseException) else _mask_validation_errors(v) for k, v in value.items()}
        else:
            masked[key] = _mask_validation_errors(value)
    return masked


def anonymize_email_for_log(email: str | None) -> str:
    """Identificador estable para logs sin exponer el email completo."""
    normalized = (email or "").strip().lower()
    if not normalized or "@" not in normalized:
        return "<invalid-email>"
    domain = normalized.rsplit("@", 1)[-1]
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:12]
    return f"{digest}@{domain}"
