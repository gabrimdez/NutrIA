"""Semilla: insignia photo-analyzer (Foto analista).

Revision ID: 20260513_photo_analyzer_badge
Revises: 20260512_barcode_scanner_badge
Create Date: 2026-04-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260513_photo_analyzer_badge"
down_revision: Union[str, None] = "20260512_barcode_scanner_badge"
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
                   'photo-analyzer',
                   'Foto analista',
                   'Analizaste una comida por foto.',
                   'Analizar 3 comidas con foto.',
                   '/api/v1/me/badges/media/photo-analyzer',
                   'rara',
                   'exploracion',
                   '{"type": "count_action", "action_kind": "photo_analyze", "target": 3}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'photo-analyzer')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'photo-analyzer')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'photo-analyzer')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'photo-analyzer'"))
