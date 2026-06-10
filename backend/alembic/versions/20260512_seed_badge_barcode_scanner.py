"""Semilla: insignia barcode-scanner (Escáner).

Revision ID: 20260512_barcode_scanner_badge
Revises: 20260511_food_searcher_badge
Create Date: 2026-04-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260512_barcode_scanner_badge"
down_revision: Union[str, None] = "20260511_food_searcher_badge"
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
                   'barcode-scanner',
                   'Escáner',
                   'Escaneaste un código de barras.',
                   'Escanear 3 códigos de barras.',
                   '/api/v1/me/badges/media/barcode-scanner',
                   'rara',
                   'exploracion',
                   '{"type": "count_action", "action_kind": "barcode_scan", "target": 3}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'barcode-scanner')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'barcode-scanner')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'barcode-scanner')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'barcode-scanner'"))
