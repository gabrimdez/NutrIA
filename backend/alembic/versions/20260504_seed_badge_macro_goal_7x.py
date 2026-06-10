"""Semilla: insignia macro-goal-7x (En racha de macros).

Revision ID: 20260504_macro_goal_7x_badge
Revises: 20260503_macro_goal_hit_badge
Create Date: 2026-04-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260504_macro_goal_7x_badge"
down_revision: Union[str, None] = "20260503_macro_goal_hit_badge"
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
                   'macro-goal-7x',
                   'En racha de macros',
                   '7 días cumpliendo tus macros.',
                   'Cumplir macros (±10%) en 7 días (no necesariamente seguidos).',
                   '/api/v1/me/badges/media/macro-goal-7x',
                   'rara',
                   'diario',
                   '{"type": "macro_goal_days", "target": 7, "margin_pct": 10}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'macro-goal-7x')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'macro-goal-7x')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'macro-goal-7x')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'macro-goal-7x'"))
