import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AiReviewCategory(BaseModel):
    score: float
    reasoning: str


class AiReviewResult(BaseModel):
    """The full explained evaluation returned by POST /applicants/{id}/ai-review."""

    communication: AiReviewCategory
    jd_overlap: AiReviewCategory
    github: AiReviewCategory
    linkedin: AiReviewCategory
    overall: AiReviewCategory
    github_available: bool
    linkedin_available: bool
    github_error: str | None = None
    linkedin_error: str | None = None
    model: str
    generated_at: datetime


class AiUsageEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    provider: str
    model_name: str
    purpose: str
    applicant_id: uuid.UUID | None
    triggered_by_id: uuid.UUID | None
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None
    success: bool
    error_message: str | None
    created_at: datetime


class OpenAiAccountUsageRead(BaseModel):
    """Real account-level usage from OpenAI's Admin API (separate from this
    app's own event log below) -- absent/None fields mean it isn't
    configured or the lookup failed; see error."""

    configured: bool
    period_start: datetime | None = None
    period_end: datetime | None = None
    total_requests: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    error: str | None = None


class AiUsageSummary(BaseModel):
    total_calls: int
    successful_calls: int
    failed_calls: int
    total_tokens: int
    total_prompt_tokens: int
    total_completion_tokens: int
    by_provider: dict[str, int]
    recent_events: list[AiUsageEventRead]
    openai_account: OpenAiAccountUsageRead
