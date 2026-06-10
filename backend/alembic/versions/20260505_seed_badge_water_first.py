"""Semilla: insignia water-first (Primer vaso).

Revision ID: 20260505_water_first_badge
Revises: 20260504_macro_goal_7x_badge
Create Date: 2026-04-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260505_water_first_badge"
down_revision: Union[str, None] = "20260504_macro_goal_7x_badge"
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
                   'water-first',
                   'Primer vaso',
                   'Registraste tu primer vaso de agua.',
                   'Registrar ≥1 vaso de agua en 1 día.',
                   '/api/v1/me/badges/media/water-first',
                   'comun',
                   'habitos',
                   '{"type": "water_days", "target": 1}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'water-first')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'water-first')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'water-first')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'water-first'"))
