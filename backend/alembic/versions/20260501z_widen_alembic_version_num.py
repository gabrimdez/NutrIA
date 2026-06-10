"""Amplía alembic_version.version_num ANTES de revision_ids > 32 chars (p. ej. 20260502_*).

Revision ID: 20260501z_widen_alembic
Revises: 20260501_30_day_streak_badge
Create Date: 2026-04-23

"""
from typing import Sequence, Union

from alembic import op


revision: str = "20260501z_widen_alembic"
down_revision: Union[str, None] = "20260501_30_day_streak_badge"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128)")


def downgrade() -> None:
    pass
