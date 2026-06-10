"""Add source column to meal_entry_items for provider traceability.

Revision ID: 20260413_source
Revises: 20260413_eaten
Create Date: 2026-04-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260413_source"
down_revision: Union[str, None] = "20260413_eaten"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "meal_entry_items",
        sa.Column("source", sa.String(50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("meal_entry_items", "source")
