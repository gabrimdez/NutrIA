"""Tablas recipes y recipe_items para recetas compuestas del usuario.

Revision ID: 20260414_recipes
Revises: 20260414_custom_foods
Create Date: 2026-04-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "20260414_recipes"
down_revision: Union[str, None] = "20260414_custom_foods"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "recipes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.String(), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("servings", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("total_weight_g", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_kcal", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_protein_g", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_carbs_g", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_fat_g", sa.Float(), nullable=False, server_default="0"),
        sa.Column("icon", sa.String(10), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "recipe_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("recipe_id", UUID(as_uuid=True), sa.ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("food_catalog_id", UUID(as_uuid=True), sa.ForeignKey("food_catalog.id"), nullable=True),
        sa.Column("custom_name", sa.String(200), nullable=True),
        sa.Column("grams", sa.Float(), nullable=False),
        sa.Column("kcal", sa.Float(), nullable=False),
        sa.Column("protein_g", sa.Float(), nullable=False),
        sa.Column("carbs_g", sa.Float(), nullable=False),
        sa.Column("fat_g", sa.Float(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("recipe_items")
    op.drop_table("recipes")
