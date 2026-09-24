from typing import Any, Literal

from pydantic import BaseModel, Field


class AssistantResumeInput(BaseModel):
    """The HR's answer to a paused tool confirmation (see
    tools/scheduling.py's interrupt() call)."""

    decision: Literal["confirm", "reject"]
    note: str | None = Field(default=None, max_length=1000)


class AssistantMessageInput(BaseModel):
    """Send exactly one of `message` (a new chat message) or `resume` (an
    answer to a pending confirmation) -- never both."""

    message: str | None = Field(default=None, max_length=4000)
    # The browser's IANA timezone (Intl.DateTimeFormat().resolvedOptions().timeZone),
    # so "10am" means the HR's 10am. Falls back to the last one used / UTC.
    timezone: str | None = Field(default=None, max_length=64)
    resume: AssistantResumeInput | None = None


class AssistantInterrupt(BaseModel):
    """A paused tool call waiting on the HR's confirmation, surfaced to the
    frontend instead of a normal reply."""

    action: str
    payload: dict[str, Any]


class AssistantAttachment(BaseModel):
    """A file the assistant is sharing (CV PDF, recording, chart image)."""

    name: str
    url: str
    download_url: str
    kind: str = "file"  # pdf | image | video | file


class AssistantMessageOutput(BaseModel):
    reply: str | None = None
    interrupt: AssistantInterrupt | None = None
    attachments: list[AssistantAttachment] = []


class TranscriptionOutput(BaseModel):
    text: str
