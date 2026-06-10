"""Add intolerances and forbidden_foods columns to user_preferences.

Revision ID: 20260420_intol_forbidden
Revises: 20260417_user_settings
Create Date: 2026-04-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260420_intol_forbidden"
down_revision: str = "20260417_user_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_preferences", sa.Column("intolerances", sa.JSON(), nullable=True))
    op.add_column("user_preferences", sa.Column("forbidden_foods", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("user_preferences", "forbidden_foods")
    op.drop_column("user_preferences", "intolerances")
