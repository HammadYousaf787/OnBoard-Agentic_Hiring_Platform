"""Live interview pipeline: audio in -> transcript lines -> per-question AI insights.

Two independent, asynchronous halves:

1. ingest_audio(): each participant's browser uploads short clips of ITS OWN
   microphone (so the speaker is always known). We transcribe the clip with OpenAI and
   store a transcript line (InterviewSegment). Only allowed while the interview is live
   AND live AI assistance was enabled before the call (the candidate was warned).

2. schedule_analysis(): after every stored line we (re)arm a per-interview background
   worker. It waits for a quiet moment (SETTLE_SECONDS with no new speech, or
   MAX_WAIT_SECONDS at most) so a candidate's answer has finished, then asks the model
   whether any interviewer question has now been asked AND answered; if so it stores an
   InterviewInsight (depth + whether/where to probe). Nothing here blocks the HTTP
   requests -- the interviewer's page just polls for new insights.

State is in-process (asyncio tasks/dicts), which is right for the single-process
`python run.py` deployment; running several API workers would need a shared queue.
"""

import asyncio
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.integrations.interview_ai import analyze_answered_questions
from app.integrations.openai_client import AiProviderError, model_for, transcribe_audio
from app.models.ai_usage import AiUsageEvent
from app.models.applicant import Applicant
from app.models.appointment import Appointment, InterviewInsight, InterviewSegment
from app.models.job import Job
from app.models.user import User

log = logging.getLogger(__name__)

MAX_AUDIO_BYTES = 3 * 1024 * 1024  # a 15 s webm/opus clip is ~100-250 KB; this is generous
SETTLE_SECONDS = 3.5
MAX_WAIT_SECONDS = 15.0

# Strings speech models tend to invent on near-silence. Dropped when they are the
# whole transcription of a clip.
_HALLUCINATIONS = {
    "you",
    "thank you for watching",
    "thanks for watching",
    "please subscribe",
    "subtitles by the amara.org community",
}


def _is_junk(text: str) -> bool:
    return text.strip().lower().strip(" .!?,") in _HALLUCINATIONS


# ---------------------------------------------------------------- ingest ----


async def ingest_audio(
    db: AsyncSession,
    appointment: Appointment,
    *,
    role: str,
    speaker_name: str,
    data: bytes,
    filename: str,
    content_type: str | None,
    duration_ms: int,
) -> InterviewSegment | None:
    """Transcribe one clip and store it as a transcript line. Returns None when
    the clip contained no usable speech. Raises HTTPException for the caller."""
    if appointment.room_status != "live":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The interview is not live.")
    if not appointment.ai_assist_enabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="AI assistance is not enabled for this interview.",
        )
    if not data:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No audio received.")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Clip too large.")

    received_at = datetime.now(timezone.utc)
    job = await db.get(Job, appointment.job_id)
    hint = f"Job interview{f' for a {job.title} role' if job else ''}. Speakers: {speaker_name}."

    try:
        text, usage = await transcribe_audio(
            data, filename, content_type, purpose="interview_transcribe", prompt=hint
        )
        error = None
    except AiProviderError as exc:
        text, usage, error = "", None, str(exc)

    db.add(
        AiUsageEvent(
            provider="openai",
            model_name=model_for("interview_transcribe"),
            purpose="interview_transcribe",
            applicant_id=appointment.applicant_id,
            triggered_by_id=appointment.hr_id,
            prompt_tokens=(usage or {}).get("prompt_tokens"),
            completion_tokens=(usage or {}).get("completion_tokens"),
            total_tokens=(usage or {}).get("total_tokens"),
            success=error is None,
            error_message=error,
        )
    )
    if error is not None:
        await db.commit()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Transcription failed: {error}")

    if not text or _is_junk(text):
        await db.commit()
        return None

    # The clip ended about when it arrived; place the line at its start so the two
    # speakers' independently uploaded clips interleave in the order they were spoken.
    segment = InterviewSegment(
        appointment_id=appointment.id,
        speaker_role=role,
        speaker_name=speaker_name,
        text=text,
        spoken_at=received_at - timedelta(milliseconds=max(0, min(duration_ms, 60_000))),
    )
    db.add(segment)
    await db.commit()
    await db.refresh(segment)
    schedule_analysis(appointment.id)
    return segment


# -------------------------------------------------------------- analysis ----

_tasks: dict[uuid.UUID, asyncio.Task] = {}
_last_speech_at: dict[uuid.UUID, float] = {}
_pending_since: dict[uuid.UUID, float] = {}
_last_analyzed_segment_id: dict[uuid.UUID, int] = {}


def schedule_analysis(appointment_id: uuid.UUID) -> None:
    """Note that new speech arrived and make sure the worker is running."""
    now = time.monotonic()
    _last_speech_at[appointment_id] = now
    _pending_since.setdefault(appointment_id, now)
    task = _tasks.get(appointment_id)
    if task is None or task.done():
        _tasks[appointment_id] = asyncio.create_task(_worker(appointment_id))


async def _worker(appointment_id: uuid.UUID) -> None:
    try:
        while True:
            await asyncio.sleep(0.5)
            since = _pending_since.get(appointment_id)
            if since is None:
                return  # nothing waiting
            now = time.monotonic()
            quiet = now - _last_speech_at.get(appointment_id, now) >= SETTLE_SECONDS
            starved = now - since >= MAX_WAIT_SECONDS
            if not (quiet or starved):
                continue
            _pending_since.pop(appointment_id, None)
            await _analyze_once(appointment_id)
            if appointment_id not in _pending_since:
                return
    except Exception:  # noqa: BLE001 - a background task must never die noisily
        log.exception("Live interview analysis failed for %s", appointment_id)
    finally:
        if _tasks.get(appointment_id) is asyncio.current_task():
            _tasks.pop(appointment_id, None)


def forget(appointment_id: uuid.UUID) -> None:
    """Drop in-memory state once an interview has ended."""
    for d in (_last_speech_at, _pending_since, _last_analyzed_segment_id):
        d.pop(appointment_id, None)


async def _analyze_once(appointment_id: uuid.UUID) -> None:
    async with AsyncSessionLocal() as db:
        appointment = await db.get(Appointment, appointment_id)
        if appointment is None or appointment.room_status != "live" or not appointment.ai_assist_enabled:
            return

        segments = list(
            (
                await db.execute(
                    select(InterviewSegment)
                    .where(InterviewSegment.appointment_id == appointment_id)
                    .order_by(InterviewSegment.spoken_at, InterviewSegment.id)
                )
            )
            .scalars()
            .all()
        )
        if not segments:
            return

        # Only worth a model call if there is new speech AND the candidate has said
        # something after an interviewer line. New interviewer speech counts too: it
        # usually means the interviewer moved on, i.e. the previous answer is over.
        last_id = _last_analyzed_segment_id.get(appointment_id, 0)
        has_new = any(s.id > last_id for s in segments)
        first_interviewer = next((s for s in segments if s.speaker_role == "interviewer"), None)
        answered_something = first_interviewer is not None and any(
            s.speaker_role == "applicant" and s.spoken_at >= first_interviewer.spoken_at for s in segments
        )
        _last_analyzed_segment_id[appointment_id] = max(s.id for s in segments)
        if not has_new or not answered_something:
            return

        existing = list(
            (
                await db.execute(
                    select(InterviewInsight.question_segment_id).where(
                        InterviewInsight.appointment_id == appointment_id
                    )
                )
            )
            .scalars()
            .all()
        )
        job = await db.get(Job, appointment.job_id)
        applicant = await db.get(Applicant, appointment.applicant_id)
        if job is None or applicant is None:
            return
        lines = [f"[{s.id}] {s.speaker_name} ({s.speaker_role}): {s.text}" for s in segments]
        topics = [q.get("topic", "") for q in (appointment.ai_questions or {}).get("questions", [])]

        try:
            result, usage = await analyze_answered_questions(job, applicant, lines, existing, topics)
        except AiProviderError as exc:
            db.add(_usage(appointment, None, str(exc)))
            await db.commit()
            return
        db.add(_usage(appointment, usage, None))

        known = set(existing)
        valid_ids = {s.id for s in segments if s.speaker_role == "interviewer"}
        for ev in result.get("evaluations", []):
            qid = ev.get("question_segment_id")
            if not isinstance(qid, int) or qid in known or qid not in valid_ids:
                continue
            known.add(qid)
            db.add(
                InterviewInsight(
                    appointment_id=appointment_id,
                    question_segment_id=qid,
                    question=str(ev.get("question", ""))[:1000],
                    data={
                        "answer_summary": str(ev.get("answer_summary", ""))[:1500],
                        "depth": ev.get("depth") if ev.get("depth") in ("shallow", "adequate", "strong") else "adequate",
                        "should_probe": bool(ev.get("should_probe")),
                        "recommendation": str(ev.get("recommendation", ""))[:1000],
                        "follow_ups": [str(f)[:400] for f in (ev.get("follow_ups") or [])][:2],
                    },
                )
            )
        await db.commit()


def _usage(appointment: Appointment, usage: dict | None, error: str | None) -> AiUsageEvent:
    return AiUsageEvent(
        provider="openai",
        model_name=model_for("interview_qa_analysis"),
        purpose="interview_qa_analysis",
        applicant_id=appointment.applicant_id,
        triggered_by_id=appointment.hr_id,
        prompt_tokens=(usage or {}).get("prompt_tokens"),
        completion_tokens=(usage or {}).get("completion_tokens"),
        total_tokens=(usage or {}).get("total_tokens"),
        success=error is None,
        error_message=error,
    )
