import ssl
from typing import AsyncGenerator
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession, AsyncEngine

from app.core.config import get_settings


def _asyncpg_database_url(url: str) -> str:
    """
    asyncpg no acepta el parámetro sslmode que suelen llevar las URIs de Neon/Postgres.
    El SSL se configura en connect_args (_build_connect_args).
    """
    parsed = urlparse(url)
    if not parsed.query:
        return url
    q = parse_qs(parsed.query, keep_blank_values=True)
    q.pop("sslmode", None)
    if not q:
        return urlunparse(parsed._replace(query=""))
    return urlunparse(parsed._replace(query=urlencode(q, doseq=True)))

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _build_connect_args(database_url: str) -> dict:
    """Extra connect_args para asyncpg (p. ej. SSL con Neon)."""
    # Sin esto, una BD inalcanzable puede bloquear la petición HTTP >25s y el cliente muestra "sin conexión".
    args: dict = {
        "timeout": 15,
        "command_timeout": 25,
    }
    parsed = urlparse(database_url)
    query = parse_qs(parsed.query, keep_blank_values=True)
    sslmode = (query.get("sslmode") or [""])[0].strip().lower()
    lower = database_url.lower()
    if sslmode in {"require", "verify-ca", "verify-full"} or "neon.tech" in lower:
        ctx = ssl.create_default_context()
        args["ssl"] = ctx
    return args


def _get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        settings = get_settings()
        if not settings.database_url:
            raise RuntimeError(
                "DATABASE_URL no configurada. "
                "Copia .env.example a .env y rellena los valores."
            )
        raw_url = settings.database_url
        db_url = _asyncpg_database_url(raw_url)
        _engine = create_async_engine(
            db_url,
            echo=False,
            pool_pre_ping=True,
            pool_timeout=15,
            # Reciclar conexiones antes de que el pooler cierre por idle.
            pool_recycle=240,
            pool_size=5,
            max_overflow=10,
            connect_args=_build_connect_args(raw_url),
        )
    return _engine


def _get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            _get_engine(), class_=AsyncSession, expire_on_commit=False
        )
    return _session_factory


def get_async_session_maker() -> async_sessionmaker[AsyncSession]:
    """Factory para sesiones cortas (p. ej. no mantener BD abierta durante llamadas largas a la IA)."""
    return _get_session_factory()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    factory = _get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
