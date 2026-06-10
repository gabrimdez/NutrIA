"""Semilla: insignia compras marcadas (Compras inteligentes).

Revision ID: 20260520_groceries_checked_badge
Revises: 20260519_grocery_list_made_badge
Create Date: 2026-04-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260520_groceries_checked_badge"
down_revision: Union[str, None] = "20260519_grocery_list_made_badge"
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
                   'groceries-checked',
                   'Compras inteligentes',
                   'Marcaste productos comprados.',
                   'Marcar ≥10 items como comprados en la lista.',
                   '/api/v1/me/badges/media/groceries-checked',
                   'rara',
                   'planificacion',
                   '{"type": "count_action", "action_kind": "groceries_item_checked", "target": 10}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'groceries-checked')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'groceries-checked')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'groceries-checked')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'groceries-checked'"))
