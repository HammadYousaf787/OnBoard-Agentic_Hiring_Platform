import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applicants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    hr_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    notify_day_before: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # --- Video interview room (Agora) ---------------------------------
    # Random secret in the applicant's join link; null until the room is set up.
    room_token: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    # not_setup -> ready -> live -> ended
    room_status: Mapped[str] = mapped_column(String(16), nullable=False, default="not_setup", server_default="not_setup")
    room_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    room_ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recording_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    interviewer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Written by the interviewer when the interview ends (or edited later).
    interviewer_review: Mapped[str | None] = mapped_column(Text, nullable=True)
    interviewer_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ai_questions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ai_questions_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_questions_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Blobs live in object storage; Postgres only keeps the pointers + metadata.
    transcript_object_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    transcript_segment_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recording_object_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    recording_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    applicant: Mapped["Applicant"] = relationship("Applicant", back_populates="appointments")
    job: Mapped["Job"] = relationship("Job")
    hr: Mapped["User"] = relationship("User")

    @property
    def has_transcript(self) -> bool:
        return self.transcript_object_key is not None

    @property
    def has_recording(self) -> bool:
        return self.recording_object_key is not None


class InterviewSegment(Base):
    """A spoken utterance captured during a live call. Temporary: compiled
    into the transcript file in object storage when the interview ends."""

    __tablename__ = "interview_segments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    appointment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    speaker_role: Mapped[str] = mapped_column(String(16), nullable=False)  # interviewer | applicant
    speaker_name: Mapped[str] = mapped_column(String(150), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    spoken_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
