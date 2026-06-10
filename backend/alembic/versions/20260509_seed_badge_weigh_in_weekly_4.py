"""Semilla: insignia weigh-in-weekly-4 (Constancia de peso).

Revision ID: 20260509_weigh_in_weekly_4_badge
Revises: 20260508_weigh_in_first_badge
Create Date: 2026-04-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260509_weigh_in_weekly_4_badge"
down_revision: Union[str, None] = "20260508_weigh_in_first_badge"
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
                   'weigh-in-weekly-4',
                   'Constancia de peso',
                   '4 semanas de pesaje.',
                   'Registrar peso 4 semanas consecutivas.',
                   '/api/v1/me/badges/media/weigh-in-weekly-4',
                   'rara',
                   'progreso_corporal',
                   '{"type": "weight_week_streak", "target": 4}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'weigh-in-weekly-4')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'weigh-in-weekly-4')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'weigh-in-weekly-4')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'weigh-in-weekly-4'"))
