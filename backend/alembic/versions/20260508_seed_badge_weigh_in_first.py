"""Semilla: insignia weigh-in-first (Punto de partida).

Revision ID: 20260508_weigh_in_first_badge
Revises: 20260507_water_consistent_14_badge
Create Date: 2026-04-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260508_weigh_in_first_badge"
down_revision: Union[str, None] = "20260507_water_consistent_14_badge"
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
                   'weigh-in-first',
                   'Punto de partida',
                   'Registraste tu primer peso.',
                   'Registrar peso 1 vez.',
                   '/api/v1/me/badges/media/weigh-in-first',
                   'comun',
                   'progreso_corporal',
                   '{"type": "weight_logs", "target": 1}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'weigh-in-first')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'weigh-in-first')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'weigh-in-first')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'weigh-in-first'"))
