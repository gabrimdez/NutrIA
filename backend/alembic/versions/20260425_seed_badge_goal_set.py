"""Semilla: insignia goal-set (Objetivo claro).

Revision ID: 20260425_goal_set_badge
Revises: 20260424_onboarding_badge
Create Date: 2026-04-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260425_goal_set_badge"
down_revision: Union[str, None] = "20260424_onboarding_badge"
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
                   'goal-set',
                   'Objetivo claro',
                   'Tienes un objetivo definido.',
                   'Establecer / confirmar un objetivo',
                   '/api/v1/me/badges/media/goal-set',
                   'comun',
                   'planificacion',
                   '{"type": "active_goal"}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'goal-set')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'goal-set')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'goal-set')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'goal-set'"))
