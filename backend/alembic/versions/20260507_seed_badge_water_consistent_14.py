"""Semilla: insignia water-consistent-14 (Hábito hidratado).

Revision ID: 20260507_water_consistent_14_badge
Revises: 20260506_water_7_days_badge
Create Date: 2026-04-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260507_water_consistent_14_badge"
down_revision: Union[str, None] = "20260506_water_7_days_badge"
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
                   'water-consistent-14',
                   'Hábito hidratado',
                   '14 días cuidando tu hidratación.',
                   'Registrar agua en 14 días (≥2 vasos/día prom.).',
                   '/api/v1/me/badges/media/water-consistent-14',
                   'epica',
                   'habitos',
                   '{"type": "water_days", "target": 14, "min_glasses_per_day": 2}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'water-consistent-14')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'water-consistent-14')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'water-consistent-14')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'water-consistent-14'"))
