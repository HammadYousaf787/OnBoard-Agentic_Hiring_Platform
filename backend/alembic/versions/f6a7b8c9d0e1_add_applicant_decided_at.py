"""add applicant decided_at

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-09-22 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('applicants', sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True))
    # Best available approximation for decisions made before this column existed.
    op.execute("UPDATE applicants SET decided_at = updated_at WHERE stage IN ('accepted', 'rejected')")


def downgrade() -> None:
    op.drop_column('applicants', 'decided_at')
