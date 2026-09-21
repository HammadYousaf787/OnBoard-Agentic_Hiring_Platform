"""add coding_assessment applicant stage

Revision ID: c3d4e5f6a7b8
Revises: b7c1d2e3f4a5
Create Date: 2026-09-21 23:55:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b7c1d2e3f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE applicant_stage ADD VALUE IF NOT EXISTS 'coding_assessment' AFTER 'applied'")


def downgrade() -> None:
    # Postgres can't drop an enum value; leaving it unused is harmless.
    pass
