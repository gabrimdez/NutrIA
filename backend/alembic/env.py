import asyncio
import sys
from pathlib import Path

# Permite `alembic upgrade` sin definir PYTHONPATH (el paquete `app` vive en backend/).
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

from app.core.config import get_settings
from app.db.session import _asyncpg_database_url, _build_connect_args

_settings = get_settings()
_db_url = (_settings.database_url or "").strip()
if _db_url:
    config.set_main_option("sqlalchemy.url", _asyncpg_database_url(_db_url))

from app.db.base import Base
from app.models.models import *  # noqa: F401,F403

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    _connect_args = _build_connect_args(_db_url) if _db_url else {}
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=_connect_args,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
