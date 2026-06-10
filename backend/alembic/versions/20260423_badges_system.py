"""Insignias: definiciones, user_badges, destacadas, ledger, auditoría, flags.

Revision ID: 20260423_badges
Revises: 20260421_activity_burn, 20260421_sub_usage
Create Date: 2026-04-23

"""
from typing import Sequence, Union, Tuple

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


revision: str = "20260423_badges"
down_revision: Union[str, Tuple[str, ...], None] = ("20260421_activity_burn", "20260421_sub_usage")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "badge_definitions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("badge_id", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("unlock_criteria_text", sa.Text(), nullable=False),
        sa.Column("image_url", sa.String(length=500), nullable=True),
        sa.Column("rarity", sa.String(length=20), nullable=False),
        sa.Column("category", sa.String(length=30), nullable=False),
        sa.Column("unlock_rule", JSONB(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
    )
    op.create_index("ix_badge_definitions_badge_id", "badge_definitions", ["badge_id"], unique=True)

    op.create_table(
        "user_badges",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("badge_definition_id", UUID(as_uuid=True), nullable=False),
        sa.Column("unlocked_at", sa.DateTime(), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False, server_default="system"),
        sa.Column("progress_snapshot", JSONB(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("revoke_reason", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["badge_definition_id"], ["badge_definitions.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "badge_definition_id", name="uq_user_badges_user_badge"),
    )
    op.create_index("ix_user_badges_user_id", "user_badges", ["user_id"])

    op.create_table(
        "user_featured_badges",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("badge_definition_id", UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["badge_definition_id"], ["badge_definitions.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "position", name="uq_user_featured_badges_user_pos"),
        sa.UniqueConstraint("user_id", "badge_definition_id", name="uq_user_featured_badges_user_badge"),
    )
    op.create_index("ix_user_featured_badges_user_id", "user_featured_badges", ["user_id"])

    op.create_table(
        "badge_audit_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("actor", sa.String(length=50), nullable=False),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("badge_definition_id", UUID(as_uuid=True), nullable=True),
        sa.Column("details", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["badge_definition_id"], ["badge_definitions.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_badge_audit_log_user_id", "badge_audit_log", ["user_id"])

    op.create_table(
        "badge_review_flags",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("badge_definition_id", UUID(as_uuid=True), nullable=True),
        sa.Column("reason", sa.String(length=200), nullable=False),
        sa.Column("details", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["badge_definition_id"], ["badge_definitions.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_badge_review_flags_user_id", "badge_review_flags", ["user_id"])

    op.create_table(
        "badge_action_ledger",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("action_kind", sa.String(length=40), nullable=False),
        sa.Column("minute_bucket", sa.DateTime(), nullable=False),
        sa.Column("day_utc", sa.Date(), nullable=False),
        sa.Column("fingerprint", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("meta", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.UniqueConstraint(
            "user_id", "action_kind", "minute_bucket", "fingerprint",
            name="uq_badge_action_ledger_dedupe",
        ),
    )
    op.create_index(
        "ix_badge_action_ledger_user_day",
        "badge_action_ledger",
        ["user_id", "action_kind", "day_utc"],
    )


def downgrade() -> None:
    op.drop_index("ix_badge_action_ledger_user_day", table_name="badge_action_ledger")
    op.drop_table("badge_action_ledger")
    op.drop_index("ix_badge_review_flags_user_id", table_name="badge_review_flags")
    op.drop_table("badge_review_flags")
    op.drop_index("ix_badge_audit_log_user_id", table_name="badge_audit_log")
    op.drop_table("badge_audit_log")
    op.drop_index("ix_user_featured_badges_user_id", table_name="user_featured_badges")
    op.drop_table("user_featured_badges")
    op.drop_index("ix_user_badges_user_id", table_name="user_badges")
    op.drop_table("user_badges")
    op.drop_index("ix_badge_definitions_badge_id", table_name="badge_definitions")
    op.drop_table("badge_definitions")
