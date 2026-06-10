"""Unificar ramas de migración (source + plan label).

Revision ID: 20260416_merge_heads
Revises: 20260413_source, 20260416_plan_label
Create Date: 2026-04-16

"""
from typing import Sequence, Tuple, Union

revision: str = "20260416_merge_heads"
down_revision: Union[str, Tuple[str, ...], None] = ("20260413_source", "20260416_plan_label")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
