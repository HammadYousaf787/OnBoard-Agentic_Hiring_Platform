"""Job editing. HR can edit their own jobs in the UI (same PATCH endpoint);
creating jobs and assigning HR are admin-only and deliberately NOT exposed
here. Deleting a whole job (which removes every applicant under it) is also
left out -- too destructive to trigger from a chat or voice message.
"""

import uuid
from typing import Annotated, Literal

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from pydantic import ValidationError

from app.assistant.state import HrAssistantState
from app.assistant.tools._actions import ask_confirmation, call, declined_message, load_hr
from app.assistant.tools._db import session
from app.models.job import Job
from app.routers.jobs import update_job as update_job_endpoint
from app.schemas.job import JobUpdate


@tool
async def update_job(
    job_id: str,
    state: Annotated[HrAssistantState, InjectedState],
    title: str | None = None,
    department: str | None = None,
    location: str | None = None,
    description: str | None = None,
    seats: int | None = None,
    salary_min: int | None = None,
    salary_max: int | None = None,
    currency: str | None = None,
    status: Literal["open", "closed"] | None = None,
    collect_github: bool | None = None,
) -> str:
    """Edit one of your job postings -- pass only the fields to change. The
    HR gets a confirmation showing each old -> new value first."""
    changes = {
        k: v
        for k, v in dict(
            title=title, department=department, location=location, description=description,
            seats=seats, salary_min=salary_min, salary_max=salary_max, currency=currency,
            status=status, collect_github=collect_github,
        ).items()
        if v is not None
    }
    if not changes:
        return "No changes were given."

    async with session() as db:
        try:
            job = await db.get(Job, uuid.UUID(job_id))
        except ValueError:
            job = None
        if job is None or str(job.assigned_hr_id) != state["hr_id"]:
            return "No job with that id is assigned to you."
        current = {f: getattr(job, f) for f in JobUpdate.model_fields}
        current["status"] = current["status"].value
        try:
            payload = JobUpdate(**{**current, **changes})
        except ValidationError as exc:
            return f"Invalid change: {exc.errors()[0]['loc']}: {exc.errors()[0]['msg']}"
        title_now = job.title
        diff = [
            f"{k}: {str(current[k])[:60]} → {str(v)[:60]}" for k, v in changes.items() if current[k] != v
        ]
    if not diff:
        return "Those values are already set -- nothing to change."

    ok, note = ask_confirmation(f"Edit job “{title_now}”", diff)
    if not ok:
        return declined_message(note)

    async with session() as db:
        user = await load_hr(db, state)
        _r, err = await call(db, update_job_endpoint(uuid.UUID(job_id), payload, db=db, current_user=user))
        return f"Job updated ({', '.join(changes)})." if err is None else f"Couldn't update the job: {err}"


JOB_ACTION_TOOLS = [update_job]
