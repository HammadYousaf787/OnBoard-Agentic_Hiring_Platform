import uuid

from pydantic import BaseModel


class PublicJobRead(BaseModel):
    """What an applicant is allowed to see about a job. Deliberately omits
    salary, assigned HR, applicant counts, and anything internal."""

    id: uuid.UUID
    title: str
    department: str
    location: str
    description: str
    accepting_applications: bool
    collect_github: bool


class ApplicationReceipt(BaseModel):
    message: str
