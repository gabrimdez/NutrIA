"""Semilla: insignia progress-review-7d (Mirada al progreso).

Revision ID: 20260510_progress_review_7d_badge
Revises: 20260509_weigh_in_weekly_4_badge
Create Date: 2026-04-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260510_progress_review_7d_badge"
down_revision: Union[str, None] = "20260509_weigh_in_weekly_4_badge"
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
                   'progress-review-7d',
                   'Mirada al progreso',
                   'Revisaste tu resumen de 7 días.',
                   'Abrir / ver resumen 7 días al menos 1 vez.',
                   '/api/v1/me/badges/media/progress-review-7d',
                   'comun',
                   'progreso_corporal',
                   '{"type": "count_action", "action_kind": "progress_summary_viewed", "target": 1}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'progress-review-7d')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'progress-review-7d')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'progress-review-7d')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'progress-review-7d'"))
