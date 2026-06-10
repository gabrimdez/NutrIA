"""Persistent sessions, social identities and DB avatars.

Revision ID: 20260606_sessions_social_avatar
Revises: 20260605_workout_tracking
Create Date: 2026-06-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID


revision: str = "20260606_sessions_social_avatar"
down_revision: Union[str, None] = "20260605_workout_tracking"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("app_users", "password_hash", existing_type=sa.String(length=255), nullable=True)

    op.create_table(
        "auth_identities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("provider_subject", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("provider", "provider_subject", name="uq_auth_identities_provider_subject"),
    )
    op.create_index("ix_auth_identities_user_id", "auth_identities", ["user_id"])

    op.create_table(
        "auth_refresh_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("token_version", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("replaced_by_hash", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_auth_refresh_tokens_user_id", "auth_refresh_tokens", ["user_id"])
    op.create_index("ix_auth_refresh_tokens_token_hash", "auth_refresh_tokens", ["token_hash"], unique=True)
    op.create_index("ix_auth_refresh_tokens_revoked_at", "auth_refresh_tokens", ["revoked_at"])

    op.create_table(
        "profile_avatars",
        sa.Column("asset_id", sa.String(length=32), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("mime_type", sa.String(length=50), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_profile_avatars_user_id", "profile_avatars", ["user_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_profile_avatars_user_id", table_name="profile_avatars")
    op.drop_table("profile_avatars")

    op.drop_index("ix_auth_refresh_tokens_revoked_at", table_name="auth_refresh_tokens")
    op.drop_index("ix_auth_refresh_tokens_token_hash", table_name="auth_refresh_tokens")
    op.drop_index("ix_auth_refresh_tokens_user_id", table_name="auth_refresh_tokens")
    op.drop_table("auth_refresh_tokens")

    op.drop_index("ix_auth_identities_user_id", table_name="auth_identities")
    op.drop_table("auth_identities")

    op.alter_column("app_users", "password_hash", existing_type=sa.String(length=255), nullable=False)
