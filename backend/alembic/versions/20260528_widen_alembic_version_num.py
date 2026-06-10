"""Amplía alembic_version.version_num: revision IDs de insignias superan VARCHAR(32).

Revision ID: 20260528_widen_alembic_ver
Revises: 20260527_balanced_week_badge
Create Date: 2026-04-23

"""
from typing import Sequence, Union

from alembic import op


revision: str = "20260528_widen_alembic_ver"
down_revision: Union[str, None] = "20260527_balanced_week_badge"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128)")


def downgrade() -> None:
    # No encoger a VARCHAR(32): rompería revision_ids largas ya en alembic_version.
    pass
