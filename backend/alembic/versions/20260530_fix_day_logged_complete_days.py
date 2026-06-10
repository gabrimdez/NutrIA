"""Alinea day-logged (Día completo) con criterio de producto: 3 comidas/día sin umbral kcal global.

Revision ID: 20260530_fix_day_logged
Revises: 20260529_fix_badge_cat
Create Date: 2026-04-24

"""
from typing import Sequence, Union

from alembic import op


revision: str = "20260530_fix_day_logged"
down_revision: Union[str, None] = "20260529_fix_badge_cat"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NEW_RULE = (
    '{"type": "complete_days", "target": 1, "min_real_meals": 3, '
    '"min_kcal_per_meal": 0, "min_minutes_between_meals": 15}'
)

_OLD_RULE = '{"type": "complete_days", "target": 1, "min_real_meals": 3}'


def upgrade() -> None:
    op.execute(
        f"UPDATE badge_definitions SET unlock_rule = '{_NEW_RULE}'::jsonb, "
        "updated_at = now() WHERE badge_id = 'day-logged'"
    )


def downgrade() -> None:
    op.execute(
        f"UPDATE badge_definitions SET unlock_rule = '{_OLD_RULE}'::jsonb, "
        "updated_at = now() WHERE badge_id = 'day-logged'"
    )
