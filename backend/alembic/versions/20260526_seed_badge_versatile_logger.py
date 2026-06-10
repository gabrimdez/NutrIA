"""Semilla: insignia registro versátil (5 métodos en ledger).

Revision ID: 20260526_versatile_logger_badge
Revises: 20260525_premium_supporter_badge
Create Date: 2026-04-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260526_versatile_logger_badge"
down_revision: Union[str, None] = "20260525_premium_supporter_badge"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO badge_definitions (
                id, badge_id, name, description, unlock_criteria_text, image_url,
                rarity, category, unlock_rule, is_active, created_at, updated_at
            )
            SELECT gen_random_uuid(),
                   'versatile-logger',
                   'Registro versátil',
                   'Usaste 5 métodos de registro.',
                   'Registrar usando 5 métodos distintos.',
                   '/api/v1/me/badges/media/versatile-logger',
                   'epica',
                   'exploracion',
                   '{"type": "versatile_logger", "target": 5}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'versatile-logger')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'versatile-logger')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'versatile-logger')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'versatile-logger'"))
