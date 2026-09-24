"""HTTP adapter over the LangGraph HR assistant (app/assistant/). This file
knows about FastAPI/JWT auth; app/assistant/graph.py knows nothing about
HTTP -- that split is deliberate, see app/assistant/GRAPH.txt.

One persistent thread per HR user (thread_id = f"hr-{user.id}"), so the
conversation carries on across page loads without the frontend managing any
session/history state itself -- the checkpointer (Postgres) is the only
place it lives.
"""

from langchain_core.messages import HumanMessage, ToolMessage
from langgraph.types import Command
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.assistant.graph import get_graph
from app.database import get_db
from app.deps import require_hr
from app.integrations.openai_client import AiProviderError, model_for, transcribe_audio
from app.models.ai_usage import AiUsageEvent
from app.models.applicant import Applicant
from app.models.job import Job
from app.models.user import User
from app.schemas.assistant import (
    AssistantAttachment,
    AssistantInterrupt,
    AssistantMessageInput,
    AssistantMessageOutput,
    TranscriptionOutput,
)

router = APIRouter(prefix="/assistant", tags=["assistant"])


MAX_AUDIO_BYTES = 10 * 1024 * 1024  # ~10 min of browser-recorded webm/opus is well under this


def _thread_config(user_id: str) -> dict:
    return {"configurable": {"thread_id": f"hr-{user_id}"}}


async def _pending_interrupt(graph, config: dict) -> AssistantInterrupt | None:
    snapshot = await graph.aget_state(config)
    for task in snapshot.tasks:
        for pending in task.interrupts:
            value = pending.value
            return AssistantInterrupt(action=value.get("action", "confirm"), payload=value)
    return None


@router.get("/pending", response_model=AssistantMessageOutput)
async def pending(current_user: User = Depends(require_hr)) -> AssistantMessageOutput:
    """Lets the panel re-show a confirmation card that was left unanswered
    (page reloaded / panel reopened)."""
    graph = await get_graph()
    return AssistantMessageOutput(
        interrupt=await _pending_interrupt(graph, _thread_config(str(current_user.id)))
    )


@router.post("/message", response_model=AssistantMessageOutput)
async def send_message(
    payload: AssistantMessageInput,
    current_user: User = Depends(require_hr),
) -> AssistantMessageOutput:
    if bool(payload.message) == bool(payload.resume):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Send exactly one of `message` or `resume`.",
        )

    graph = await get_graph()
    config = _thread_config(str(current_user.id))

    # A confirmation is still waiting (e.g. the page was reloaded): a new chat
    # message can't be processed until it's answered -- the model would see a
    # tool call with no result and OpenAI rejects that. Show the card again.
    if payload.resume is None:
        pending_now = await _pending_interrupt(graph, config)
        if pending_now is not None:
            return AssistantMessageOutput(interrupt=pending_now)

    if payload.resume is not None:
        graph_input = Command(resume=payload.resume.model_dump())
    else:
        graph_input = {
            "messages": [HumanMessage(content=payload.message)],
            "hr_id": str(current_user.id),
            "tz": payload.timezone or "UTC",
        }

    try:
        result = await graph.ainvoke(graph_input, config=config)
    except Exception as exc:  # noqa: BLE001 - most likely an unconfigured/invalid OPENAI_API_KEY
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"The assistant couldn't reach OpenAI: {exc}",
        )

    pending = result.get("__interrupt__")
    if pending:
        value = pending[0].value
        return AssistantMessageOutput(
            interrupt=AssistantInterrupt(action=value.get("action", "confirm"), payload=value)
        )

    last = result["messages"][-1]
    return AssistantMessageOutput(
        reply=getattr(last, "content", None) or "",
        attachments=_attachments_this_turn(result["messages"]),
    )


def _attachments_this_turn(messages: list) -> list[AssistantAttachment]:
    """Files produced by tools since the HR's latest message (tools hand them
    back through ToolMessage.artifact, see tools/_actions.attachment). Includes
    a confirm-resume: files fetched before the pause arrive with the final reply."""
    start = 0
    for i in range(len(messages) - 1, -1, -1):
        if isinstance(messages[i], HumanMessage):
            start = i + 1
            break
    files: list[AssistantAttachment] = []
    for m in messages[start:]:
        if isinstance(m, ToolMessage) and isinstance(m.artifact, list):
            files.extend(AssistantAttachment(**a) for a in m.artifact if isinstance(a, dict))
    return files


async def _vocabulary_hint(db: AsyncSession, user: User) -> str | None:
    """Candidate and job names the HR is likely to say, so the speech model spells them right
    ("Mahnoor Iqbal", not "Manor Iqbal"). Only this HR's own jobs/applicants."""
    names = (
        await db.execute(
            select(Applicant.name)
            .join(Job, Applicant.job_id == Job.id)
            .where(Job.assigned_hr_id == user.id)
            .distinct()
            .limit(40)
        )
    ).scalars().all()
    titles = (await db.execute(select(Job.title).where(Job.assigned_hr_id == user.id).limit(10))).scalars().all()
    words = [*names, *titles]
    return ("HR recruiting commands. Names and jobs that may be mentioned: " + ", ".join(words) + ".") if words else None


@router.post("/transcribe", response_model=TranscriptionOutput)
async def transcribe(
    audio: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> TranscriptionOutput:
    """Mic button: recorded audio in, text out. Deliberately does NOT send the
    text to the assistant -- the frontend puts it in the input box so the HR
    can check it before sending (a misheard word shouldn't trigger an action).
    Done server-side (OpenAI) rather than with the browser's built-in speech
    recognition so it behaves the same in every browser."""
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No audio received.")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Recording is too long.")

    purpose = "assistant_transcribe"
    try:
        text, usage = await transcribe_audio(
            data,
            audio.filename or "audio.webm",
            audio.content_type,
            purpose=purpose,
            prompt=await _vocabulary_hint(db, current_user),
        )
        error = None
    except AiProviderError as exc:
        usage, error = None, str(exc)

    db.add(
        AiUsageEvent(
            provider="openai",
            model_name=model_for(purpose),
            purpose=purpose,
            triggered_by_id=current_user.id,
            prompt_tokens=(usage or {}).get("prompt_tokens"),
            completion_tokens=(usage or {}).get("completion_tokens"),
            total_tokens=(usage or {}).get("total_tokens"),
            success=error is None,
            error_message=error,
        )
    )
    await db.commit()

    if error is not None:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Transcription failed: {error}")
    return TranscriptionOutput(text=text)
