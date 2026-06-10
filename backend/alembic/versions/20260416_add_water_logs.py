"""Tabla water_logs para tracking de vasos de agua diarios.

Revision ID: 20260416_water
Revises: 20260416_merge_heads
Create Date: 2026-04-16

"""
from typing import Sequence, Tuple, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "20260416_water"
down_revision: Union[str, Tuple[str, ...], None] = ("20260416_merge_heads", "20260416_meal_order")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "water_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.String(), nullable=False, index=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("glasses", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index(
        "uq_water_log_user_date", "water_logs", ["user_id", "date"], unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_water_log_user_date", table_name="water_logs")
    op.drop_table("water_logs")
