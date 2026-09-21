"""Applicant-side (no login) endpoints for joining a video interview via the
secret link containing the appointment's room token."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.agora import APPLICANT_UID, AgoraNotConfigured, build_rtc_credentials, channel_for
from app.database import get_db
from app.models.applicant import Applicant
from app.models.appointment import Appointment, InterviewSegment
from app.models.job import Job
from app.models.user import User
from app.schemas.interview import PublicInterviewState, RtcCredentials, SegmentInput, SegmentRead

router = APIRouter(prefix="/public/interviews", tags=["public-interviews"])


async def _by_token(db: AsyncSession, token: str) -> Appointment:
    result = await db.execute(select(Appointment).where(Appointment.room_token == token))
    appointment = result.scalar_one_or_none()
    if appointment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview link not found.")
    return appointment


@router.get("/{token}", response_model=PublicInterviewState)
async def get_state(token: str, db: AsyncSession = Depends(get_db)) -> PublicInterviewState:
    appointment = await _by_token(db, token)
    job = await db.get(Job, appointment.job_id)
    applicant = await db.get(Applicant, appointment.applicant_id)
    hr = await db.get(User, appointment.hr_id)
    return PublicInterviewState(
        job_title=job.title if job else "",
        applicant_name=applicant.name if applicant else "",
        interviewer_name=hr.full_name if hr else "",
        scheduled_at=appointment.scheduled_at,
        room_status=appointment.room_status,
        recording_enabled=appointment.recording_enabled,
    )


@router.post("/{token}/join", response_model=RtcCredentials)
async def join(token: str, db: AsyncSession = Depends(get_db)) -> RtcCredentials:
    appointment = await _by_token(db, token)
    if appointment.room_status != "live":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="The interviewer hasn't opened the room yet."
        )
    applicant = await db.get(Applicant, appointment.applicant_id)
    try:
        creds = build_rtc_credentials(channel_for(appointment.id), APPLICANT_UID)
    except AgoraNotConfigured as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    return RtcCredentials(**creds, display_name=applicant.name if applicant else "Candidate")


@router.post("/{token}/transcript", response_model=SegmentRead, status_code=status.HTTP_201_CREATED)
async def add_segment(
    token: str, payload: SegmentInput, db: AsyncSession = Depends(get_db)
) -> InterviewSegment:
    appointment = await _by_token(db, token)
    if appointment.room_status != "live":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The interview is not live.")
    applicant = await db.get(Applicant, appointment.applicant_id)
    segment = InterviewSegment(
        appointment_id=appointment.id,
        speaker_role="applicant",
        speaker_name=applicant.name if applicant else "Candidate",
        text=payload.text.strip(),
    )
    db.add(segment)
    await db.commit()
    await db.refresh(segment)
    return segment
