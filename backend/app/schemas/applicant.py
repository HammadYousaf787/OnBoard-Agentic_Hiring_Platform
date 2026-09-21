import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import ApplicantStage


class ApplicantUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    email: EmailStr
    phone_number: str = Field(min_length=1, max_length=30)
    country: str | None = Field(default=None, max_length=100)
    city: str | None = Field(default=None, max_length=100)
    linkedin_url: str | None = Field(default=None, max_length=500)
    github_url: str | None = Field(default=None, max_length=500)
    experience_years: int = Field(ge=0, default=0)
    cover_letter: str | None = None


class ApplicantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_id: uuid.UUID
    name: str
    email: EmailStr
    phone_number: str
    country: str | None
    city: str | None
    linkedin_url: str | None
    github_url: str | None
    experience_years: int
    cv_file_name: str | None
    cv_summary: str | None
    cover_letter: str | None
    applied_date: datetime
    stage: ApplicantStage
    rejection_note: str | None
    saved_to_cv_bank: bool

    communication_score: float | None
    jd_overlap_score: float | None
    linkedin_score: float | None
    github_score: float | None
    overall_score: float | None
    ranked_at: datetime | None

    # Present only after the real AI Job Review (Gemini + GitHub + LinkedIn)
    # has run for this applicant; holds per-category reasoning text.
    ai_review_details: dict | None = None
    manual_rank: int | None = None
    hr_score: float | None = None
    hr_notes: str | None = None

    is_demo: bool
    created_at: datetime
    updated_at: datetime


class RejectApplicantInput(BaseModel):
    note: str | None = Field(default=None, max_length=1000)
    save_to_cv_bank: bool = False


class ScheduleInterviewInput(BaseModel):
    scheduled_at: datetime
    notify_day_before: bool = True


class HrAssessmentInput(BaseModel):
    # Send only the fields being changed; send hr_score: null to clear the rating.
    hr_score: float | None = Field(default=None, ge=0.5, le=5)
    hr_notes: str | None = Field(default=None, max_length=10000)


class ApplicantOrderInput(BaseModel):
    applicant_ids: list[uuid.UUID] = Field(min_length=1, max_length=1000)


class BulkApplicantAction(BaseModel):
    applicant_ids: list[uuid.UUID] = Field(min_length=1, max_length=1000)
    action: Literal["pass_to_interview", "coding_assessment", "reject"]
    note: str | None = Field(default=None, max_length=1000)


class RescheduleInput(BaseModel):
    scheduled_at: datetime
