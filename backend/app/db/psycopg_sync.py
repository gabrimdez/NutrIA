"""Conexión síncrona con psycopg (v3) usando la misma DATABASE_URL que asyncpg (Neon u otro Postgres)."""
from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Generator
from urllib.parse import parse_qs, unquote, urlencode, urlparse, urlunparse

import psycopg
from psycopg import OperationalError
from psycopg import Connection

from app.core.config import get_settings

_NEON_HOST = "neon.tech"


def asyncpg_url_to_psycopg(dsn: str) -> str:
    """
    Convierte postgresql+asyncpg://... en URI postgresql:// para herramientas que esperan URI.
    En hosts conocidos en la nube añade sslmode=require si no viene en la URL.
    """
    if not dsn or not dsn.strip():
        raise ValueError("DATABASE_URL vacía")
    s = dsn.strip()
    if s.startswith("postgresql+asyncpg://"):
        s = "postgresql://" + s.removeprefix("postgresql+asyncpg://")
    parsed = urlparse(s)
    host = (parsed.hostname or "").lower()
    query = parse_qs(parsed.query, keep_blank_values=True)
    if _NEON_HOST in host and "sslmode" not in query:
        query["sslmode"] = ["require"]
        new_query = urlencode(query, doseq=True)
        s = urlunparse(parsed._replace(query=new_query))
    return s


def _psycopg_connect_kwargs_from_url(dsn: str) -> dict[str, Any]:
    """Parámetros libpq explícitos (más predecibles que una sola URI, sobre todo en Windows)."""
    uri = asyncpg_url_to_psycopg(dsn)
    parsed = urlparse(uri)
    host = parsed.hostname or ""
    user = unquote(parsed.username or "")
    password = unquote(parsed.password or "")
    port = parsed.port or 5432
    path = (parsed.path or "").lstrip("/")
    dbname = path or "postgres"
    query = parse_qs(parsed.query, keep_blank_values=True)

    kwargs: dict[str, Any] = {
        "host": host,
        "port": port,
        "dbname": dbname,
        "user": user,
        "password": password,
        "connect_timeout": 15,
    }
    if query.get("sslmode"):
        kwargs["sslmode"] = query["sslmode"][0]
    else:
        h = host.lower()
        if _NEON_HOST in h:
            kwargs["sslmode"] = "require"
    if os.name == "nt":
        kwargs.setdefault("gssencmode", "disable")
    return kwargs


def psycopg_connect_from_settings() -> Connection:
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError(
            "DATABASE_URL no configurada. Copia .env.example a .env y rellena los valores."
        )
    kwargs = _psycopg_connect_kwargs_from_url(settings.database_url)
    try:
        return psycopg.connect(**kwargs)
    except OperationalError as e:
        msg = str(e)
        if "Tenant or user not found" in msg:
            raise RuntimeError(
                "El pooler no encontró el tenant (Tenant or user not found). "
                "Revisa que DATABASE_URL sea la cadena de conexión completa del panel de tu proveedor "
                "(usuario, host, puerto, base de datos y contraseña correctos)."
            ) from e
        raise


# Aliases for backward compatibility
asyncpg_url_to_psycopg2 = asyncpg_url_to_psycopg
psycopg2_connect_from_settings = psycopg_connect_from_settings


@contextmanager
def psycopg_connection() -> Generator[Connection, None, None]:
    conn = psycopg_connect_from_settings()
    try:
        yield conn
    finally:
        conn.close()


# Alias for backward compatibility
psycopg2_connection = psycopg_connection


if __name__ == "__main__":
    s = get_settings()
    u = asyncpg_url_to_psycopg(s.database_url) if s.database_url else ""
    p = urlparse(u)
    safe_user = p.username or "?"
    dbn = (p.path or "").lstrip("/") or "postgres"
    h = p.hostname or "?"
    print(f"Conectando como user={safe_user!r} host={h!r} port={p.port!r} dbname={dbn!r}")
    with psycopg_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
            print("OK:", cur.fetchone())
