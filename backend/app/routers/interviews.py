"""Interviewer-side (authenticated HR) endpoints for video interviews."""

import asyncio
import json
import secrets
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.config import get_settings
from app.core.agora import INTERVIEWER_UID, AgoraNotConfigured, build_rtc_credentials, channel_for
from app.core.applicant_context import gather_online_profiles
from app.core.storage import delete_prefix, get_bytes, get_cv_download_url, put_bytes, put_file
from app.database import get_db
from app.deps import require_any_role, require_hr
from app.integrations.gemini_client import GeminiError
from app.integrations.interview_ai import generate_interview_questions, generate_live_suggestions
from app.models.ai_usage import AiUsageEvent
from app.models.applicant import Applicant
from app.models.appointment import Appointment, InterviewSegment
from app.models.job import Job
from app.models.user import User
from app.models.enums import ApplicantStage, Role
from app.schemas.applicant import ApplicantRead
from app.schemas.appointment import AppointmentRead
from app.schemas.interview import (
    AiQuestionsInput,
    FinalTranscriptRead,
    LiveAssistRead,
    NotesInput,
    ReviewInput,
    RoomSettingsInput,
    RtcCredentials,
    SegmentInput,
    SegmentRead,
    SetupRoomsInput,
    StartRoomInput,
)

router = APIRouter(prefix="/appointments", tags=["interviews"])

MAX_RECORDING_BYTES = 1024 * 1024 * 1024
_last_live_assist: dict[uuid.UUID, float] = {}


async def get_own_appointment(db: AsyncSession, appointment_id: uuid.UUID, user: User) -> Appointment:
    appointment = await db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found.")
    if appointment.hr_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This appointment does not belong to you."
        )
    return appointment


async def get_viewable_appointment(db: AsyncSession, appointment_id: uuid.UUID, user: User) -> Appointment:
    """Read access: the owning HR, or any admin."""
    appointment = await db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found.")
    if user.role == Role.hr and appointment.hr_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This appointment does not belong to you."
        )
    return appointment


def _ensure_room_token(appointment: Appointment) -> None:
    if not appointment.room_token:
        appointment.room_token = secrets.token_urlsafe(24)
    if appointment.room_status == "not_setup":
        appointment.room_status = "ready"


@router.post("/setup-rooms", response_model=list[AppointmentRead])
async def setup_rooms(
    payload: SetupRoomsInput,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> list[Appointment]:
    result = await db.execute(
        select(Appointment).where(
            Appointment.id.in_(payload.appointment_ids), Appointment.hr_id == current_user.id
        )
    )
    appointments = list(result.scalars().all())
    if not appointments:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No matching appointments.")
    # A room that already exists is never set up again (its candidate link stays valid).
    appointments = [a for a in appointments if a.room_status == "not_setup"]
    if not appointments:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The room for that interview is already set up.",
        )
    for appointment in appointments:
        _ensure_room_token(appointment)
    await db.commit()
    for appointment in appointments:
        await db.refresh(appointment)
    return appointments


@router.get("/{appointment_id}", response_model=AppointmentRead)
async def get_appointment(
    appointment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> Appointment:
    return await get_viewable_appointment(db, appointment_id, current_user)


@router.delete("/{appointment_id}", response_model=ApplicantRead)
async def delete_appointment(
    appointment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> Applicant:
    """Removes an interview slot that hasn't started (e.g. booked by mistake).
    If it was the candidate's only interview they return to Pending
    Scheduling. Returns the (possibly updated) applicant."""
    appointment = await get_own_appointment(db, appointment_id, current_user)
    if appointment.room_status == "live":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This interview is live right now.")
    if appointment.room_status == "ended":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This interview already took place and has a record (review, transcript, recording), so it can't be removed.",
        )

    applicant = await db.get(Applicant, appointment.applicant_id)
    await db.delete(appointment)
    await db.flush()

    remaining = (
        await db.execute(
            select(func.count()).select_from(Appointment).where(Appointment.applicant_id == applicant.id)
        )
    ).scalar_one()
    if remaining == 0 and applicant.stage == ApplicantStage.interview_scheduled:
        applicant.stage = ApplicantStage.assessment_passed

    await db.commit()
    await db.refresh(applicant)
    delete_prefix(f"interviews/{appointment_id}/")
    return applicant


@router.patch("/{appointment_id}/notes", response_model=AppointmentRead)
async def save_notes(
    appointment_id: uuid.UUID,
    payload: NotesInput,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> Appointment:
    appointment = await get_own_appointment(db, appointment_id, current_user)
    appointment.interviewer_notes = payload.notes
    await db.commit()
    await db.refresh(appointment)
    return appointment


@router.patch("/{appointment_id}/review", response_model=AppointmentRead)
async def save_review(
    appointment_id: uuid.UUID,
    payload: ReviewInput,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> Appointment:
    """The interviewer's post-interview assessment; editable afterwards."""
    appointment = await get_own_appointment(db, appointment_id, current_user)
    appointment.interviewer_review = (payload.review or "").strip() or None
    appointment.interviewer_reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(appointment)
    return appointment


async def _load_context(db: AsyncSession, appointment: Appointment) -> tuple[Job, Applicant]:
    job = await db.get(Job, appointment.job_id)
    applicant = await db.get(Applicant, appointment.applicant_id)
    if job is None or applicant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview details missing.")
    return job, applicant


async def _log_usage(
    db: AsyncSession, purpose: str, applicant_id, user_id, usage: dict | None, error: str | None
) -> None:
    db.add(
        AiUsageEvent(
            provider="gemini",
            model_name=get_settings().gemini_model,
            purpose=purpose,
            applicant_id=applicant_id,
            triggered_by_id=user_id,
            prompt_tokens=(usage or {}).get("prompt_tokens"),
            completion_tokens=(usage or {}).get("completion_tokens"),
            total_tokens=(usage or {}).get("total_tokens"),
            success=error is None,
            error_message=error,
        )
    )


@router.post("/{appointment_id}/ai-questions", response_model=AppointmentRead)
async def generate_questions(
    appointment_id: uuid.UUID,
    payload: AiQuestionsInput,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> Appointment:
    appointment = await get_own_appointment(db, appointment_id, current_user)
    job, applicant = await _load_context(db, appointment)

    review = applicant.ai_review_details or {}
    if review.get("github_snapshot") or review.get("linkedin_snapshot"):
        github = (review.get("github_snapshot"), review.get("github_error"))
        linkedin = (review.get("linkedin_snapshot"), review.get("linkedin_error"))
    else:
        gh, gh_err, li, li_err = await gather_online_profiles(applicant)
        github, linkedin = (gh, gh_err), (li, li_err)

    try:
        result, usage = await generate_interview_questions(job, applicant, github, linkedin, payload.prompt)
    except GeminiError as exc:
        await _log_usage(db, "interview_questions", applicant.id, current_user.id, None, str(exc))
        await db.commit()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"AI request failed: {exc}")

    appointment.ai_questions = result
    appointment.ai_questions_prompt = (payload.prompt or "").strip() or None
    appointment.ai_questions_generated_at = datetime.now(timezone.utc)
    await _log_usage(db, "interview_questions", applicant.id, current_user.id, usage, None)
    await db.commit()
    await db.refresh(appointment)
    return appointment


@router.post("/{appointment_id}/room/start", response_model=AppointmentRead)
async def start_room(
    appointment_id: uuid.UUID,
    payload: StartRoomInput,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> Appointment:
    appointment = await get_own_appointment(db, appointment_id, current_user)
    if appointment.room_status == "ended":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This interview has already ended.")
    _ensure_room_token(appointment)
    if appointment.room_status != "live":
        appointment.room_status = "live"
        appointment.room_started_at = datetime.now(timezone.utc)
    appointment.recording_enabled = payload.recording_enabled
    await db.commit()
    await db.refresh(appointment)
    return appointment


@router.patch("/{appointment_id}/room", response_model=AppointmentRead)
async def update_room_settings(
    appointment_id: uuid.UUID,
    payload: RoomSettingsInput,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> Appointment:
    appointment = await get_own_appointment(db, appointment_id, current_user)
    appointment.recording_enabled = payload.recording_enabled
    await db.commit()
    await db.refresh(appointment)
    return appointment


@router.post("/{appointment_id}/room/token", response_model=RtcCredentials)
async def get_room_token(
    appointment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> RtcCredentials:
    appointment = await get_own_appointment(db, appointment_id, current_user)
    if appointment.room_status != "live":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Start the room first.")
    try:
        creds = build_rtc_credentials(channel_for(appointment.id), INTERVIEWER_UID)
    except AgoraNotConfigured as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    return RtcCredentials(**creds, display_name=current_user.full_name)


@router.post("/{appointment_id}/transcript", response_model=SegmentRead, status_code=status.HTTP_201_CREATED)
async def add_segment(
    appointment_id: uuid.UUID,
    payload: SegmentInput,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> InterviewSegment:
    appointment = await get_own_appointment(db, appointment_id, current_user)
    if appointment.room_status != "live":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The interview is not live.")
    segment = InterviewSegment(
        appointment_id=appointment.id,
        speaker_role="interviewer",
        speaker_name=current_user.full_name,
        text=payload.text.strip(),
    )
    db.add(segment)
    await db.commit()
    await db.refresh(segment)
    return segment


@router.get("/{appointment_id}/transcript", response_model=list[SegmentRead])
async def list_segments(
    appointment_id: uuid.UUID,
    after: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> list[InterviewSegment]:
    appointment = await get_own_appointment(db, appointment_id, current_user)
    result = await db.execute(
        select(InterviewSegment)
        .where(InterviewSegment.appointment_id == appointment.id, InterviewSegment.id > after)
        .order_by(InterviewSegment.id)
    )
    return list(result.scalars().all())


@router.post("/{appointment_id}/live-assist", response_model=LiveAssistRead)
async def live_assist(
    appointment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> LiveAssistRead:
    appointment = await get_own_appointment(db, appointment_id, current_user)
    if appointment.room_status != "live":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The interview is not live.")

    now = time.monotonic()
    if now - _last_live_assist.get(appointment.id, 0) < 8:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Slow down a little.")
    _last_live_assist[appointment.id] = now

    job, applicant = await _load_context(db, appointment)
    result = await db.execute(
        select(InterviewSegment)
        .where(InterviewSegment.appointment_id == appointment.id)
        .order_by(InterviewSegment.id.desc())
        .limit(60)
    )
    segments = list(reversed(result.scalars().all()))
    lines = [f"{s.speaker_name} ({s.speaker_role}): {s.text}" for s in segments]
    topics = [q.get("topic", "") for q in (appointment.ai_questions or {}).get("questions", [])]

    try:
        data, usage = await generate_live_suggestions(job, applicant, lines, topics)
    except GeminiError as exc:
        await _log_usage(db, "interview_live_assist", applicant.id, current_user.id, None, str(exc))
        await db.commit()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"AI request failed: {exc}")

    await _log_usage(db, "interview_live_assist", applicant.id, current_user.id, usage, None)
    await db.commit()
    return LiveAssistRead(
        observation=data.get("observation", ""), suggestions=data.get("suggestions", [])[:3]
    )


@router.post("/{appointment_id}/recording", response_model=AppointmentRead)
async def upload_recording(
    appointment_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> Appointment:
    appointment = await get_own_appointment(db, appointment_id, current_user)

    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty recording.")
    if size > MAX_RECORDING_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Recording too large.")

    # Drop codec parameters ("video/webm;codecs=vp8,opus"): browsers refuse to play them.
    content_type = (file.content_type or "video/webm").split(";")[0].strip() or "video/webm"
    extension = "mp4" if "mp4" in content_type else "webm"
    key = f"interviews/{appointment.id}/recording.{extension}"
    await run_in_threadpool(put_file, key, file.file, size, content_type)

    appointment.recording_object_key = key
    appointment.recording_size_bytes = size
    await db.commit()
    await db.refresh(appointment)
    return appointment


@router.post("/{appointment_id}/room/end", response_model=AppointmentRead)
async def end_room(
    appointment_id: uuid.UUID,
    payload: ReviewInput | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> Appointment:
    """Ends the call and compiles the live transcript segments into a single
    file in object storage (Postgres keeps only its key + segment count)."""
    appointment = await get_own_appointment(db, appointment_id, current_user)
    if appointment.room_status == "ended":
        return appointment

    if payload and payload.review and payload.review.strip():
        appointment.interviewer_review = payload.review.strip()
        appointment.interviewer_reviewed_at = datetime.now(timezone.utc)

    result = await db.execute(
        select(InterviewSegment)
        .where(InterviewSegment.appointment_id == appointment.id)
        .order_by(InterviewSegment.id)
    )
    segments = list(result.scalars().all())
    started = appointment.room_started_at or (segments[0].spoken_at if segments else None)

    if segments:
        document = {
            "appointment_id": str(appointment.id),
            "started_at": started.isoformat() if started else None,
            "segments": [
                {
                    "speaker": s.speaker_name,
                    "role": s.speaker_role,
                    "text": s.text,
                    "at": s.spoken_at.isoformat(),
                    "offset_seconds": round((s.spoken_at - started).total_seconds(), 1) if started else None,
                }
                for s in segments
            ],
        }
        key = f"interviews/{appointment.id}/transcript.json"
        await run_in_threadpool(
            put_bytes, key, json.dumps(document, indent=2).encode("utf-8"), "application/json"
        )
        appointment.transcript_object_key = key
        appointment.transcript_segment_count = len(segments)
        for segment in segments:
            await db.delete(segment)

    appointment.room_status = "ended"
    appointment.room_ended_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(appointment)
    return appointment


@router.get("/{appointment_id}/transcript/final", response_model=FinalTranscriptRead)
async def get_final_transcript(
    appointment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> FinalTranscriptRead:
    appointment = await get_viewable_appointment(db, appointment_id, current_user)
    if not appointment.transcript_object_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No transcript stored.")
    raw = await run_in_threadpool(get_bytes, appointment.transcript_object_key)
    document = json.loads(raw)
    return FinalTranscriptRead(appointment_id=appointment.id, segments=document["segments"])


@router.get("/{appointment_id}/recording-url")
async def get_recording_url(
    appointment_id: uuid.UUID,
    inline: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> dict[str, str | None]:
    appointment = await get_viewable_appointment(db, appointment_id, current_user)
    if not appointment.recording_object_key:
        return {"url": None}
    return {
        "url": get_cv_download_url(
            appointment.recording_object_key, f"interview-{appointment.id}.webm", inline
        )
    }
