"""Semilla: insignia text-entry-master (Entrada libre).

Revision ID: 20260514_text_entry_master_badge
Revises: 20260513_photo_analyzer_badge
Create Date: 2026-04-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260514_text_entry_master_badge"
down_revision: Union[str, None] = "20260513_photo_analyzer_badge"
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
                   'text-entry-master',
                   'Entrada libre',
                   'Registraste con texto libre.',
                   'Registrar 5 alimentos/comidas con texto libre.',
                   '/api/v1/me/badges/media/text-entry-master',
                   'comun',
                   'exploracion',
                   '{"type": "count_action", "action_kind": "text_entry_meal", "target": 5}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'text-entry-master')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'text-entry-master')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'text-entry-master')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'text-entry-master'"))
