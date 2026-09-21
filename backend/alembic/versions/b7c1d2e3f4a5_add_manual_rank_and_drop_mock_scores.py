"""add applicant manual_rank and clear mock-generated scores

Revision ID: b7c1d2e3f4a5
Revises: 4e1a52675c62
Create Date: 2026-09-21 23:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7c1d2e3f4a5'
down_revision: Union[str, None] = '4e1a52675c62'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('applicants', sa.Column('manual_rank', sa.Integer(), nullable=True))
    # Scores without a real review behind them came from the removed mock scorer.
    op.execute(
        """
        UPDATE applicants
        SET communication_score = NULL, jd_overlap_score = NULL, linkedin_score = NULL,
            github_score = NULL, overall_score = NULL, ranked_at = NULL
        WHERE ai_review_details IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column('applicants', 'manual_rank')
