"""add interviewer review and HR assessment

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-09-22 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('appointments', sa.Column('interviewer_review', sa.Text(), nullable=True))
    op.add_column('appointments', sa.Column('interviewer_reviewed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('applicants', sa.Column('hr_score', sa.Float(), nullable=True))
    op.add_column('applicants', sa.Column('hr_notes', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('applicants', 'hr_notes')
    op.drop_column('applicants', 'hr_score')
    op.drop_column('appointments', 'interviewer_reviewed_at')
    op.drop_column('appointments', 'interviewer_review')
