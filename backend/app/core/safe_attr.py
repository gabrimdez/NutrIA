"""Safely access ORM model attributes even if migration hasn't run yet."""
from typing import Any


def safe_getattr(obj: Any, name: str, default: Any = None) -> Any:
    if obj is None:
        return default
    try:
        return getattr(obj, name, default)
    except Exception:
        return default
