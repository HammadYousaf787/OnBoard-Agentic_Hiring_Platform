"""add live AI assistance flag and interview insights

Revision ID: a1b2c3d4e5f7
Revises: f6a7b8c9d0e1
Create Date: 2026-09-24 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'appointments',
        sa.Column('ai_assist_enabled', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.create_table(
        'interview_insights',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('appointment_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('question_segment_id', sa.BigInteger(), nullable=False),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['appointment_id'], ['appointments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_interview_insights_appointment_id', 'interview_insights', ['appointment_id'])


def downgrade() -> None:
    op.drop_index('ix_interview_insights_appointment_id', table_name='interview_insights')
    op.drop_table('interview_insights')
    op.drop_column('appointments', 'ai_assist_enabled')
