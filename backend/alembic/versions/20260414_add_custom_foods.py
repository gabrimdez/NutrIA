"""Tabla custom_foods para alimentos personalizados del usuario.

Revision ID: 20260414_custom_foods
Revises: 20260413_eaten
Create Date: 2026-04-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "20260414_custom_foods"
down_revision: Union[str, None] = "20260413_eaten"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "custom_foods",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.String(), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("kcal_per_100g", sa.Float(), nullable=False),
        sa.Column("protein_per_100g", sa.Float(), nullable=False),
        sa.Column("carbs_per_100g", sa.Float(), nullable=False),
        sa.Column("fat_per_100g", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("custom_foods")
