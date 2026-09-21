"""Unauthenticated endpoints used by the separate applicant-facing portal
(apply-portal/). Everything here is reachable by anyone on the internet,
so inputs are validated strictly and the write path is rate-limited."""

import os
import uuid
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cv_extract import extract_cv_text
from app.core.rate_limit import SlidingWindowLimiter
from app.core.storage import upload_cv
from app.database import get_db
from app.models.applicant import Applicant
from app.models.enums import JobStatus
from app.models.job import Job
from app.schemas.public import ApplicationReceipt, PublicJobRead

router = APIRouter(prefix="/public", tags=["public"])

apply_limiter = SlidingWindowLimiter(max_events=10, window_seconds=3600)

ALLOWED_CV_EXTENSIONS = {".pdf", ".doc", ".docx", ".txt"}
MAX_CV_BYTES = 10 * 1024 * 1024

_email_adapter = TypeAdapter(EmailStr)


def _accepting(job: Job) -> bool:
    return job.status == JobStatus.open and job.filled_seats < job.seats


def _invalid(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=message)


def _clean_profile_url(value: str | None, expected_host: str, label: str) -> str | None:
    value = (value or "").strip()
    if not value:
        return None
    if "://" not in value:
        value = "https://" + value
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in ("http", "https") or not (
        host == expected_host or host.endswith("." + expected_host)
    ):
        raise _invalid(f"Please enter a valid {label} profile URL (on {expected_host}).")
    return value[:500]


def _to_public(job: Job) -> PublicJobRead:
    return PublicJobRead(
        id=job.id,
        title=job.title,
        department=job.department,
        location=job.location,
        description=job.description,
        accepting_applications=_accepting(job),
        collect_github=job.collect_github,
    )


@router.get("/jobs", response_model=list[PublicJobRead])
async def list_open_jobs(db: AsyncSession = Depends(get_db)) -> list[PublicJobRead]:
    """Every job currently open for applications -- this is what the apply
    portal's home page shows, straight from the platform's own job entries."""
    result = await db.execute(
        select(Job).where(Job.status == JobStatus.open).order_by(Job.created_at.desc())
    )
    return [_to_public(job) for job in result.scalars().all() if _accepting(job)]


@router.get("/jobs/{job_id}", response_model=PublicJobRead)
async def get_public_job(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> PublicJobRead:
    job = await db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return _to_public(job)


@router.post(
    "/jobs/{job_id}/apply",
    response_model=ApplicationReceipt,
    status_code=status.HTTP_201_CREATED,
)
async def apply_to_job(
    job_id: uuid.UUID,
    request: Request,
    name: str = Form(..., max_length=150),
    email: str = Form(..., max_length=255),
    phone_number: str = Form(..., max_length=30),
    country: str = Form(..., max_length=100),
    city: str = Form(..., max_length=100),
    linkedin_url: str | None = Form(None),
    github_url: str | None = Form(None),
    experience_years: int = Form(0, ge=0, le=60),
    cover_letter: str | None = Form(None, max_length=5000),
    # Honeypot: real applicants never see or fill this; naive bots do.
    website: str = Form(""),
    cv_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> ApplicationReceipt:
    if website.strip():
        return ApplicationReceipt(message="Application received.")

    apply_limiter.check(request.client.host if request.client else "unknown")

    job = await db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    if not _accepting(job):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This position is no longer accepting applications.",
        )

    name = name.strip()
    phone_number = phone_number.strip()
    country = country.strip()
    city = city.strip()
    if not (name and phone_number and country and city):
        raise _invalid("Name, phone, country and city are required.")

    try:
        clean_email = str(_email_adapter.validate_python(email.strip())).lower()
    except ValidationError:
        raise _invalid("Please enter a valid email address.")

    linkedin = _clean_profile_url(linkedin_url, "linkedin.com", "LinkedIn")
    # The GitHub field only exists on forms for jobs where an admin turned it on.
    github = _clean_profile_url(github_url, "github.com", "GitHub") if job.collect_github else None

    duplicate = await db.execute(
        select(func.count())
        .select_from(Applicant)
        .where(Applicant.job_id == job.id, func.lower(Applicant.email) == clean_email)
    )
    if duplicate.scalar_one() > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An application from this email address already exists for this position.",
        )

    filename = os.path.basename(cv_file.filename or "")
    extension = os.path.splitext(filename)[1].lower()
    if extension not in ALLOWED_CV_EXTENSIONS:
        raise _invalid("Your resume must be a PDF, Word document (.doc/.docx) or .txt file.")
    file_bytes = await cv_file.read(MAX_CV_BYTES + 1)
    if not file_bytes:
        raise _invalid("The uploaded resume file is empty.")
    if len(file_bytes) > MAX_CV_BYTES:
        raise _invalid("Your resume must be 10 MB or smaller.")

    content_type = cv_file.content_type or "application/octet-stream"
    applicant = Applicant(
        job_id=job.id,
        name=name,
        email=clean_email,
        phone_number=phone_number,
        country=country,
        city=city,
        linkedin_url=linkedin,
        github_url=github,
        experience_years=experience_years,
        cover_letter=(cover_letter or "").strip() or None,
        cv_object_key=upload_cv(file_bytes, filename, content_type),
        cv_file_name=filename,
        cv_summary=extract_cv_text(file_bytes, filename, content_type),
    )
    db.add(applicant)
    await db.commit()

    return ApplicationReceipt(message="Application received.")
