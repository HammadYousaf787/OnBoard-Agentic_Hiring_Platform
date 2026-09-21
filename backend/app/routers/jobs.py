import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import delete_cv, delete_prefix
from app.database import get_db
from app.deps import require_admin, require_any_role
from app.models.applicant import Applicant
from app.models.appointment import Appointment
from app.models.enums import Role
from app.models.job import Job
from app.models.user import User
from app.schemas.job import JobAssignHr, JobCreate, JobRead, JobUpdate

router = APIRouter(prefix="/jobs", tags=["jobs"])


async def _get_job_or_404(db: AsyncSession, job_id: uuid.UUID) -> Job:
    job = await db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return job


def _ensure_job_access(job: Job, user: User) -> None:
    """Admins can access any job; HRs only the ones assigned to them."""
    if user.role == Role.hr and job.assigned_hr_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This job is not assigned to you.",
        )


async def _to_job_read(db: AsyncSession, job: Job) -> JobRead:
    count_result = await db.execute(
        select(func.count()).select_from(Applicant).where(Applicant.job_id == job.id)
    )
    job_read = JobRead.model_validate(job)
    job_read.applicant_count = count_result.scalar_one()
    return job_read


@router.get("", response_model=list[JobRead])
async def list_jobs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> list[JobRead]:
    query = select(Job).order_by(Job.created_at.desc())
    if current_user.role == Role.hr:
        query = query.where(Job.assigned_hr_id == current_user.id)
    result = await db.execute(query)
    jobs = result.scalars().all()
    return [await _to_job_read(db, job) for job in jobs]


@router.post("", response_model=JobRead, status_code=status.HTTP_201_CREATED)
async def create_job(
    payload: JobCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> JobRead:
    job = Job(**payload.model_dump(), created_by_id=admin.id)
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return await _to_job_read(db, job)


@router.get("/{job_id}", response_model=JobRead)
async def get_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> JobRead:
    job = await _get_job_or_404(db, job_id)
    _ensure_job_access(job, current_user)
    return await _to_job_read(db, job)


@router.patch("/{job_id}", response_model=JobRead)
async def update_job(
    job_id: uuid.UUID,
    payload: JobUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> JobRead:
    job = await _get_job_or_404(db, job_id)
    _ensure_job_access(job, current_user)

    for field, value in payload.model_dump().items():
        setattr(job, field, value)

    db.add(job)
    await db.commit()
    await db.refresh(job)
    return await _to_job_read(db, job)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> None:
    job = await _get_job_or_404(db, job_id)
    _ensure_job_access(job, current_user)

    cv_keys = (
        await db.execute(
            select(Applicant.cv_object_key).where(
                Applicant.job_id == job.id, Applicant.cv_object_key.is_not(None)
            )
        )
    ).scalars().all()

    appointment_ids = (
        await db.execute(select(Appointment.id).where(Appointment.job_id == job.id))
    ).scalars().all()

    await db.delete(job)
    await db.commit()
    for key in cv_keys:
        delete_cv(key)
    for appointment_id in appointment_ids:
        delete_prefix(f"interviews/{appointment_id}/")


@router.post("/{job_id}/assign-hr", response_model=JobRead)
async def assign_hr(
    job_id: uuid.UUID,
    payload: JobAssignHr,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> JobRead:
    job = await _get_job_or_404(db, job_id)

    if payload.hr_id is not None:
        hr_user = await db.get(User, payload.hr_id)
        if hr_user is None or hr_user.role != Role.hr:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="HR user not found.")

    job.assigned_hr_id = payload.hr_id
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return await _to_job_read(db, job)
