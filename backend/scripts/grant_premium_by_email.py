"""
Asigna subscription_tier = 'premium' al perfil vinculado a un email en app_users.

Uso (desde backend/, con DATABASE_URL y resto de .env cargado):
  python scripts/grant_premium_by_email.py correo@dominio.com

Idempotente: varias ejecuciones dejan el usuario en premium.
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
UPDATE profiles AS p
SET subscription_tier = 'premium',
    updated_at = (NOW() AT TIME ZONE 'UTC')::timestamp
FROM app_users AS u
WHERE p.user_id = u.id::text
  AND LOWER(TRIM(u.email)) = LOWER(TRIM(:email))
RETURNING p.user_id, p.subscription_tier
"""


async def main() -> None:
    if len(sys.argv) < 2:
        print("Uso: python scripts/grant_premium_by_email.py <email>", file=sys.stderr)
        sys.exit(1)
    email = sys.argv[1].strip()
    s = get_settings()
    if not (s.database_url or "").strip():
        print("DATABASE_URL no está configurado.", file=sys.stderr)
        sys.exit(1)
    url = _asyncpg_database_url(s.database_url)
    eng = create_async_engine(url, connect_args=_build_connect_args(s.database_url))
    async with eng.begin() as conn:
        result = await conn.execute(text(SQL), {"email": email})
        row = result.fetchone()
    await eng.dispose()
    if not row:
        print(f"No se actualizó ninguna fila. ¿Existe app_users con email {email!r} y su profile?")
        sys.exit(2)
    print(f"OK: user_id={row[0]} subscription_tier={row[1]}")


if __name__ == "__main__":
    asyncio.run(main())
