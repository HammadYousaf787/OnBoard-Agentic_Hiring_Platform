"""Write tools for candidates: HR rating/notes, AI reviews, moving between
stages, accept/reject, ranking, CV bank, deleting.

Confirmation policy (see _actions.py): stage moves, accept/reject and
deletes pause once for the whole batch. Ratings, notes, AI reviews, ranking
and CV-bank saving don't -- they're cheap, visible and easy to redo, and
asking about each would make the assistant tedious.
"""

import uuid
from typing import Annotated, Literal

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from pydantic import BaseModel, Field, ValidationError

from app.assistant.state import HrAssistantState
from app.assistant.tools._actions import (
    Prepared,
    ask_confirmation,
    call,
    declined_message,
    load_hr,
)
from app.assistant.tools._db import session
from app.assistant.tools.applicants import _owned_applicant
from app.models.enums import ApplicantStage
from app.routers.ai_review import run_ai_job_review
from app.routers.applicants import (
    accept_applicant,
    delete_applicant,
    forward_coding_assessment,
    pass_to_interview,
    reject_applicant,
    save_hr_assessment,
    save_to_cv_bank,
    set_applicant_order as set_applicant_order_endpoint,
)
from app.routers.users import update_my_settings
from app.schemas.applicant import ApplicantOrderInput, HrAssessmentInput, RejectApplicantInput
from app.schemas.user import HrSettingsUpdate

MAX_BATCH = 25

S = ApplicantStage
# Target -> stages it can be reached from. Mirrors the checks inside the
# router functions (which stay the source of truth and re-check on execution);
# this copy only lets us drop hopeless items BEFORE asking the HR to confirm.
_FROM = {
    "coding_assessment": {S.applied},
    "interview_pending": {S.applied, S.coding_assessment},
    "accepted": {S.interview_scheduled},
    "rejected": {S.applied, S.coding_assessment, S.assessment_passed, S.interview_scheduled},
}
_LABEL = {
    "coding_assessment": "Coding assessment",
    "interview_pending": "Interview pending",
    "accepted": "Accepted",
    "rejected": "Rejected",
}


class Rating(BaseModel):
    applicant_id: str
    score: float | None = Field(default=None, description="HR rating 0.5-5 in 0.5 steps; omit to leave unchanged")
    notes: str | None = Field(default=None, description="HR notes; omit to leave unchanged")


@tool
async def set_hr_ratings(
    ratings: list[Rating],
    state: Annotated[HrAssistantState, InjectedState],
    append_notes: bool = True,
) -> str:
    """Set the HR's own star rating (0.5-5, half steps) and/or notes on one
    or more candidates in one call. By default notes are APPENDED to any
    existing notes; set append_notes=false to replace them. No confirmation
    needed. This is the HR's rating, separate from the AI review score."""
    results = []
    async with session() as db:
        user = await load_hr(db, state)
        for r in ratings[:MAX_BATCH]:
            found = await _owned_applicant(db, uuid.UUID(state["hr_id"]), r.applicant_id)
            if found is None:
                results.append(f"{r.applicant_id}: not one of your applicants")
                continue
            applicant, _job = found
            fields = {}
            if r.score is not None:
                fields["hr_score"] = r.score
            if r.notes is not None:
                existing = applicant.hr_notes or ""
                fields["hr_notes"] = f"{existing}\n{r.notes}".strip() if append_notes and existing else r.notes
            if not fields:
                results.append(f"{applicant.name}: nothing to change")
                continue
            try:
                payload = HrAssessmentInput(**fields)
            except ValidationError as exc:
                results.append(f"{applicant.name}: {exc.errors()[0]['msg']}")
                continue
            name = applicant.name
            _r, err = await call(
                db, save_hr_assessment(applicant.id, payload, db=db, current_user=user)
            )
            results.append(f"{name}: saved ({', '.join(fields)})" if err is None else f"{name}: {err}")
    return "\n".join(results)


@tool
async def run_ai_reviews(
    applicant_ids: list[str], state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """Run the AI Job Review (scores + reasoning) for one or more candidates.
    Uses the same pipeline as the "Run AI review" button (GitHub/LinkedIn
    lookup + OpenAI) and replaces any previous review. Slow (several seconds
    each) and costs a little, so only run what was asked for; max 10 per call.
    Scores are a recommendation only."""
    results = []
    async with session() as db:
        user = await load_hr(db, state)
        for applicant_id in applicant_ids[:10]:
            found = await _owned_applicant(db, uuid.UUID(state["hr_id"]), applicant_id)
            if found is None:
                results.append(f"{applicant_id}: not one of your applicants")
                continue
            name = found[0].name
            a, err = await call(
                db, run_ai_job_review(uuid.UUID(applicant_id), db=db, current_user=user)
            )
            if err is not None:
                results.append(f"{name}: review failed -- {err}")
                continue
            reasoning = (a.ai_review_details or {}).get("overall", {}).get("reasoning", "")
            results.append(
                f"{name}: overall {a.overall_score} (communication {a.communication_score}, "
                f"JD overlap {a.jd_overlap_score}, GitHub {a.github_score}, LinkedIn {a.linkedin_score}). "
                f"{reasoning}"
            )
    return "\n".join(results)


class StageMove(BaseModel):
    applicant_id: str
    to: Literal["coding_assessment", "interview_pending", "accepted", "rejected"]
    note: str | None = Field(default=None, description="Rejection note (only used when to='rejected')")
    save_to_cv_bank: bool = Field(default=False, description="Rejected only: also keep them in the CV bank")


async def prepare_moves(state: dict, moves: list[StageMove]) -> Prepared:
    hr_id = uuid.UUID(state["hr_id"])
    out = Prepared()
    seats_used: dict[uuid.UUID, int] = {}
    async with session() as db:
        for m in moves[:MAX_BATCH]:
            found = await _owned_applicant(db, hr_id, m.applicant_id)
            if found is None:
                out.problems.append(f"{m.applicant_id}: not one of your applicants")
                continue
            a, job = found
            if a.stage not in _FROM[m.to]:
                out.problems.append(f"{a.name}: can't go from '{a.stage.value}' to '{m.to}'")
                continue
            if m.to == "coding_assessment" and not job.collect_github:
                out.problems.append(f"{a.name}: coding assessments only apply to technical roles")
                continue
            line = f"Move: {a.name}: {a.stage.value.replace('_', ' ')} → {_LABEL[m.to]}"
            if m.to == "accepted":
                seats_used[job.id] = seats_used.get(job.id, 0) + 1
                line += f" (seat {job.filled_seats + seats_used[job.id]} of {job.seats} for {job.title})"
            if m.to == "rejected" and m.note:
                line += f' — note: "{m.note}"'
            out.ready.append((a.id, a.name, m))
            out.lines.append(line)
    return out


async def run_moves(state: dict, prepared: Prepared) -> list[str]:
    results = []
    async with session() as db:
        user = await load_hr(db, state)
        for applicant_id, name, m in prepared.ready:
            if m.to == "coding_assessment":
                aw = forward_coding_assessment(applicant_id, db=db, current_user=user)
            elif m.to == "interview_pending":
                aw = pass_to_interview(applicant_id, db=db, current_user=user)
            elif m.to == "accepted":
                aw = accept_applicant(applicant_id, db=db, current_user=user)
            else:
                aw = reject_applicant(
                    applicant_id,
                    RejectApplicantInput(note=m.note, save_to_cv_bank=m.save_to_cv_bank),
                    db=db,
                    current_user=user,
                )
            _r, err = await call(db, aw)
            results.append(f"{name} → {_LABEL[m.to]}." if err is None else f"FAILED {name}: {err}")
    return results


@tool
async def move_applicants(
    moves: list[StageMove], state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """Move one or MORE candidates to a new stage in a single call (one
    grouped confirmation). Call this IMMEDIATELY when the HR asks for a move --
    the HR is asked to confirm by the tool itself, so never ask in chat first. Allowed targets and where they can come from:
    coding_assessment (from applied, technical jobs only) · interview_pending
    (from applied/coding_assessment) · accepted (only from interview_scheduled;
    uses up a job seat) · rejected (from any open stage). To put someone in
    'interview scheduled' book an interview with schedule_interviews instead.
    Moving backwards isn't possible. If the request ALSO involves other kinds
    of change (interview bookings/moves/cancellations) use apply_changes."""
    prepared = await prepare_moves(state, moves)
    if not prepared.ready:
        return "Nothing to move. " + "; ".join(prepared.problems)
    n = len(prepared.ready)
    ok, note = ask_confirmation(f"Update {n} candidate{'s' if n != 1 else ''}", prepared.lines)
    if not ok:
        return declined_message(note)
    skipped = [f"Skipped: {p}" for p in prepared.problems]
    return "\n".join(skipped + await run_moves(state, prepared))


@tool
async def save_rejected_to_cv_bank(
    applicant_ids: list[str], state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """Save already-rejected candidates to the shared CV bank (talent pool)
    so they can be found for future openings. No confirmation needed."""
    results = []
    async with session() as db:
        user = await load_hr(db, state)
        for applicant_id in applicant_ids[:MAX_BATCH]:
            found = await _owned_applicant(db, uuid.UUID(state["hr_id"]), applicant_id)
            if found is None:
                results.append(f"{applicant_id}: not one of your applicants")
                continue
            name = found[0].name
            _r, err = await call(
                db, save_to_cv_bank(uuid.UUID(applicant_id), db=db, current_user=user)
            )
            results.append(f"{name}: saved to CV bank." if err is None else f"{name}: {err}")
    return "\n".join(results)


@tool
async def set_applicant_ranking(
    job_id: str, applicant_ids_in_order: list[str], state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """Set HR's manual ranking of a job's applicants (best first), overriding
    the AI order. Must list EVERY applicant of that job exactly once -- get the
    full list with list_my_applicants first. No confirmation needed."""
    async with session() as db:
        user = await load_hr(db, state)
        try:
            payload = ApplicantOrderInput(applicant_ids=[uuid.UUID(i) for i in applicant_ids_in_order])
            job_uuid = uuid.UUID(job_id)
        except (ValueError, ValidationError):
            return "Those ids aren't valid."
        _r, err = await call(
            db, set_applicant_order_endpoint(job_uuid, payload, db=db, current_user=user)
        )
        return "Ranking saved." if err is None else f"Couldn't save the ranking: {err}"


@tool
async def delete_applicants(
    applicant_ids: list[str], state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """PERMANENTLY delete one or more candidates with their CV and interviews.
    One grouped confirmation. Only do this when the HR clearly asked to delete
    (not reject) someone."""
    ready: list[tuple[uuid.UUID, str, str]] = []
    problems: list[str] = []
    async with session() as db:
        for applicant_id in applicant_ids[:MAX_BATCH]:
            found = await _owned_applicant(db, uuid.UUID(state["hr_id"]), applicant_id)
            if found is None:
                problems.append(f"{applicant_id}: not one of your applicants")
                continue
            a, job = found
            ready.append((a.id, a.name, job.title))
    if not ready:
        return "Nothing to delete. " + "; ".join(problems)

    ok, note = ask_confirmation(
        f"Permanently delete {len(ready)} candidate{'s' if len(ready) != 1 else ''}",
        [f"{n} ({title}) — CV and interviews removed too" for _i, n, title in ready],
    )
    if not ok:
        return declined_message(note)

    results = [f"Skipped: {p}" for p in problems]
    async with session() as db:
        user = await load_hr(db, state)
        for applicant_id, name, _t in ready:
            _r, err = await call(db, delete_applicant(applicant_id, db=db, current_user=user))
            results.append(f"Deleted {name}." if err is None else f"FAILED {name}: {err}")
    return "\n".join(results)


@tool
async def set_auto_save_rejected_cvs(
    enabled: bool, state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """Turn the HR's setting "automatically save rejected candidates to the
    CV bank" on or off."""
    async with session() as db:
        user = await load_hr(db, state)
        _r, err = await call(
            db,
            update_my_settings(
                HrSettingsUpdate(auto_save_cv_bank_on_reject=enabled), db=db, current_user=user
            ),
        )
        return f"Auto-save of rejected CVs is now {'on' if enabled else 'off'}." if err is None else err


APPLICANT_ACTION_TOOLS = [
    set_hr_ratings,
    run_ai_reviews,
    move_applicants,
    save_rejected_to_cv_bank,
    set_applicant_ranking,
    delete_applicants,
    set_auto_save_rejected_cvs,
]
