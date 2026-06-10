"""Columna label en diet_plans (nombre mostrado del plan).

Revision ID: 20260416_plan_label
Revises: 20260414_recipes
Create Date: 2026-04-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260416_plan_label"
down_revision: Union[str, None] = "20260414_recipes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("diet_plans", sa.Column("label", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("diet_plans", "label")
