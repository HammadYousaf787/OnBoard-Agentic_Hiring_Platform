"""Calendar tools. Reads (check_availability, suggest_free_slots,
list_my_interviews) are plain; every tool that books, moves or cancels an
interview takes a LIST and pauses once for the whole batch -- "schedule all my
candidates on Wednesday" is one confirmation card, not one per candidate.

Actual writes call the same router functions as the UI (see _actions.py), so
slot-overlap/stage rules are never re-implemented here. The pre-interrupt
checks below are only to avoid asking the HR to confirm something that is
certain to fail.
"""

import uuid
from datetime import datetime, time, timedelta, timezone
from typing import Annotated

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.assistant.state import HrAssistantState
from app.assistant.tools._actions import (
    ask_confirmation,
    call,
    declined_message,
    fmt_when,
    hr_zone,
    Prepared,
    load_hr,
    owned_appointment,
    parse_when,
)
from app.assistant.tools._db import session
from app.assistant.tools.applicants import _owned_applicant
from app.models.applicant import Applicant
from app.models.appointment import Appointment
from app.models.enums import ApplicantStage
from app.routers.applicants import (
    SLOT_MINUTES,
    reschedule_appointment,
    schedule_interview as schedule_interview_endpoint,
    toggle_notify,
    validate_interview_slot,
)
from app.routers.interviews import delete_appointment
from app.schemas.applicant import RescheduleInput, ScheduleInterviewInput


async def _busy(db, hr_id: uuid.UUID, start: datetime, end: datetime) -> list[Appointment]:
    return list(
        (
            await db.execute(
                select(Appointment)
                .where(
                    Appointment.hr_id == hr_id,
                    Appointment.room_status != "ended",
                    Appointment.scheduled_at >= start - timedelta(minutes=SLOT_MINUTES),
                    Appointment.scheduled_at < end,
                )
                .order_by(Appointment.scheduled_at)
            )
        )
        .scalars()
        .all()
    )


@tool
async def check_availability(
    from_date: str, to_date: str, state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """List this HR's existing (unfinished) interviews between two dates
    (YYYY-MM-DD, inclusive, in the HR's own timezone). Each takes a 60-minute
    slot. Use suggest_free_slots instead when you need open times."""
    zone = hr_zone(state)
    try:
        start = datetime.fromisoformat(from_date).replace(tzinfo=zone).astimezone(timezone.utc)
        end = (datetime.fromisoformat(to_date).replace(tzinfo=zone) + timedelta(days=1)).astimezone(
            timezone.utc
        )
    except ValueError:
        return "Dates must be ISO format, e.g. 2026-10-01."
    async with session() as db:
        appts = [
            a
            for a in await _busy(db, uuid.UUID(state["hr_id"]), start, end)
            if start <= a.scheduled_at < end
        ]
        if not appts:
            return f"No interviews between {from_date} and {to_date} -- fully free."
        return "Busy slots:\n" + "\n".join(
            f"- {fmt_when(a.scheduled_at, state)} (60 min)" for a in appts
        )


@tool
async def suggest_free_slots(
    date: str,
    state: Annotated[HrAssistantState, InjectedState],
    start_hour: int = 9,
    end_hour: int = 17,
    max_slots: int = 12,
) -> str:
    """Open 60-minute slots on one day (YYYY-MM-DD, HR's local time) between
    start_hour and end_hour (24h local, default 9-17), skipping the HR's
    existing interviews and times already past. Returns ready-to-use ISO
    times to pass to schedule_interviews."""
    zone = hr_zone(state)
    try:
        day = datetime.fromisoformat(date).date()
    except ValueError:
        return "Date must be ISO format, e.g. 2026-10-01."
    day_start = datetime.combine(day, time(0), tzinfo=zone) + timedelta(hours=start_hour)
    day_end = datetime.combine(day, time(0), tzinfo=zone) + timedelta(hours=end_hour)
    now = datetime.now(timezone.utc)

    async with session() as db:
        busy = await _busy(db, uuid.UUID(state["hr_id"]), day_start, day_end)
    slots, cursor = [], day_start
    while cursor + timedelta(minutes=SLOT_MINUTES) <= day_end and len(slots) < max_slots:
        end = cursor + timedelta(minutes=SLOT_MINUTES)
        clash = any(
            a.scheduled_at < end and a.scheduled_at + timedelta(minutes=SLOT_MINUTES) > cursor
            for a in busy
        )
        if not clash and cursor > now:
            slots.append(cursor.isoformat())
        cursor = end
    if not slots:
        return f"No free {SLOT_MINUTES}-minute slots on {date} between {start_hour}:00 and {end_hour}:00."
    return f"Free slots on {date} ({zone.key}):\n" + "\n".join(f"- {s}" for s in slots)


@tool
async def list_my_interviews(
    state: Annotated[HrAssistantState, InjectedState],
    from_date: str | None = None,
    to_date: str | None = None,
    include_finished: bool = False,
) -> str:
    """Your interviews with ids, candidate, time and room status. Optionally
    limit to a date range (YYYY-MM-DD, local, inclusive). By default only
    unfinished ones; set include_finished for past interviews too. Use this to
    find the appointment id needed for rescheduling, notes, rooms, etc."""
    zone = hr_zone(state)
    async with session() as db:
        query = select(Appointment).where(Appointment.hr_id == uuid.UUID(state["hr_id"]))
        if not include_finished:
            query = query.where(Appointment.room_status != "ended")
        try:
            if from_date:
                query = query.where(
                    Appointment.scheduled_at >= datetime.fromisoformat(from_date).replace(tzinfo=zone)
                )
            if to_date:
                query = query.where(
                    Appointment.scheduled_at
                    < datetime.fromisoformat(to_date).replace(tzinfo=zone) + timedelta(days=1)
                )
        except ValueError:
            return "Dates must be ISO format, e.g. 2026-10-01."
        appts = (await db.execute(query.order_by(Appointment.scheduled_at))).scalars().all()
        if not appts:
            return "No interviews match."
        lines = []
        for a in appts:
            applicant = await db.get(Applicant, a.applicant_id)
            lines.append(
                f"- {fmt_when(a.scheduled_at, state)} · {applicant.name if applicant else '?'} "
                f"(applicant_id={a.applicant_id}) · appointment_id={a.id} · room={a.room_status} · "
                f"recording={'on' if a.recording_enabled else 'off'}"
            )
        return "\n".join(lines)


class Booking(BaseModel):
    applicant_id: str
    scheduled_at: str = Field(
        description="ISO datetime, e.g. 2026-10-07T10:00:00. No offset = the HR's local time."
    )


async def prepare_bookings(state: dict, bookings: list[Booking]) -> Prepared:
    hr_id = uuid.UUID(state["hr_id"])
    out = Prepared()
    chosen: list[tuple[uuid.UUID, datetime]] = []
    async with session() as db:
        for b in bookings:
            found = await _owned_applicant(db, hr_id, b.applicant_id)
            if found is None:
                out.problems.append(f"{b.applicant_id}: not one of your applicants")
                continue
            applicant, _job = found
            try:
                when = parse_when(b.scheduled_at, state)
            except ValueError:
                out.problems.append(f"{applicant.name}: '{b.scheduled_at}' isn't a valid date/time")
                continue
            if applicant.stage not in (ApplicantStage.assessment_passed, ApplicantStage.interview_scheduled):
                out.problems.append(f"{applicant.name}: can't be scheduled from stage '{applicant.stage.value}'")
                continue
            # Overlaps within this same batch (the DB doesn't know about them yet).
            if any(abs((when - w).total_seconds()) < SLOT_MINUTES * 60 for _i, w in chosen):
                out.problems.append(
                    f"{applicant.name}: {fmt_when(when, state)} overlaps another booking in this batch"
                )
                continue
            if any(i == applicant.id for i, _w in chosen):
                out.problems.append(f"{applicant.name}: listed twice")
                continue
            try:
                await validate_interview_slot(db, when, hr_id, applicant.id)
            except Exception as exc:  # HTTPException -- keep the reason
                out.problems.append(f"{applicant.name}: {getattr(exc, 'detail', exc)}")
                continue
            chosen.append((applicant.id, when))
            out.ready.append((applicant.id, applicant.name, when))
    out.ready.sort(key=lambda x: x[2])
    out.lines = [f"Book: {n} — {fmt_when(w, state)}" for _i, n, w in out.ready]
    return out


async def run_bookings(state: dict, prepared: Prepared, notify_day_before: bool = True) -> list[str]:
    results = []
    async with session() as db:
        user = await load_hr(db, state)
        for applicant_id, name, when in prepared.ready:
            _appt, err = await call(
                db,
                schedule_interview_endpoint(
                    applicant_id,
                    ScheduleInterviewInput(scheduled_at=when, notify_day_before=notify_day_before),
                    db=db,
                    current_user=user,
                ),
            )
            results.append(
                f"Booked {name} for {fmt_when(when, state)}." if err is None else f"FAILED {name}: {err}"
            )
    return results


@tool
async def schedule_interviews(
    bookings: list[Booking],
    state: Annotated[HrAssistantState, InjectedState],
    notify_day_before: bool = True,
) -> str:
    """Book interviews for one or MORE candidates in a single call -- always
    put every booking the HR asked for in this one call, never one call per
    candidate. The HR gets one grouped confirmation. Candidates must be in
    'Interview Pending' (assessment_passed) or already scheduled. Propose the
    times to the HR first (use suggest_free_slots); this pauses for a final
    confirmation regardless. If the request ALSO involves other kinds of
    change (moves, cancellations, stage changes) use apply_changes instead."""
    prepared = await prepare_bookings(state, bookings)
    if not prepared.ready:
        return "Nothing to book. " + "; ".join(prepared.problems)
    n = len(prepared.ready)
    ok, note = ask_confirmation(f"Book {n} interview{'s' if n != 1 else ''}", prepared.lines)
    if not ok:
        return declined_message(note)
    skipped = [f"Skipped: {p}" for p in prepared.problems]
    return "\n".join(skipped + await run_bookings(state, prepared, notify_day_before))


class Move(BaseModel):
    appointment_id: str
    scheduled_at: str = Field(description="New ISO datetime. No offset = the HR's local time.")


async def prepare_reschedules(state: dict, moves: list[Move]) -> Prepared:
    hr_id = uuid.UUID(state["hr_id"])
    out = Prepared()
    chosen: list[datetime] = []
    async with session() as db:
        for m in moves:
            appt = await owned_appointment(db, state["hr_id"], m.appointment_id)
            if appt is None:
                out.problems.append(f"{m.appointment_id}: not one of your interviews")
                continue
            applicant = await db.get(Applicant, appt.applicant_id)
            try:
                when = parse_when(m.scheduled_at, state)
            except ValueError:
                out.problems.append(f"{applicant.name}: '{m.scheduled_at}' isn't a valid date/time")
                continue
            if appt.room_status == "ended":
                out.problems.append(f"{applicant.name}: that interview already took place")
                continue
            if any(abs((when - w).total_seconds()) < SLOT_MINUTES * 60 for w in chosen):
                out.problems.append(
                    f"{applicant.name}: {fmt_when(when, state)} overlaps another move in this batch"
                )
                continue
            try:
                await validate_interview_slot(db, when, hr_id, appt.applicant_id, exclude_id=appt.id)
            except Exception as exc:
                out.problems.append(f"{applicant.name}: {getattr(exc, 'detail', exc)}")
                continue
            chosen.append(when)
            out.ready.append((appt.id, applicant.name, when))
            out.lines.append(
                f"Reschedule: {applicant.name} — {fmt_when(appt.scheduled_at, state)} → {fmt_when(when, state)}"
            )
    return out


async def run_reschedules(state: dict, prepared: Prepared) -> list[str]:
    results = []
    async with session() as db:
        user = await load_hr(db, state)
        for appointment_id, name, when in prepared.ready:
            _r, err = await call(
                db,
                reschedule_appointment(
                    appointment_id, RescheduleInput(scheduled_at=when), db=db, current_user=user
                ),
            )
            results.append(
                f"Moved {name} to {fmt_when(when, state)}." if err is None else f"FAILED {name}: {err}"
            )
    return results


@tool
async def reschedule_interviews(
    moves: list[Move], state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """Move one or MORE existing interviews to new times in a single call
    (one grouped confirmation). Get appointment ids from list_my_interviews.
    Already-finished interviews can't be moved. If the request ALSO involves
    other kinds of change use apply_changes instead."""
    prepared = await prepare_reschedules(state, moves)
    if not prepared.ready:
        return "Nothing to move. " + "; ".join(prepared.problems)
    n = len(prepared.ready)
    ok, note = ask_confirmation(f"Reschedule {n} interview{'s' if n != 1 else ''}", prepared.lines)
    if not ok:
        return declined_message(note)
    skipped = [f"Skipped: {p}" for p in prepared.problems]
    return "\n".join(skipped + await run_reschedules(state, prepared))


async def prepare_cancellations(state: dict, appointment_ids: list[str]) -> Prepared:
    out = Prepared()
    async with session() as db:
        for appointment_id in appointment_ids:
            appt = await owned_appointment(db, state["hr_id"], appointment_id)
            if appt is None:
                out.problems.append(f"{appointment_id}: not one of your interviews")
                continue
            applicant = await db.get(Applicant, appt.applicant_id)
            if appt.room_status in ("live", "ended"):
                out.problems.append(f"{applicant.name}: interview is {appt.room_status}, can't be removed")
                continue
            out.ready.append((appt.id, applicant.name))
            out.lines.append(f"Cancel: {applicant.name} — {fmt_when(appt.scheduled_at, state)}")
    return out


async def run_cancellations(state: dict, prepared: Prepared) -> list[str]:
    results = []
    async with session() as db:
        user = await load_hr(db, state)
        for appointment_id, name in prepared.ready:
            _r, err = await call(db, delete_appointment(appointment_id, db=db, current_user=user))
            results.append(f"Cancelled {name}'s interview." if err is None else f"FAILED {name}: {err}")
    return results


@tool
async def cancel_interviews(
    appointment_ids: list[str], state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """Cancel (remove) one or MORE interview slots in a single call, with one
    grouped confirmation. Only interviews that haven't started can be removed;
    a candidate left with no interview returns to 'Interview Pending'. If the
    request ALSO involves other kinds of change use apply_changes instead."""
    prepared = await prepare_cancellations(state, appointment_ids)
    if not prepared.ready:
        return "Nothing to cancel. " + "; ".join(prepared.problems)
    n = len(prepared.ready)
    ok, note = ask_confirmation(f"Cancel {n} interview{'s' if n != 1 else ''}", prepared.lines)
    if not ok:
        return declined_message(note)
    skipped = [f"Skipped: {p}" for p in prepared.problems]
    return "\n".join(skipped + await run_cancellations(state, prepared))


@tool
async def set_interview_reminders(
    appointment_ids: list[str], enabled: bool, state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """Turn the "notify the candidate the day before" reminder on or off for
    one or more interviews."""
    results = []
    async with session() as db:
        user = await load_hr(db, state)
        for appointment_id in appointment_ids:
            appt = await owned_appointment(db, state["hr_id"], appointment_id)
            if appt is None:
                results.append(f"{appointment_id}: not one of your interviews")
            elif appt.notify_day_before == enabled:
                results.append(f"{appointment_id}: already {'on' if enabled else 'off'}")
            else:
                _r, err = await call(db, toggle_notify(appt.id, db=db, current_user=user))
                results.append(
                    f"{appointment_id}: reminder {'on' if enabled else 'off'}"
                    if err is None
                    else f"{appointment_id}: {err}"
                )
    return "\n".join(results)


SCHEDULING_TOOLS = [
    check_availability,
    suggest_free_slots,
    list_my_interviews,
    schedule_interviews,
    reschedule_interviews,
    cancel_interviews,
    set_interview_reminders,
]
