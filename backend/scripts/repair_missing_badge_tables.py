"""
Repara DB con alembic_version en 20260422_act_est_burn pero sin tablas de 20260423_badges
(estado inconsistente: stamp o migración parcial).

Uso (desde backend/, venv activo):
  python scripts/repair_missing_badge_tables.py

Idempotente: solo crea tablas/índices si faltan.
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

# asyncpg: una sentencia por execute().
_STATEMENTS = [
    """
CREATE TABLE IF NOT EXISTS badge_definitions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    badge_id VARCHAR(80) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    unlock_criteria_text TEXT NOT NULL,
    image_url VARCHAR(500),
    rarity VARCHAR(20) NOT NULL,
    category VARCHAR(30) NOT NULL,
    unlock_rule JSONB,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
)
""",
    """
CREATE UNIQUE INDEX IF NOT EXISTS ix_badge_definitions_badge_id ON badge_definitions (badge_id)
""",
    """
CREATE TABLE IF NOT EXISTS user_badges (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR NOT NULL,
    badge_definition_id UUID NOT NULL REFERENCES badge_definitions(id) ON DELETE CASCADE,
    unlocked_at TIMESTAMP,
    source VARCHAR(20) NOT NULL DEFAULT 'system',
    progress_snapshot JSONB,
    revoked_at TIMESTAMP,
    revoke_reason TEXT,
    CONSTRAINT uq_user_badges_user_badge UNIQUE (user_id, badge_definition_id)
)
""",
    """
CREATE INDEX IF NOT EXISTS ix_user_badges_user_id ON user_badges (user_id)
""",
    """
CREATE TABLE IF NOT EXISTS user_featured_badges (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR NOT NULL,
    badge_definition_id UUID NOT NULL REFERENCES badge_definitions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    CONSTRAINT uq_user_featured_badges_user_pos UNIQUE (user_id, position),
    CONSTRAINT uq_user_featured_badges_user_badge UNIQUE (user_id, badge_definition_id)
)
""",
    """
CREATE INDEX IF NOT EXISTS ix_user_featured_badges_user_id ON user_featured_badges (user_id)
""",
    """
CREATE TABLE IF NOT EXISTS badge_audit_log (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    actor VARCHAR(50) NOT NULL,
    action VARCHAR(80) NOT NULL,
    user_id VARCHAR,
    badge_definition_id UUID REFERENCES badge_definitions(id) ON DELETE SET NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT now()
)
""",
    """
CREATE INDEX IF NOT EXISTS ix_badge_audit_log_user_id ON badge_audit_log (user_id)
""",
    """
CREATE TABLE IF NOT EXISTS badge_review_flags (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR NOT NULL,
    badge_definition_id UUID REFERENCES badge_definitions(id) ON DELETE SET NULL,
    reason VARCHAR(200) NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT now(),
    resolved_at TIMESTAMP
)
""",
    """
CREATE INDEX IF NOT EXISTS ix_badge_review_flags_user_id ON badge_review_flags (user_id)
""",
    """
CREATE TABLE IF NOT EXISTS badge_action_ledger (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR NOT NULL,
    action_kind VARCHAR(40) NOT NULL,
    minute_bucket TIMESTAMP NOT NULL,
    day_utc DATE NOT NULL,
    fingerprint VARCHAR(128) NOT NULL DEFAULT '',
    meta JSONB,
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT uq_badge_action_ledger_dedupe UNIQUE (user_id, action_kind, minute_bucket, fingerprint)
)
""",
    """
CREATE INDEX IF NOT EXISTS ix_badge_action_ledger_user_day ON badge_action_ledger (user_id, action_kind, day_utc)
""",
]


async def main() -> None:
    s = get_settings()
    url = _asyncpg_database_url(s.database_url)
    eng = create_async_engine(url, connect_args=_build_connect_args(s.database_url))
    async with eng.begin() as conn:
        reg = await conn.execute(
            text("SELECT to_regclass('public.badge_definitions') IS NOT NULL AS exists")
        )
        row = reg.fetchone()
        if row and row[0]:
            print("badge_definitions ya existe; no se repite DDL.")
            return
        for stmt in _STATEMENTS:
            await conn.execute(text(stmt.strip()))
        print("Tablas de insignias creadas (equivalente a 20260423_badges).")
    await eng.dispose()


if __name__ == "__main__":
    asyncio.run(main())
