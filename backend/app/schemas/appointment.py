import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AppointmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    applicant_id: uuid.UUID
    job_id: uuid.UUID
    hr_id: uuid.UUID
    scheduled_at: datetime
    notify_day_before: bool

    room_token: str | None = None
    room_status: str = "not_setup"
    room_started_at: datetime | None = None
    room_ended_at: datetime | None = None
    recording_enabled: bool = False
    ai_assist_enabled: bool = False
    interviewer_notes: str | None = None
    interviewer_review: str | None = None
    interviewer_reviewed_at: datetime | None = None
    ai_questions: dict | None = None
    ai_questions_prompt: str | None = None
    ai_questions_generated_at: datetime | None = None
    has_transcript: bool = False
    transcript_segment_count: int | None = None
    has_recording: bool = False
    recording_size_bytes: int | None = None

    created_at: datetime
    updated_at: datetime


class NotifyToggleRead(BaseModel):
    notify_day_before: bool
