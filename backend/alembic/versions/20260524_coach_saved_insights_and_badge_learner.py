"""Tabla coach_saved_insights + insignia Aprendiz (insights-learner).

Revision ID: 20260524_coach_insights_badge
Revises: 20260523_coach_with_photo_badge
Create Date: 2026-04-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = "20260524_coach_insights_badge"
down_revision: Union[str, None] = "20260523_coach_with_photo_badge"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "coach_saved_insights",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("source_chat_message_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(
            ["source_chat_message_id"],
            ["chat_messages.id"],
            ondelete="SET NULL",
        ),
    )
    op.create_index("ix_coach_saved_insights_user_id", "coach_saved_insights", ["user_id"])

    op.execute(
        sa.text(
            """
            INSERT INTO badge_definitions (
                id, badge_id, name, description, unlock_criteria_text, image_url,
                rarity, category, unlock_rule, is_active, created_at, updated_at
            )
            SELECT gen_random_uuid(),
                   'insights-learner',
                   'Aprendiz',
                   'Guardaste un insight del coach.',
                   'Guardar 3 insights / recomendaciones.',
                   '/api/v1/me/badges/media/insights-learner',
                   'epica',
                   'coach_ia',
                   '{"type": "count_action", "action_kind": "coach_insight_saved", "target": 3}'::jsonb,
                   true,
                   now(),
                   now()
            WHERE NOT EXISTS (SELECT 1 FROM badge_definitions bd WHERE bd.badge_id = 'insights-learner')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM user_featured_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'insights-learner')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM user_badges
            WHERE badge_definition_id IN (SELECT id FROM badge_definitions WHERE badge_id = 'insights-learner')
            """
        )
    )
    op.execute(sa.text("DELETE FROM badge_definitions WHERE badge_id = 'insights-learner'"))
    op.drop_index("ix_coach_saved_insights_user_id", table_name="coach_saved_insights")
    op.drop_table("coach_saved_insights")
