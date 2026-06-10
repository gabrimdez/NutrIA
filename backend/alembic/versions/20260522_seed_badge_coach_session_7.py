"""Semilla: insignia 7 mensajes NutriCoach (Consulta activa).

Revision ID: 20260522_coach_session_7_badge
Revises: 20260521_coach_first_chat_badge
Create Date: 2026-04-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260522_coach_session_7_badge"
down_revision: Union[str, None] = "20260521_coach_first_chat_badge"
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
                   'coach-session-7',
                   'Consulta activa',
                   '7 interacciones con NutriCoach.',
                   'Enviar ≥7 mensajes (en 1 o más sesiones).',
                   '/api/v1/me/badges/media/coach-session-7',
                   'rara',
                   'coach_ia',
                   '{"type": "coach_messages", "target": 7}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'coach-session-7')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'coach-session-7')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'coach-session-7')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'coach-session-7'"))
