"""Add email verification and DB account rate limits.

Revision ID: 20260602_email_verify_rate
Revises: 20260601_user_token_ver
Create Date: 2026-04-27

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "20260602_email_verify_rate"
down_revision: Union[str, None] = "20260601_user_token_ver"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("app_users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE app_users SET email_verified_at = now() WHERE email_verified_at IS NULL")

    op.alter_column(
        "app_users",
        "created_at",
        type_=sa.DateTime(timezone=True),
        postgresql_using="created_at AT TIME ZONE 'UTC'",
    )
    op.alter_column(
        "password_reset_tokens",
        "expires_at",
        type_=sa.DateTime(timezone=True),
        postgresql_using="expires_at AT TIME ZONE 'UTC'",
    )
    op.alter_column(
        "password_reset_tokens",
        "used_at",
        type_=sa.DateTime(timezone=True),
        postgresql_using="used_at AT TIME ZONE 'UTC'",
    )
    op.alter_column(
        "password_reset_tokens",
        "created_at",
        type_=sa.DateTime(timezone=True),
        postgresql_using="created_at AT TIME ZONE 'UTC'",
    )

    op.create_table(
        "email_verification_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["app_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_email_verification_tokens_user_id"), "email_verification_tokens", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_email_verification_tokens_token_hash"),
        "email_verification_tokens",
        ["token_hash"],
        unique=True,
    )
    op.create_index(
        op.f("ix_email_verification_tokens_expires_at"),
        "email_verification_tokens",
        ["expires_at"],
        unique=False,
    )

    op.create_table(
        "account_rate_limits",
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("account_rate_limits")
    op.drop_index(op.f("ix_email_verification_tokens_expires_at"), table_name="email_verification_tokens")
    op.drop_index(op.f("ix_email_verification_tokens_token_hash"), table_name="email_verification_tokens")
    op.drop_index(op.f("ix_email_verification_tokens_user_id"), table_name="email_verification_tokens")
    op.drop_table("email_verification_tokens")

    op.alter_column(
        "password_reset_tokens",
        "created_at",
        type_=sa.DateTime(),
        postgresql_using="created_at AT TIME ZONE 'UTC'",
    )
    op.alter_column(
        "password_reset_tokens",
        "used_at",
        type_=sa.DateTime(),
        postgresql_using="used_at AT TIME ZONE 'UTC'",
    )
    op.alter_column(
        "password_reset_tokens",
        "expires_at",
        type_=sa.DateTime(),
        postgresql_using="expires_at AT TIME ZONE 'UTC'",
    )
    op.alter_column(
        "app_users",
        "created_at",
        type_=sa.DateTime(),
        postgresql_using="created_at AT TIME ZONE 'UTC'",
    )
    op.drop_column("app_users", "email_verified_at")
