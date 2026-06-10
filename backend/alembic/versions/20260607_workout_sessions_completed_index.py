"""Add index on workout_sessions(user_id, completed).

Revision ID: 20260607_workout_sessions_completed_idx
Revises: 20260606_sessions_social_avatar
Create Date: 2026-06-07

"""
from typing import Sequence, Union

from alembic import op


revision: str = "20260607_workout_sessions_completed_idx"
down_revision: Union[str, None] = "20260606_sessions_social_avatar"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_workout_sessions_user_completed",
        "workout_sessions",
        ["user_id", "completed"],
    )


def downgrade() -> None:
    op.drop_index("ix_workout_sessions_user_completed", table_name="workout_sessions")
