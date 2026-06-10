"""Semilla: insignia day-logged (Día completo: 3+ comidas en un día con reglas complete_days).

Revision ID: 20260427_day_logged_badge
Revises: 20260426_first_meal_badge
Create Date: 2026-04-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260427_day_logged_badge"
down_revision: Union[str, None] = "20260426_first_meal_badge"
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
                   'day-logged',
                   'Día completo',
                   'Completaste tu primer día registrado.',
                   'Registrar al menos 3 comidas en 1 día.',
                   '/api/v1/me/badges/media/day-logged',
                   'comun',
                   'diario',
                   '{"type": "complete_days", "target": 1, "min_real_meals": 3, '
                   '"min_kcal_per_meal": 0, "min_minutes_between_meals": 15}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'day-logged')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'day-logged')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'day-logged')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'day-logged'"))
