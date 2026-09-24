"""Shared plumbing for the assistant's write tools.

Three rules every write tool follows:
1. It performs the change by calling the SAME router function the UI's button
   calls (app/routers/*.py), passing the HR's real User -- so every business
   rule (stage transitions, slot overlap, ownership) lives in exactly one
   place and the agent can never do something the UI would refuse.
2. Changes that are hard to undo (stage moves, accept/reject, booking,
   cancelling, deleting) first pause with ask_confirmation() -- ONE pause for
   the whole batch, not one per item (see GRAPH.txt).
3. Anything before the interrupt() must be read-only: LangGraph re-runs the
   tool from the top when the HR answers.
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from langgraph.types import interrupt
from sqlalchemy.ext.asyncio import AsyncSession

from app.assistant.tools.applicants import _owned_applicant  # noqa: F401 - re-exported for tools
from app.config import get_settings
from app.models.appointment import Appointment
from app.models.user import User


async def load_hr(db: AsyncSession, state: dict) -> User | None:
    return await db.get(User, uuid.UUID(state["hr_id"]))


async def owned_appointment(db: AsyncSession, hr_id: str, appointment_id: str) -> Appointment | None:
    try:
        appointment = await db.get(Appointment, uuid.UUID(appointment_id))
    except ValueError:
        return None
    if appointment is None or str(appointment.hr_id) != hr_id:
        return None
    return appointment


async def call(db: AsyncSession, awaitable) -> tuple[Any, str | None]:
    """Await a router function; turn its HTTPException into an error string
    the model can relay, rolling the session back so the next item still works."""
    try:
        return await awaitable, None
    except HTTPException as exc:
        await db.rollback()
        return None, str(exc.detail)


@dataclass
class Prepared:
    """Result of the read-only 'prepare' half of a write tool: what would be
    changed (`lines`, shown on the confirmation card), what was dropped and why
    (`problems`), and `ready`, an opaque list handed back to the matching
    run_* function after the HR confirms. Splitting prepare/run is what lets
    apply_changes (tools/combined.py) put several kinds of change on ONE card."""

    lines: list[str] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)
    ready: list = field(default_factory=list)


def ask_confirmation(title: str, items: list[str]) -> tuple[bool, str | None]:
    """Pause the graph and show the HR one confirmation card listing every
    change in the batch. Returns (approved, note-if-declined)."""
    decision = interrupt({"action": "confirm_changes", "title": title, "items": items})
    if isinstance(decision, dict) and decision.get("decision") == "confirm":
        return True, None
    note = decision.get("note") if isinstance(decision, dict) else None
    return False, note


def declined_message(note: str | None) -> str:
    base = "Nothing was changed -- the HR did not confirm."
    return f"{base} They said: {note}" if note else f"{base} Ask what they'd like to change."


def hr_zone(state: dict) -> ZoneInfo:
    try:
        return ZoneInfo(state.get("tz") or "UTC")
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def parse_when(value: str, state: dict) -> datetime:
    """ISO datetime -> aware UTC. A string with no offset is read as the HR's
    own local time (that's what they mean by "10am"). Raises ValueError."""
    when = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if when.tzinfo is None:
        when = when.replace(tzinfo=hr_zone(state))
    return when.astimezone(timezone.utc)


def fmt_when(when: datetime, state: dict) -> str:
    local = when.astimezone(hr_zone(state))
    return local.strftime("%a %d %b %Y, %H:%M") + f" ({local.tzname()})"


def portal_link(room_token: str) -> str:
    return f"{get_settings().apply_portal_origin}/interview/{room_token}"


def attachment(name: str, url: str, download_url: str | None = None, kind: str = "file") -> dict:
    """A file the frontend renders as a card in the chat (see AssistantPanel).
    Returned through a tool's `artifact` channel so it never enters the
    model's context -- only a short "attached X" line does."""
    return {"name": name, "url": url, "download_url": download_url or url, "kind": kind}
