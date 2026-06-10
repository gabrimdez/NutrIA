"""Add composite index on meal_entries(user_id, date) and index on meal_entry_items(meal_entry_id).

Revision ID: 20260608_meal_entry_indexes
Revises: 20260607_workout_sessions_completed_idx
Create Date: 2026-06-08

"""
from typing import Sequence, Union

from alembic import op


revision: str = "20260608_meal_entry_indexes"
down_revision: Union[str, None] = "20260607_workout_sessions_completed_idx"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_meal_entries_user_date",
        "meal_entries",
        ["user_id", "date"],
    )
    op.create_index(
        "ix_meal_entry_items_meal_entry_id",
        "meal_entry_items",
        ["meal_entry_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_meal_entry_items_meal_entry_id", table_name="meal_entry_items")
    op.drop_index("ix_meal_entries_user_date", table_name="meal_entries")
