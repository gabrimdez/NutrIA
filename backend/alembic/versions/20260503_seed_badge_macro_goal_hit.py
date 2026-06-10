"""Semilla: insignia macro-goal-hit (En el objetivo).

Revision ID: 20260503_macro_goal_hit_badge
Revises: 20260502_nutrition_streak_60_badge
Create Date: 2026-04-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260503_macro_goal_hit_badge"
down_revision: Union[str, None] = "20260502_nutrition_streak_60_badge"
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
                   'macro-goal-hit',
                   'En el objetivo',
                   'Alcanzaste tus macros del día.',
                   'Cumplir macros (dentro de ±10%) en 1 día.',
                   '/api/v1/me/badges/media/macro-goal-hit',
                   'comun',
                   'diario',
                   '{"type": "macro_goal_days", "target": 1, "margin_pct": 10}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'macro-goal-hit')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'macro-goal-hit')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'macro-goal-hit')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'macro-goal-hit'"))
