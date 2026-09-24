"""Job-scoped read tools -- mirrors app/routers/jobs.py's ownership rule
(assigned_hr_id == the calling HR) without going through HTTP."""

import uuid
from typing import Annotated

from langgraph.prebuilt import InjectedState
from langchain_core.tools import tool
from sqlalchemy import select

from app.assistant.state import HrAssistantState
from app.assistant.tools._db import session
from app.models.applicant import Applicant
from app.models.job import Job


@tool
async def list_my_jobs(state: Annotated[HrAssistantState, InjectedState]) -> str:
    """List every job posting assigned to the current HR: title, department,
    status, seats filled vs total, and how many applicants each has."""
    hr_id = uuid.UUID(state["hr_id"])
    async with session() as db:
        jobs = (
            (await db.execute(select(Job).where(Job.assigned_hr_id == hr_id)))
            .scalars()
            .all()
        )
        if not jobs:
            return "No jobs are assigned to you."

        lines = []
        for job in jobs:
            count = (
                await db.execute(
                    select(Applicant).where(Applicant.job_id == job.id)
                )
            ).scalars().all()
            lines.append(
                f"- {job.title} (id={job.id}) · {job.department} · {job.status.value} · "
                f"{job.filled_seats}/{job.seats} seats filled · {len(count)} applicant(s)"
            )
        return f"{len(jobs)} job(s) assigned to you:\n" + "\n".join(lines)


@tool
async def get_job_details(
    job_id: str, state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """Full detail for one job: pay range, seats, description, and whether
    it's a technical role with a coding-assessment step."""
    hr_id = uuid.UUID(state["hr_id"])
    async with session() as db:
        job = await db.get(Job, uuid.UUID(job_id))
        if job is None or job.assigned_hr_id != hr_id:
            return "No job with that id is assigned to you."
        return (
            f"{job.title} ({job.department}, {job.location})\n"
            f"Status: {job.status.value} · Seats: {job.filled_seats}/{job.seats}\n"
            f"Pay range: {job.currency} {job.salary_min:,} - {job.salary_max:,}\n"
            f"Technical role (coding assessment enabled): {'yes' if job.collect_github else 'no'}\n"
            f"Description: {job.description}"
        )


@tool
async def get_expected_pay_stats(
    job_id: str | None, state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """Average/min/max pay expectation across applicants for a job (or all
    your jobs if job_id is omitted)."""
    # The application form does not currently collect an expected-pay field,
    # so there is nothing to aggregate yet -- say so rather than inventing a number.
    return (
        "Applicants don't currently report an expected pay figure on the application "
        "form, so this can't be calculated yet. This would need a new field on the "
        "public application form first."
    )


JOB_TOOLS = [list_my_jobs, get_job_details, get_expected_pay_stats]
