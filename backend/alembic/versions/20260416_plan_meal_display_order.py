"""Orden de comidas en el día (display_order).

Revision ID: 20260416_meal_order
Revises: 20260414_recipes
Create Date: 2026-04-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260416_meal_order"
down_revision: Union[str, None] = "20260414_recipes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "diet_plan_meals",
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute(
        sa.text(
            """
            WITH ranked AS (
              SELECT id, ROW_NUMBER() OVER (PARTITION BY day_id ORDER BY id) - 1 AS rn
              FROM diet_plan_meals
            )
            UPDATE diet_plan_meals m
            SET display_order = ranked.rn
            FROM ranked WHERE m.id = ranked.id
            """
        )
    )
    op.alter_column(
        "diet_plan_meals",
        "display_order",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("diet_plan_meals", "display_order")
