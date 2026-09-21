import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class CvBankEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    applicant_id: uuid.UUID | None
    name: str
    email: EmailStr
    phone_number: str | None
    country: str | None
    city: str | None
    cv_file_name: str | None
    cv_summary: str | None
    experience_years: int
    linkedin_url: str | None
    github_url: str | None
    source_job_id: uuid.UUID | None
    source_job_title: str
    rejected_by_id: uuid.UUID | None
    rejected_by_name: str
    rejected_at: datetime
    note: str | None
    is_demo: bool
