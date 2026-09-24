"""Applicant-scoped read tools. Every query joins through Job so an
applicant is only visible if their job is assigned to the calling HR --
same ownership rule as app/routers/applicants.py's _ensure_job_access."""

import uuid
from typing import Annotated

from langgraph.prebuilt import InjectedState
from langchain_core.tools import tool
from sqlalchemy import select

from app.assistant.state import HrAssistantState
from app.assistant.tools._db import session
from app.models.applicant import Applicant
from app.models.enums import ApplicantStage
from app.models.job import Job


async def _owned_applicant(db, hr_id: uuid.UUID, applicant_id: str) -> tuple[Applicant, Job] | None:
    try:
        applicant = await db.get(Applicant, uuid.UUID(applicant_id))
    except ValueError:  # the model passed something that isn't an id
        return None
    if applicant is None:
        return None
    job = await db.get(Job, applicant.job_id)
    if job is None or job.assigned_hr_id != hr_id:
        return None
    return applicant, job


@tool
async def list_my_applicants(
    state: Annotated[HrAssistantState, InjectedState],
    job_id: str | None = None,
    stage: str | None = None,
) -> str:
    """List applicants across all your jobs, optionally filtered to one job
    (job_id) and/or one stage. Valid stages: applied, coding_assessment,
    assessment_passed, interview_scheduled, accepted, rejected."""
    hr_id = uuid.UUID(state["hr_id"])
    async with session() as db:
        query = select(Applicant).join(Job, Applicant.job_id == Job.id).where(
            Job.assigned_hr_id == hr_id
        )
        if job_id:
            query = query.where(Applicant.job_id == uuid.UUID(job_id))
        if stage:
            try:
                query = query.where(Applicant.stage == ApplicantStage(stage))
            except ValueError:
                return f"'{stage}' isn't a valid stage."
        applicants = (await db.execute(query)).scalars().all()
        if not applicants:
            return "No applicants match that."

        lines = []
        for a in applicants:
            ai = f"{a.overall_score:.1f}" if a.overall_score is not None else "n/a"
            hr = f"{a.hr_score:.1f}" if a.hr_score is not None else "n/a"
            lines.append(
                f"- {a.name} (id={a.id}) · job={a.job_id} · stage={a.stage.value} · "
                f"AI score={ai} · HR score={hr}"
            )
        return f"{len(applicants)} applicant(s):\n" + "\n".join(lines)


@tool
async def get_applicant(
    applicant_id: str, state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """Full detail for one applicant: contact info, stage, scores, and
    (if the AI Job Review has run) its reasoning."""
    hr_id = uuid.UUID(state["hr_id"])
    async with session() as db:
        found = await _owned_applicant(db, hr_id, applicant_id)
        if found is None:
            return "No applicant with that id is assigned to you."
        a, job = found
        lines = [
            f"{a.name} -- applied for {job.title}",
            f"Email: {a.email} · Phone: {a.phone_number} · {a.experience_years} yrs experience",
            f"Stage: {a.stage.value}",
            f"GitHub: {a.github_url or 'not provided'} · LinkedIn: {a.linkedin_url or 'not provided'}",
        ]
        if a.overall_score is not None:
            lines.append(f"AI overall score: {a.overall_score:.1f} (a recommendation only)")
        if a.ai_review_details:
            lines.append(f"AI reasoning (overall): {a.ai_review_details.get('overall', {}).get('reasoning', '')}")
        if a.hr_score is not None:
            lines.append(f"HR score: {a.hr_score:.1f}")
        if a.hr_notes:
            lines.append(f"HR notes: {a.hr_notes}")
        if a.stage == ApplicantStage.rejected and a.rejection_note:
            lines.append(f"Rejection note: {a.rejection_note}")
        return "\n".join(lines)


@tool
async def count_by_stage(
    state: Annotated[HrAssistantState, InjectedState], job_id: str | None = None
) -> str:
    """Count your applicants grouped by pipeline stage, optionally for one
    job only."""
    hr_id = uuid.UUID(state["hr_id"])
    async with session() as db:
        query = select(Applicant).join(Job, Applicant.job_id == Job.id).where(
            Job.assigned_hr_id == hr_id
        )
        if job_id:
            query = query.where(Applicant.job_id == uuid.UUID(job_id))
        applicants = (await db.execute(query)).scalars().all()
        if not applicants:
            return "No applicants match that."
        counts: dict[str, int] = {}
        for a in applicants:
            counts[a.stage.value] = counts.get(a.stage.value, 0) + 1
        return ", ".join(f"{stage}: {n}" for stage, n in sorted(counts.items()))


@tool
async def get_profile_links(
    state: Annotated[HrAssistantState, InjectedState],
    applicant_ids: list[str] | None = None,
    job_id: str | None = None,
) -> str:
    """The GitHub and LinkedIn profile URLs candidates gave when applying.
    Pass applicant_ids for specific people, or job_id for everyone who applied
    to one job, or neither for all your applicants (max 50). Give the HR the
    full URLs in your reply, one line per candidate; say 'not provided' where
    a link is missing. Don't invent or guess profile URLs."""
    hr_id = uuid.UUID(state["hr_id"])
    async with session() as db:
        query = select(Applicant).join(Job, Applicant.job_id == Job.id).where(Job.assigned_hr_id == hr_id)
        try:
            if job_id:
                query = query.where(Applicant.job_id == uuid.UUID(job_id))
            if applicant_ids:
                query = query.where(Applicant.id.in_([uuid.UUID(i) for i in applicant_ids]))
        except ValueError:
            return "Those ids aren't valid."
        applicants = (await db.execute(query.order_by(Applicant.name).limit(50))).scalars().all()
        if not applicants:
            return "No applicants match that."
        return "\n".join(
            f"- {a.name} (id={a.id}) -- GitHub: {a.github_url or 'not provided'} | "
            f"LinkedIn: {a.linkedin_url or 'not provided'}"
            for a in applicants
        )


APPLICANT_TOOLS = [list_my_applicants, get_applicant, count_by_stage, get_profile_links]
