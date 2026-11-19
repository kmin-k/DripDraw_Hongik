"""experiment_trials 추가

사용자 실험의 시행 정보(참가자 코드, 단계, 화면 조건, 시행 번호, 유효 여부)를 추출 기록에 붙입니다.

Revision ID: 5cd4b2efb04e
Revises: 36aa94336741
Create Date: 2026-11-17 21:00:08.188242
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "5cd4b2efb04e"
down_revision: str | Sequence[str] | None = "36aa94336741"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "experiment_trials",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("brew_id", sa.Integer(), nullable=False),
        sa.Column("study", sa.String(length=10), nullable=False),
        sa.Column("participant_code", sa.String(length=10), nullable=False),
        sa.Column("stage", sa.String(length=10), nullable=False),
        sa.Column("condition", sa.Integer(), nullable=False),
        sa.Column("trial_no", sa.Integer(), nullable=False),
        sa.Column("valid", sa.Boolean(), nullable=False),
        sa.Column("note", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["brew_id"], ["brews.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("brew_id"),
    )
    with op.batch_alter_table("experiment_trials", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_experiment_trials_participant_code"), ["participant_code"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("experiment_trials", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_experiment_trials_participant_code"))

    op.drop_table("experiment_trials")
