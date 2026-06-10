"""Preferencias de ajustes de app en user_preferences.

Revision ID: 20260417_user_settings
Revises: 20260416_water, 20260416_diet_plans_uv
Create Date: 2026-04-17

"""
from typing import Sequence, Tuple, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260417_user_settings"
down_revision: Union[str, Tuple[str, ...], None] = ("20260416_water", "20260416_diet_plans_uv")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_preferences", sa.Column("plan_preferences", sa.JSON(), nullable=True))
    op.add_column("user_preferences", sa.Column("notification_preferences", sa.JSON(), nullable=True))
    op.add_column("user_preferences", sa.Column("integration_preferences", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("user_preferences", "integration_preferences")
    op.drop_column("user_preferences", "notification_preferences")
    op.drop_column("user_preferences", "plan_preferences")
