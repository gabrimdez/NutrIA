"""Add active_injuries JSON column to user_preferences.

Revision ID: 20260420_injuries
Revises: 20260420_intol_forbidden
Create Date: 2026-04-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260420_injuries"
down_revision: str = "20260420_intol_forbidden"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_preferences", sa.Column("active_injuries", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("user_preferences", "active_injuries")
