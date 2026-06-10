"""Add user token version for session invalidation.

Revision ID: 20260601_user_token_ver
Revises: 20260531_pwd_reset
Create Date: 2026-04-27

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260601_user_token_ver"
down_revision: Union[str, None] = "20260531_pwd_reset"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "app_users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("app_users", "token_version", server_default=None)


def downgrade() -> None:
    op.drop_column("app_users", "token_version")
