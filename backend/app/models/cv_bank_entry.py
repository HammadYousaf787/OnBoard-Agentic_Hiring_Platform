import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CvBankEntry(Base):
    """
    A snapshot of a rejected applicant's info, kept for future openings.

    Fields are copied (not just referenced) from the source applicant so this
    entry stays meaningful even if the original applicant or job is later
    deleted -- source_job_id/applicant_id/rejected_by_id are kept as
    best-effort links (SET NULL) but the descriptive columns are the
    source of truth for display.
    """

    __tablename__ = "cv_bank_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    applicant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applicants.id", ondelete="SET NULL"), nullable=True
    )

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)

    cv_object_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cv_file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cv_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    experience_years: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    github_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    source_job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True
    )
    source_job_title: Mapped[str] = mapped_column(String(200), nullable=False)

    rejected_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    rejected_by_name: Mapped[str] = mapped_column(String(150), nullable=False)
    rejected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    applicant: Mapped["Applicant | None"] = relationship("Applicant")
    source_job: Mapped["Job | None"] = relationship("Job")
    rejected_by: Mapped["User | None"] = relationship("User")
