"""Semilla: insignia semana balanceada (macros + agua).

Revision ID: 20260527_balanced_week_badge
Revises: 20260526_versatile_logger_badge
Create Date: 2026-04-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260527_balanced_week_badge"
down_revision: Union[str, None] = "20260526_versatile_logger_badge"
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
                   'balanced-week',
                   'Semana balanceada',
                   'Tu semana estuvo equilibrada.',
                   '7 días: ≥80% de días cumpliendo macros (±10%) y agua ≥meta.',
                   '/api/v1/me/badges/media/balanced-week',
                   'legendaria',
                   'progreso_corporal',
                   '{"type": "balanced_week", "window_days": 7, "macro_margin_pct": 10, "min_day_fraction": 0.8, "water_glasses_goal": 12}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'balanced-week')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'balanced-week')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'balanced-week')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'balanced-week'"))
