"""Restricción única (user_id, version) en diet_plans.

Revision ID: 20260416_diet_plans_uv
Revises: 20260416_merge_heads
Create Date: 2026-04-16

"""
from typing import Sequence, Union

from alembic import op

revision: str = "20260416_diet_plans_uv"
down_revision: Union[str, None] = "20260416_merge_heads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Elimina duplicados conservando la fila con id lexicográficamente mayor (UUID).
    op.execute(
        """
        DELETE FROM diet_plans a
        WHERE EXISTS (
            SELECT 1 FROM diet_plans b
            WHERE b.user_id = a.user_id
              AND b.version = a.version
              AND b.id > a.id
        );
        """
    )
    op.create_unique_constraint(
        "uq_diet_plans_user_version",
        "diet_plans",
        ["user_id", "version"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_diet_plans_user_version", "diet_plans", type_="unique")
