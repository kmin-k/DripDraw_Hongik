"""initial tables

Revision ID: 36aa94336741
Revises:
Create Date: 2026-10-02 19:47:50.066909
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "36aa94336741"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "beans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("roaster", sa.String(length=100), nullable=True),
        sa.Column("region", sa.String(length=20), nullable=False),
        sa.Column("process", sa.String(length=10), nullable=False),
        sa.Column("roast_level", sa.String(length=10), nullable=False),
        sa.Column("memo", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "grind_analyses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bean_id", sa.Integer(), nullable=True),
        sa.Column("image_path", sa.String(length=300), nullable=False),
        sa.Column("d50_um", sa.Float(), nullable=False),
        sa.Column("guide_text", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["bean_id"],
            ["beans.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "recipes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bean_id", sa.Integer(), nullable=True),
        sa.Column("parent_recipe_id", sa.Integer(), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=True),
        sa.Column("source_brew_id", sa.Integer(), nullable=True),
        sa.Column("dose_g", sa.Integer(), nullable=False),
        sa.Column("drink_type", sa.String(length=10), nullable=False),
        sa.Column("d50_um", sa.Float(), nullable=True),
        sa.Column("total_water_g", sa.Float(), nullable=False),
        sa.Column("total_time_sec", sa.Integer(), nullable=False),
        sa.Column("target_curve", sa.JSON(), nullable=False),
        sa.Column("ratio", sa.Float(), nullable=True),
        sa.Column("water_temp_c", sa.Integer(), nullable=True),
        sa.Column("bloom_water_g", sa.Float(), nullable=True),
        sa.Column("bloom_wait_sec", sa.Integer(), nullable=True),
        sa.Column("flow_rate", sa.Float(), nullable=True),
        sa.Column("pour_plan", sa.JSON(), nullable=True),
        sa.Column("grind_guide", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["bean_id"],
            ["beans.id"],
        ),
        sa.ForeignKeyConstraint(
            ["parent_recipe_id"],
            ["recipes.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "brews",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("recipe_id", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=False),
        sa.Column("duration_sec", sa.Integer(), nullable=False),
        sa.Column("final_weight_g", sa.Float(), nullable=False),
        sa.Column("rmse", sa.Float(), nullable=True),
        sa.Column("actual_curve", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(
            ["recipe_id"],
            ["recipes.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "feedbacks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("brew_id", sa.Integer(), nullable=False),
        sa.Column("acidity", sa.String(length=10), nullable=False),
        sa.Column("bitterness", sa.String(length=10), nullable=False),
        sa.Column("strength", sa.String(length=10), nullable=False),
        sa.Column("suggested_recipe_id", sa.Integer(), nullable=True),
        sa.Column("applied", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["brew_id"],
            ["brews.id"],
        ),
        sa.ForeignKeyConstraint(
            ["suggested_recipe_id"],
            ["recipes.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("brew_id"),
    )


def downgrade() -> None:
    op.drop_table("feedbacks")
    op.drop_table("brews")
    op.drop_table("recipes")
    op.drop_table("grind_analyses")
    op.drop_table("beans")
