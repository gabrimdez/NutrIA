"""Añade estimated_burn_kcal a activity_logs si falta.

Idempotente (`IF NOT EXISTS`) para ramas que ya tenían la columna vía 20260421_activity_burn.
Encadenada tras el merge de insignias para no dejar un segundo head de Alembic.

Revision ID: 20260422_act_est_burn (<=32 chars para alembic_version)
Revises: 20260423_badges
Create Date: 2026-04-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260422_act_est_burn"
down_revision: Union[str, None] = "20260423_badges"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "ALTER TABLE activity_logs "
            "ADD COLUMN IF NOT EXISTS estimated_burn_kcal DOUBLE PRECISION"
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text("ALTER TABLE activity_logs DROP COLUMN IF EXISTS estimated_burn_kcal")
    )
