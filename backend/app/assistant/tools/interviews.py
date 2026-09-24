"""Interview history/record read tools -- scoped to appointments this HR
owns (Appointment.hr_id), same rule as app/routers/interviews.py's
get_own_appointment. Transcript/recording *contents* stay in MinIO (read via
core/storage.py by the record page) -- these tools only report whether they
exist, not their bytes, since that's not something to paste into a chat."""

import uuid
from typing import Annotated

from langgraph.prebuilt import InjectedState
from langchain_core.tools import tool
from sqlalchemy import select

from app.assistant.state import HrAssistantState
from app.assistant.tools._db import session
from app.models.appointment import Appointment


@tool
async def get_interview_history(
    applicant_id: str, state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """List every interview (past and upcoming) held with one applicant, in
    order, with each one's status."""
    hr_id = uuid.UUID(state["hr_id"])
    async with session() as db:
        appts = (
            (
                await db.execute(
                    select(Appointment)
                    .where(
                        Appointment.applicant_id == uuid.UUID(applicant_id),
                        Appointment.hr_id == hr_id,
                    )
                    .order_by(Appointment.scheduled_at)
                )
            )
            .scalars()
            .all()
        )
        if not appts:
            return "No interviews found for that applicant (or they aren't yours)."
        lines = [
            f"- Interview {i + 1} (id={a.id}): {a.scheduled_at.isoformat()} · status={a.room_status}"
            for i, a in enumerate(appts)
        ]
        return "\n".join(lines)


@tool
async def get_interview_record(
    appointment_id: str, state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """Full record for one interview: pre-meeting notes, the interviewer's
    post-interview review, whether it was recorded/transcribed, and the AI
    questions prepared for it."""
    hr_id = uuid.UUID(state["hr_id"])
    async with session() as db:
        appt = await db.get(Appointment, uuid.UUID(appointment_id))
        if appt is None or appt.hr_id != hr_id:
            return "No interview with that id is assigned to you."
        lines = [
            f"Interview on {appt.scheduled_at.isoformat()} -- status: {appt.room_status}",
            f"Notes: {appt.interviewer_notes or '(none)'}",
            f"Review: {appt.interviewer_review or '(not written yet)'}",
            f"Recorded: {'yes' if appt.has_recording else 'no'} · "
            f"Transcript: {'yes, ' + str(appt.transcript_segment_count) + ' lines' if appt.has_transcript else 'no'}",
        ]
        if appt.ai_questions:
            topics = ", ".join(q.get("topic", "") for q in appt.ai_questions.get("questions", []))
            lines.append(f"AI-prepared question topics: {topics}")
        return "\n".join(lines)


INTERVIEW_TOOLS = [get_interview_history, get_interview_record]
