"""Semilla: insignia first-meal-logged (Primera comida).

Revision ID: 20260426_first_meal_badge
Revises: 20260425_goal_set_badge
Create Date: 2026-04-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260426_first_meal_badge"
down_revision: Union[str, None] = "20260425_goal_set_badge"
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
                   'first-meal-logged',
                   'Primera comida',
                   'Registraste tu primera comida.',
                   'Registrar 1 comida (cualquier método).',
                   '/api/v1/me/badges/media/first-meal-logged',
                   'comun',
                   'diario',
                   '{"type": "count_action", "action_kind": "meal_logged", "target": 1}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'first-meal-logged')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'first-meal-logged')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'first-meal-logged')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'first-meal-logged'"))
