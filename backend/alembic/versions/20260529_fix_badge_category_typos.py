"""Normaliza category en badge_definitions (semillas con espacio o acento).

Revision ID: 20260529_fix_badge_cat
Revises: 20260528_widen_alembic_ver
Create Date: 2026-04-23

"""
from typing import Sequence, Union

from alembic import op


revision: str = "20260529_fix_badge_cat"
down_revision: Union[str, None] = "20260528_widen_alembic_ver"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE badge_definitions SET category = 'progreso_corporal' "
        "WHERE category = 'progreso corporal'"
    )
    # Semillas con acento (photo/barcode/food_searcher); API y enum usan sin tilde.
    op.execute(
        "UPDATE badge_definitions SET category = 'exploracion' WHERE category = 'exploración'"
    )


def downgrade() -> None:
    pass
