"""Add composite index on activity_logs(user_id, date).

Revision ID: 20260609_activity_log_index
Revises: 20260608_meal_entry_indexes
Create Date: 2026-06-09

"""
from typing import Sequence, Union

from alembic import op


revision: str = "20260609_activity_log_index"
down_revision: Union[str, None] = "20260608_meal_entry_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_activity_logs_user_date",
        "activity_logs",
        ["user_id", "date"],
    )


def downgrade() -> None:
    op.drop_index("ix_activity_logs_user_date", table_name="activity_logs")
