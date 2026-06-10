"""Semilla: insignia 30-day-streak (Imparable).

Revision ID: 20260501_30_day_streak_badge
Revises: 20260430_14_day_streak_badge
Create Date: 2026-04-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260501_30_day_streak_badge"
down_revision: Union[str, None] = "20260430_14_day_streak_badge"
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
                   '30-day-streak',
                   'Imparable',
                   '30 días de constancia.',
                   '30 días consecutivos con ≥3 comidas/día.',
                   '/api/v1/me/badges/media/30-day-streak',
                   'epica',
                   'constancia',
                   '{"type": "streak_days", "target": 30, "min_meals_per_day": 3, "grace_days_after_calendar_day": 1}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = '30-day-streak')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = '30-day-streak')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = '30-day-streak')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = '30-day-streak'"))
