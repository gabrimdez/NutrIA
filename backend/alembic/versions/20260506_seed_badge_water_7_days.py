"""Semilla: insignia water-7-days (Hidratado).

Revision ID: 20260506_water_7_days_badge
Revises: 20260505_water_first_badge
Create Date: 2026-04-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260506_water_7_days_badge"
down_revision: Union[str, None] = "20260505_water_first_badge"
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
                   'water-7-days',
                   'Hidratado',
                   '7 días registrando agua.',
                   'Registrar agua en 7 días (≥1 vaso/día).',
                   '/api/v1/me/badges/media/water-7-days',
                   'rara',
                   'habitos',
                   '{"type": "water_days", "target": 7}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'water-7-days')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'water-7-days')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'water-7-days')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'water-7-days'"))
