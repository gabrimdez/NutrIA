"""
Asegura la columna diet_plans.label (Postgres).

Útil cuando el código ya mapea `label` pero la migración no se ha aplicado, o cuando
`alembic upgrade` falla por una fila en `alembic_version` que no coincide con los ficheros
del repo (p. ej. revisión local borrada).

Uso (desde la carpeta backend, con .env cargado):

    python scripts/ensure_diet_plan_label_column.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings
from app.db.session import _asyncpg_database_url, _build_connect_args

SQL = """
DO $body$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'diet_plans'
      AND column_name = 'label'
  ) THEN
    ALTER TABLE diet_plans ADD COLUMN label VARCHAR(200);
  END IF;
END $body$;
"""


async def main() -> None:
    settings = get_settings()
    raw = (settings.database_url or "").strip()
    if not raw:
        raise SystemExit("DATABASE_URL no está configurada (.env).")

    url = _asyncpg_database_url(raw)
    engine = create_async_engine(
        url,
        pool_pre_ping=True,
        connect_args=_build_connect_args(raw),
    )
    async with engine.begin() as conn:
        await conn.execute(text(SQL))
    await engine.dispose()
    print("OK: columna public.diet_plans.label verificada o creada.")


if __name__ == "__main__":
    asyncio.run(main())
