import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import ApplicantStage


class Applicant(Base):
    __tablename__ = "applicants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone_number: Mapped[str] = mapped_column(String(30), nullable=False)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Optional by design -- not every candidate has a public profile.
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    github_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    experience_years: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # CV file lives in MinIO; this row only keeps the object key + display name.
    cv_object_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cv_file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cv_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_letter: Mapped[str | None] = mapped_column(Text, nullable=True)

    applied_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    stage: Mapped[ApplicantStage] = mapped_column(
        SAEnum(ApplicantStage, name="applicant_stage"), nullable=False, default=ApplicantStage.applied
    )
    rejection_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    saved_to_cv_bank: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # AI ranking scores: nullable 1:1 fields, populated once "Run AI ranking"
    # has executed for the parent job. Kept on the applicant row rather than
    # a separate table since the relationship is strictly one-to-one and
    # always read together with the applicant.
    communication_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    jd_overlap_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    linkedin_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    github_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    overall_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    ranked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Populated only by the real "AI Job Review" pipeline (Gemini + GitHub +
    # LinkedIn), never by the mock per-job ranking above -- its presence is
    # what distinguishes a real, explained review from the mock one. Holds
    # per-category reasoning text, raw GitHub/LinkedIn snapshots used, and
    # which sources were actually available for this run.
    ai_review_details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # HR's own ordering within the job's Applicants list (0 = top). The AI
    # score is only a recommendation; when set, this wins. Null = not yet
    # placed by HR, so it sorts after ranked ones by AI score.
    manual_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # HR's own overall assessment of the candidate (1-5 in half steps) + notes.
    hr_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    hr_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # When the final hiring decision (accepted / rejected) was made.
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    job: Mapped["Job"] = relationship("Job", back_populates="applicants")
    appointments: Mapped[list["Appointment"]] = relationship(
        "Appointment", back_populates="applicant", cascade="all, delete-orphan"
    )
