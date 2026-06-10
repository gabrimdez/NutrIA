"""Add estimated_burn_kcal to activity_logs.

Revision ID: 20260421_activity_burn
Revises: 20260420_integ_status
Create Date: 2026-04-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260421_activity_burn"
down_revision: str = "20260420_integ_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "activity_logs",
        sa.Column("estimated_burn_kcal", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("activity_logs", "estimated_burn_kcal")
