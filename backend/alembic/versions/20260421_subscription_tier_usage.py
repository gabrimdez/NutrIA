"""Perfil: subscription_tier; tabla user_feature_usage para cupos Free.

Revision ID: 20260421_sub_usage
Revises: 20260417_user_settings
Create Date: 2026-04-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260421_sub_usage"
down_revision: Union[str, None] = "20260417_user_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column(
            "subscription_tier",
            sa.String(length=20),
            nullable=False,
            server_default="free",
        ),
    )
    op.create_check_constraint(
        "ck_profiles_subscription_tier",
        "profiles",
        "subscription_tier IN ('free', 'premium')",
    )
    op.create_table(
        "user_feature_usage",
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("metric", sa.String(length=32), nullable=False),
        sa.Column("period_key", sa.String(length=32), nullable=False),
        sa.Column("used", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("user_id", "metric", "period_key", name="pk_user_feature_usage"),
    )
    op.create_index("ix_user_feature_usage_user_metric", "user_feature_usage", ["user_id", "metric"])


def downgrade() -> None:
    op.drop_index("ix_user_feature_usage_user_metric", table_name="user_feature_usage")
    op.drop_table("user_feature_usage")
    op.drop_constraint("ck_profiles_subscription_tier", "profiles", type_="check")
    op.drop_column("profiles", "subscription_tier")
