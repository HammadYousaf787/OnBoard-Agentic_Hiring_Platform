"""add video interview room fields and interview_segments

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-09-22 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('appointments', sa.Column('room_token', sa.String(length=64), nullable=True))
    op.create_unique_constraint('uq_appointments_room_token', 'appointments', ['room_token'])
    op.add_column('appointments', sa.Column('room_status', sa.String(length=16), server_default='not_setup', nullable=False))
    op.add_column('appointments', sa.Column('room_started_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('appointments', sa.Column('room_ended_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('appointments', sa.Column('recording_enabled', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('appointments', sa.Column('interviewer_notes', sa.Text(), nullable=True))
    op.add_column('appointments', sa.Column('ai_questions', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('appointments', sa.Column('ai_questions_prompt', sa.Text(), nullable=True))
    op.add_column('appointments', sa.Column('ai_questions_generated_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('appointments', sa.Column('transcript_object_key', sa.String(length=500), nullable=True))
    op.add_column('appointments', sa.Column('transcript_segment_count', sa.Integer(), nullable=True))
    op.add_column('appointments', sa.Column('recording_object_key', sa.String(length=500), nullable=True))
    op.add_column('appointments', sa.Column('recording_size_bytes', sa.BigInteger(), nullable=True))

    op.create_table(
        'interview_segments',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('appointment_id', sa.UUID(), nullable=False),
        sa.Column('speaker_role', sa.String(length=16), nullable=False),
        sa.Column('speaker_name', sa.String(length=150), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('spoken_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['appointment_id'], ['appointments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_interview_segments_appointment_id'), 'interview_segments', ['appointment_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_interview_segments_appointment_id'), table_name='interview_segments')
    op.drop_table('interview_segments')
    for col in ('recording_size_bytes', 'recording_object_key', 'transcript_segment_count', 'transcript_object_key',
                'ai_questions_generated_at', 'ai_questions_prompt', 'ai_questions', 'interviewer_notes',
                'recording_enabled', 'room_ended_at', 'room_started_at', 'room_status'):
        op.drop_column('appointments', col)
    op.drop_constraint('uq_appointments_room_token', 'appointments', type_='unique')
    op.drop_column('appointments', 'room_token')
