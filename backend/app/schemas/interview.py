import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SetupRoomsInput(BaseModel):
    appointment_ids: list[uuid.UUID] = Field(min_length=1, max_length=200)


class NotesInput(BaseModel):
    notes: str = Field(max_length=20000)


class ReviewInput(BaseModel):
    review: str | None = Field(default=None, max_length=20000)


class AiQuestionsInput(BaseModel):
    prompt: str | None = Field(default=None, max_length=2000)


class StartRoomInput(BaseModel):
    recording_enabled: bool = False
    # Chosen before the call starts; cannot be switched on afterwards.
    ai_assist_enabled: bool = False


class RoomSettingsInput(BaseModel):
    """Only the fields present are changed. ai_assist_enabled may only be
    turned ON while the interview hasn't started (turning it off is always OK)."""

    recording_enabled: bool | None = None
    ai_assist_enabled: bool | None = None


class SegmentInput(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class SegmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    speaker_role: str
    speaker_name: str
    text: str
    spoken_at: datetime


class RtcCredentials(BaseModel):
    app_id: str
    channel: str
    uid: int
    token: str
    display_name: str


class LiveSuggestion(BaseModel):
    question: str
    reason: str


class LiveAssistRead(BaseModel):
    observation: str
    suggestions: list[LiveSuggestion]


class InsightRead(BaseModel):
    id: int
    question_segment_id: int
    question: str
    answer_summary: str
    depth: str  # shallow | adequate | strong
    should_probe: bool
    recommendation: str
    follow_ups: list[str]
    created_at: datetime


class FinalTranscriptRead(BaseModel):
    appointment_id: uuid.UUID
    segments: list[dict]


class PublicInterviewState(BaseModel):
    job_title: str
    applicant_name: str
    interviewer_name: str
    scheduled_at: datetime
    room_status: str
    recording_enabled: bool
    ai_assist_enabled: bool = False
