"""One confirmation for MIXED requests.

The dedicated write tools (schedule_interviews, move_applicants, ...) already
group items of the same kind. This tool covers the other case -- "reject these
two, book that one, and move Sam to Thursday" -- by preparing every kind of
change first (read-only), showing ONE confirmation card listing all of it, and
only then executing. Same prepare/run functions as the dedicated tools, so
there is still exactly one implementation of each change.

Order of execution: cancellations -> reschedules -> bookings -> stage moves
(frees slots before they're reused, and books before anything that would end
a candidate's process).

Known limit: each change is checked against the calendar as it is NOW, so
booking someone into a slot that another change in the same batch is about to
free will be reported as a conflict -- ask again after the batch is done.
"""

from typing import Annotated

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from app.assistant.state import HrAssistantState
from app.assistant.tools._actions import ask_confirmation, declined_message
from app.assistant.tools.applicant_actions import StageMove, prepare_moves, run_moves
from app.assistant.tools.scheduling import (
    Booking,
    Move,
    prepare_bookings,
    prepare_cancellations,
    prepare_reschedules,
    run_bookings,
    run_cancellations,
    run_reschedules,
)


@tool
async def apply_changes(
    state: Annotated[HrAssistantState, InjectedState],
    bookings: list[Booking] | None = None,
    reschedules: list[Move] | None = None,
    cancel_appointment_ids: list[str] | None = None,
    stage_moves: list[StageMove] | None = None,
) -> str:
    """Make SEVERAL KINDS of change at once with a single grouped
    confirmation: new interview bookings, reschedules, cancellations and/or
    candidate stage moves (accept/reject/etc.). Use this instead of the
    separate tools whenever one HR request mixes kinds of change. Pass only the
    lists that apply. Propose the plan to the HR first."""
    sections = [
        ("bookings", await prepare_bookings(state, bookings or []), run_bookings),
        ("reschedules", await prepare_reschedules(state, reschedules or []), run_reschedules),
        (
            "cancellations",
            await prepare_cancellations(state, cancel_appointment_ids or []),
            run_cancellations,
        ),
        ("stage moves", await prepare_moves(state, stage_moves or []), run_moves),
    ]
    problems = [f"Skipped: {p}" for _n, prep, _r in sections for p in prep.problems]
    lines = [line for _n, prep, _r in sections for line in prep.lines]
    if not lines:
        return "Nothing to change. " + "; ".join(p.removeprefix("Skipped: ") for p in problems)

    ok, note = ask_confirmation(f"Apply {len(lines)} change{'s' if len(lines) != 1 else ''}", lines)
    if not ok:
        return declined_message(note)

    by_name = {name: (prep, run) for name, prep, run in sections}
    results = list(problems)
    for name in ("cancellations", "reschedules", "bookings", "stage moves"):
        prep, run = by_name[name]
        if prep.ready:
            results += await run(state, prep)
    return "\n".join(results)


COMBINED_TOOLS = [apply_changes]
