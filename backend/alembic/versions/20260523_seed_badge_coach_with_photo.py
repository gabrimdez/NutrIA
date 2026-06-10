"""Semilla: insignia foto en chat NutriCoach (Más contexto).

Revision ID: 20260523_coach_with_photo_badge
Revises: 20260522_coach_session_7_badge
Create Date: 2026-04-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260523_coach_with_photo_badge"
down_revision: Union[str, None] = "20260522_coach_session_7_badge"
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
                   'coach-with-photo',
                   'Más contexto',
                   'Compartiste una foto con NutriCoach.',
                   'Enviar 1 foto en el chat.',
                   '/api/v1/me/badges/media/coach-with-photo',
                   'rara',
                   'coach_ia',
                   '{"type": "count_action", "action_kind": "coach_chat_photo", "target": 1}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'coach-with-photo')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'coach-with-photo')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'coach-with-photo')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'coach-with-photo'"))
