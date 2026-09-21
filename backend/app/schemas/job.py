import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import JobStatus


class JobBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    department: str = Field(min_length=1, max_length=150)
    location: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)
    seats: int = Field(ge=1)
    salary_min: int = Field(ge=0)
    salary_max: int = Field(ge=0)
    currency: str = Field(default="PKR", max_length=10)
    status: JobStatus = JobStatus.open
    collect_github: bool = False


class JobCreate(JobBase):
    assigned_hr_id: uuid.UUID | None = None


class JobUpdate(JobBase):
    pass


class JobAssignHr(BaseModel):
    hr_id: uuid.UUID | None = None


class JobRead(JobBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    filled_seats: int
    assigned_hr_id: uuid.UUID | None
    created_by_id: uuid.UUID
    is_demo: bool
    created_at: datetime
    updated_at: datetime
    applicant_count: int = 0
