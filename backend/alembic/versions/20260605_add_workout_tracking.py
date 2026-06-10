"""Add workout tracking tables.

Revision ID: 20260605_workout_tracking
Revises: 20260602_email_verify_rate
Create Date: 2026-06-05

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID


revision: str = "20260605_workout_tracking"
down_revision: Union[str, None] = "20260602_email_verify_rate"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workout_routines",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(10), nullable=False),
        sa.Column("sport_type", sa.String(100), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("days_per_week", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "workout_routine_days",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("routine_id", UUID(as_uuid=True), sa.ForeignKey("workout_routines.id", ondelete="CASCADE"), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )

    op.create_table(
        "workout_routine_exercises",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("routine_day_id", UUID(as_uuid=True), sa.ForeignKey("workout_routine_days.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("default_sets", sa.Integer(), nullable=True),
        sa.Column("default_reps", sa.String(50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    op.create_table(
        "workout_sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False, index=True),
        sa.Column("routine_id", UUID(as_uuid=True), sa.ForeignKey("workout_routines.id", ondelete="SET NULL"), nullable=True),
        sa.Column("routine_day_id", UUID(as_uuid=True), sa.ForeignKey("workout_routine_days.id", ondelete="SET NULL"), nullable=True),
        sa.Column("category", sa.String(10), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("day_label", sa.String(100), nullable=True),
        sa.Column("sport_type", sa.String(100), nullable=True),
        sa.Column("free_text", sa.Text(), nullable=True),
        sa.Column("completed", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_workout_sessions_user_date", "workout_sessions", ["user_id", "date"])
    op.create_index("ix_workout_sessions_user_category", "workout_sessions", ["user_id", "category"])

    op.create_table(
        "workout_session_exercises",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("workout_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    op.create_table(
        "workout_exercise_sets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("exercise_id", UUID(as_uuid=True), sa.ForeignKey("workout_session_exercises.id", ondelete="CASCADE"), nullable=False),
        sa.Column("set_number", sa.Integer(), nullable=False),
        sa.Column("reps", sa.Integer(), nullable=True),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("workout_exercise_sets")
    op.drop_table("workout_session_exercises")
    op.drop_table("workout_sessions")
    op.drop_table("workout_routine_exercises")
    op.drop_table("workout_routine_days")
    op.drop_table("workout_routines")
