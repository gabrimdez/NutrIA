"""Añade eaten a meal_entry_items (si se cuenta en totales del día).

Revision ID: 20260413_eaten
Revises:
Create Date: 2026-04-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260413_eaten"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "meal_entry_items",
        sa.Column("eaten", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.alter_column("meal_entry_items", "eaten", server_default=None)


def downgrade() -> None:
    op.drop_column("meal_entry_items", "eaten")
