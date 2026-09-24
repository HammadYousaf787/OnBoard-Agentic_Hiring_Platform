"""Interview-room tools: set up rooms, recording setting, notes, post-interview
review, AI-prepared questions, and reading back transcript/recording.

None of these need confirmation -- they prepare or record information and
are easy to redo. (Booking/moving/cancelling slots is in scheduling.py and
does confirm.) Starting/ending the live video call itself happens in the
browser room page, not here.
"""

import uuid
from typing import Annotated

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from app.assistant.state import HrAssistantState
from app.assistant.tools._actions import (
    attachment,
    call,
    fmt_when,
    load_hr,
    owned_appointment,
    portal_link,
)
from app.assistant.tools._db import session
from app.core.storage import get_cv_download_url
from app.models.applicant import Applicant
from app.routers.interviews import (
    generate_questions,
    get_final_transcript,
    save_notes,
    save_review,
    setup_rooms,
    update_room_settings,
)
from app.schemas.interview import (
    AiQuestionsInput,
    NotesInput,
    ReviewInput,
    RoomSettingsInput,
    SetupRoomsInput,
)

MAX_TRANSCRIPT_CHARS = 8000


async def _label(db, appointment, state) -> str:
    applicant = await db.get(Applicant, appointment.applicant_id)
    return f"{applicant.name if applicant else '?'} ({fmt_when(appointment.scheduled_at, state)})"


@tool
async def setup_interview_rooms(
    appointment_ids: list[str], state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """Set up the video room for one or more interviews (creates the
    candidate's join link). Rooms already set up just report their existing
    link. Optionally follow with set_interview_recording."""
    lines = []
    async with session() as db:
        user = await load_hr(db, state)
        for appointment_id in appointment_ids:
            appt = await owned_appointment(db, state["hr_id"], appointment_id)
            if appt is None:
                lines.append(f"{appointment_id}: not one of your interviews")
                continue
            label = await _label(db, appt, state)
            if appt.room_status == "not_setup":
                result, err = await call(
                    db,
                    setup_rooms(
                        SetupRoomsInput(appointment_ids=[appt.id]), db=db, current_user=user
                    ),
                )
                if err is not None:
                    lines.append(f"{label}: {err}")
                    continue
                appt = result[0]
                lines.append(f"{label}: room set up. Candidate link: {portal_link(appt.room_token)}")
            elif appt.room_token:
                lines.append(
                    f"{label}: room already {appt.room_status}. Candidate link: {portal_link(appt.room_token)}"
                )
    return "\n".join(lines)


@tool
async def set_interview_recording(
    appointment_ids: list[str], enabled: bool, state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """Turn recording on or off for one or more interviews' rooms."""
    lines = []
    async with session() as db:
        user = await load_hr(db, state)
        for appointment_id in appointment_ids:
            appt = await owned_appointment(db, state["hr_id"], appointment_id)
            if appt is None:
                lines.append(f"{appointment_id}: not one of your interviews")
                continue
            label = await _label(db, appt, state)
            _r, err = await call(
                db,
                update_room_settings(
                    appt.id, RoomSettingsInput(recording_enabled=enabled), db=db, current_user=user
                ),
            )
            lines.append(f"{label}: recording {'on' if enabled else 'off'}." if err is None else f"{label}: {err}")
    return "\n".join(lines)


@tool
async def set_interview_ai_assist(
    appointment_ids: list[str], enabled: bool, state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """Turn live AI interview assistance on or off for interviews that haven't
    started (both speakers' audio is transcribed by OpenAI and each answered
    question is evaluated for the interviewer; the candidate is warned on the
    join screen). It can only be turned ON before the interview starts -- for a
    live one it can only be turned off."""
    lines = []
    async with session() as db:
        user = await load_hr(db, state)
        for appointment_id in appointment_ids:
            appt = await owned_appointment(db, state["hr_id"], appointment_id)
            if appt is None:
                lines.append(f"{appointment_id}: not one of your interviews")
                continue
            label = await _label(db, appt, state)
            _r, err = await call(
                db,
                update_room_settings(
                    appt.id, RoomSettingsInput(ai_assist_enabled=enabled), db=db, current_user=user
                ),
            )
            lines.append(f"{label}: AI assistance {'on' if enabled else 'off'}." if err is None else f"{label}: {err}")
    return "\n".join(lines)


@tool
async def save_interview_notes(
    appointment_id: str,
    notes: str,
    state: Annotated[HrAssistantState, InjectedState],
    append: bool = True,
) -> str:
    """Save the HR's own notes for an interview (pre-meeting prep or live
    notes). APPENDS to existing notes by default; append=false replaces them."""
    async with session() as db:
        user = await load_hr(db, state)
        appt = await owned_appointment(db, state["hr_id"], appointment_id)
        if appt is None:
            return "No interview with that id is assigned to you."
        text = f"{appt.interviewer_notes}\n{notes}".strip() if append and appt.interviewer_notes else notes
        _r, err = await call(db, save_notes(appt.id, NotesInput(notes=text), db=db, current_user=user))
        return "Notes saved." if err is None else err


@tool
async def save_interview_review(
    appointment_id: str, review: str, state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """Write (or replace) the interviewer's post-interview review/assessment
    for an interview. Replaces any existing review -- if one exists and the HR
    wants to add to it, read it first with get_interview_record and include it."""
    async with session() as db:
        user = await load_hr(db, state)
        appt = await owned_appointment(db, state["hr_id"], appointment_id)
        if appt is None:
            return "No interview with that id is assigned to you."
        _r, err = await call(
            db, save_review(appt.id, ReviewInput(review=review), db=db, current_user=user)
        )
        return "Review saved." if err is None else err


@tool
async def generate_interview_questions(
    appointment_id: str,
    state: Annotated[HrAssistantState, InjectedState],
    focus: str | None = None,
) -> str:
    """Generate AI-prepared interview questions for an interview (based on the
    candidate's CV, the job and their online profiles), optionally steered by
    a focus/instruction such as "focus on system design". Saved on the
    interview, replacing earlier ones."""
    async with session() as db:
        user = await load_hr(db, state)
        appt = await owned_appointment(db, state["hr_id"], appointment_id)
        if appt is None:
            return "No interview with that id is assigned to you."
        result, err = await call(
            db,
            generate_questions(appt.id, AiQuestionsInput(prompt=focus), db=db, current_user=user),
        )
        if err is not None:
            return f"Couldn't generate questions: {err}"
        questions = (result.ai_questions or {}).get("questions", [])
        if not questions:
            return "Questions were generated and saved on the interview."
        return "Saved these questions on the interview:\n" + "\n".join(
            f"- [{q.get('topic', '')}] {q.get('question', q)}" for q in questions
        )


@tool
async def get_interview_transcript(
    appointment_id: str, state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """The final transcript of a finished interview, as text (long ones are
    cut off). Use it to answer questions about what was said."""
    async with session() as db:
        user = await load_hr(db, state)
        appt = await owned_appointment(db, state["hr_id"], appointment_id)
        if appt is None:
            return "No interview with that id is assigned to you."
        result, err = await call(db, get_final_transcript(appt.id, db=db, current_user=user))
        if err is not None:
            return f"No transcript available: {err}"
        lines = [f"{s.get('speaker')}: {s.get('text')}" for s in result.segments]
        text = "\n".join(lines)
        if len(text) > MAX_TRANSCRIPT_CHARS:
            text = text[:MAX_TRANSCRIPT_CHARS] + "\n... (transcript cut off)"
        return text


@tool(response_format="content_and_artifact")
async def get_interview_recording(
    appointment_id: str, state: Annotated[HrAssistantState, InjectedState]
) -> tuple[str, list[dict]]:
    """Attach the recording of a finished interview to your reply as a file
    the HR can open or download. Don't paste any link yourself."""
    async with session() as db:
        appt = await owned_appointment(db, state["hr_id"], appointment_id)
        if appt is None:
            return "No interview with that id is assigned to you.", []
        if not appt.recording_object_key:
            return "That interview has no recording.", []
        applicant = await db.get(Applicant, appt.applicant_id)
        name = f"interview-{(applicant.name if applicant else 'candidate').replace(' ', '-')}.webm"
        url = get_cv_download_url(appt.recording_object_key, name, inline=True, expires_minutes=60)
        download = get_cv_download_url(appt.recording_object_key, name, inline=False, expires_minutes=60)
        return (
            f"Attached the recording '{name}' to the reply; the HR can open it there.",
            [attachment(name, url, download, "video")],
        )


INTERVIEW_ACTION_TOOLS = [
    setup_interview_rooms,
    set_interview_recording,
    set_interview_ai_assist,
    save_interview_notes,
    save_interview_review,
    generate_interview_questions,
    get_interview_transcript,
    get_interview_recording,
]
