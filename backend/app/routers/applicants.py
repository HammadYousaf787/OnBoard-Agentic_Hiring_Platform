import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cv_extract import extract_cv_text
from app.core.storage import copy_cv_to_bank, delete_cv, delete_prefix, get_cv_download_url, upload_cv
from app.database import get_db
from app.deps import require_any_role, require_hr
from app.models.applicant import Applicant
from app.models.appointment import Appointment
from app.models.cv_bank_entry import CvBankEntry
from app.models.enums import ApplicantStage, JobStatus, Role
from app.models.job import Job
from app.models.user import User
from app.schemas.applicant import (
    ApplicantOrderInput,
    HrAssessmentInput,
    ApplicantRead,
    BulkApplicantAction,
    ApplicantUpdate,
    RejectApplicantInput,
    RescheduleInput,
    ScheduleInterviewInput,
)
from app.schemas.appointment import AppointmentRead, NotifyToggleRead

router = APIRouter(tags=["applicants"])


async def _get_job_or_404(db: AsyncSession, job_id: uuid.UUID) -> Job:
    job = await db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return job


async def _get_applicant_or_404(db: AsyncSession, applicant_id: uuid.UUID) -> Applicant:
    applicant = await db.get(Applicant, applicant_id)
    if applicant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Applicant not found.")
    return applicant


def _ensure_job_access(job: Job, user: User) -> None:
    if user.role == Role.hr and job.assigned_hr_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This job is not assigned to you."
        )


async def _ensure_applicant_access(db: AsyncSession, applicant: Applicant, user: User) -> Job:
    job = await _get_job_or_404(db, applicant.job_id)
    _ensure_job_access(job, user)
    return job


SLOT_MINUTES = 60


async def validate_interview_slot(
    db: AsyncSession,
    scheduled_at: datetime,
    hr_id: uuid.UUID,
    applicant_id: uuid.UUID,
    exclude_id: uuid.UUID | None = None,
) -> None:
    """Rejects times in the past and slots that overlap another unfinished
    interview of the same HR or the same candidate (interviews occupy a
    60-minute slot)."""
    when = scheduled_at if scheduled_at.tzinfo else scheduled_at.replace(tzinfo=timezone.utc)
    if when <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="That time is in the past. Pick a date and time in the future.",
        )

    window = timedelta(minutes=SLOT_MINUTES)
    query = select(Appointment).where(
        Appointment.room_status != "ended",
        Appointment.scheduled_at > when - window,
        Appointment.scheduled_at < when + window,
        (Appointment.hr_id == hr_id) | (Appointment.applicant_id == applicant_id),
    )
    if exclude_id is not None:
        query = query.where(Appointment.id != exclude_id)
    conflict = (await db.execute(query.limit(1))).scalar_one_or_none()
    if conflict is None:
        return

    other = await db.get(Applicant, conflict.applicant_id)
    name = other.name if other else "another candidate"
    if conflict.applicant_id == applicant_id:
        detail = (
            f"{name} already has an interview that overlaps this time. "
            f"Interviews take a {SLOT_MINUTES}-minute slot - choose a different time."
        )
    else:
        detail = (
            f"This overlaps your interview with {name}. "
            f"Interviews take a {SLOT_MINUTES}-minute slot - choose a different time."
        )
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def _cv_bank_entry(applicant: Applicant, job: Job, user: User, note: str | None) -> CvBankEntry:
    return CvBankEntry(
        applicant_id=applicant.id,
        name=applicant.name,
        email=applicant.email,
        phone_number=applicant.phone_number,
        country=applicant.country,
        city=applicant.city,
        cv_object_key=copy_cv_to_bank(applicant.cv_object_key) if applicant.cv_object_key else None,
        cv_file_name=applicant.cv_file_name,
        cv_summary=applicant.cv_summary,
        experience_years=applicant.experience_years,
        linkedin_url=applicant.linkedin_url,
        github_url=applicant.github_url,
        source_job_id=job.id,
        source_job_title=job.title,
        rejected_by_id=user.id,
        rejected_by_name=user.full_name,
        note=note,
    )


@router.get("/jobs/{job_id}/applicants", response_model=list[ApplicantRead])
async def list_applicants(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> list[Applicant]:
    job = await _get_job_or_404(db, job_id)
    _ensure_job_access(job, current_user)

    result = await db.execute(
        select(Applicant).where(Applicant.job_id == job_id).order_by(Applicant.applied_date)
    )
    return list(result.scalars().all())


@router.post(
    "/jobs/{job_id}/applicants", response_model=ApplicantRead, status_code=status.HTTP_201_CREATED
)
async def create_applicant(
    job_id: uuid.UUID,
    name: str = Form(...),
    email: str = Form(...),
    phone_number: str = Form(...),
    country: str | None = Form(None),
    city: str | None = Form(None),
    linkedin_url: str | None = Form(None),
    github_url: str | None = Form(None),
    experience_years: int = Form(0),
    cover_letter: str | None = Form(None),
    cv_file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> Applicant:
    job = await _get_job_or_404(db, job_id)
    _ensure_job_access(job, current_user)

    applicant = Applicant(
        job_id=job.id,
        name=name,
        email=email,
        phone_number=phone_number,
        country=country,
        city=city,
        linkedin_url=linkedin_url or None,
        github_url=github_url or None,
        experience_years=experience_years,
        cover_letter=cover_letter,
    )

    if cv_file is not None and cv_file.filename:
        file_bytes = await cv_file.read()
        applicant.cv_object_key = upload_cv(file_bytes, cv_file.filename, cv_file.content_type or "")
        applicant.cv_file_name = cv_file.filename
        applicant.cv_summary = extract_cv_text(
            file_bytes, cv_file.filename, cv_file.content_type or ""
        )

    db.add(applicant)
    await db.commit()
    await db.refresh(applicant)
    return applicant


@router.get("/applicants/{applicant_id}", response_model=ApplicantRead)
async def get_applicant(
    applicant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> Applicant:
    applicant = await _get_applicant_or_404(db, applicant_id)
    await _ensure_applicant_access(db, applicant, current_user)
    return applicant


@router.patch("/applicants/{applicant_id}", response_model=ApplicantRead)
async def update_applicant(
    applicant_id: uuid.UUID,
    payload: ApplicantUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> Applicant:
    applicant = await _get_applicant_or_404(db, applicant_id)
    await _ensure_applicant_access(db, applicant, current_user)

    for field, value in payload.model_dump().items():
        setattr(applicant, field, value)

    db.add(applicant)
    await db.commit()
    await db.refresh(applicant)
    return applicant


@router.delete("/applicants/{applicant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_applicant(
    applicant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> None:
    applicant = await _get_applicant_or_404(db, applicant_id)
    await _ensure_applicant_access(db, applicant, current_user)

    appointment_ids = (
        await db.execute(select(Appointment.id).where(Appointment.applicant_id == applicant.id))
    ).scalars().all()

    if applicant.cv_object_key:
        delete_cv(applicant.cv_object_key)

    await db.delete(applicant)
    await db.commit()
    for appointment_id in appointment_ids:
        delete_prefix(f"interviews/{appointment_id}/")


@router.get("/applicants/{applicant_id}/cv-url")
async def get_applicant_cv_url(
    applicant_id: uuid.UUID,
    inline: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> dict[str, str | None]:
    applicant = await _get_applicant_or_404(db, applicant_id)
    await _ensure_applicant_access(db, applicant, current_user)

    if not applicant.cv_object_key:
        return {"url": None}
    return {"url": get_cv_download_url(applicant.cv_object_key, applicant.cv_file_name, inline)}


@router.post("/applicants/{applicant_id}/pass-to-interview", response_model=ApplicantRead)
async def pass_to_interview(
    applicant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> Applicant:
    """Moves an applicant to Interview Pending (stage assessment_passed),
    with or without a coding assessment first."""
    applicant = await _get_applicant_or_404(db, applicant_id)
    await _ensure_applicant_access(db, applicant, current_user)

    if applicant.stage not in (ApplicantStage.applied, ApplicantStage.coding_assessment):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot pass to interview from stage '{applicant.stage.value}'.",
        )

    applicant.stage = ApplicantStage.assessment_passed
    db.add(applicant)
    await db.commit()
    await db.refresh(applicant)
    return applicant


@router.patch("/applicants/{applicant_id}/hr-assessment", response_model=ApplicantRead)
async def save_hr_assessment(
    applicant_id: uuid.UUID,
    payload: HrAssessmentInput,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> Applicant:
    """HR's own star rating + notes on a candidate. Only the fields present in
    the request are changed."""
    applicant = await _get_applicant_or_404(db, applicant_id)
    await _ensure_applicant_access(db, applicant, current_user)

    changes = payload.model_dump(exclude_unset=True)
    if "hr_score" in changes:
        score = changes["hr_score"]
        if score is not None and (score * 2) % 1 != 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="HR score must be in steps of 0.5.",
            )
        applicant.hr_score = score
    if "hr_notes" in changes:
        applicant.hr_notes = (changes["hr_notes"] or "").strip() or None

    await db.commit()
    await db.refresh(applicant)
    return applicant


@router.post("/applicants/{applicant_id}/forward-coding-assessment", response_model=ApplicantRead)
async def forward_coding_assessment(
    applicant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> Applicant:
    """Technical jobs only: sends the applicant to the coding assessment."""
    applicant = await _get_applicant_or_404(db, applicant_id)
    job = await _ensure_applicant_access(db, applicant, current_user)

    if not job.collect_github:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Coding assessments only apply to technical roles.",
        )
    if applicant.stage != ApplicantStage.applied:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot forward a coding assessment from stage '{applicant.stage.value}'.",
        )

    applicant.stage = ApplicantStage.coding_assessment
    db.add(applicant)
    await db.commit()
    await db.refresh(applicant)
    return applicant


@router.post("/applicants/{applicant_id}/schedule-interview", response_model=AppointmentRead)
async def schedule_interview(
    applicant_id: uuid.UUID,
    payload: ScheduleInterviewInput,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> Appointment:
    applicant = await _get_applicant_or_404(db, applicant_id)
    job = await _ensure_applicant_access(db, applicant, current_user)

    if applicant.stage not in (ApplicantStage.assessment_passed, ApplicantStage.interview_scheduled):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot schedule an interview from stage '{applicant.stage.value}'.",
        )

    await validate_interview_slot(db, payload.scheduled_at, current_user.id, applicant.id)

    appointment = Appointment(
        applicant_id=applicant.id,
        job_id=job.id,
        hr_id=current_user.id,
        scheduled_at=payload.scheduled_at,
        notify_day_before=payload.notify_day_before,
    )
    applicant.stage = ApplicantStage.interview_scheduled

    db.add_all([appointment, applicant])
    await db.commit()
    await db.refresh(appointment)
    return appointment


@router.post("/applicants/{applicant_id}/accept", response_model=ApplicantRead)
async def accept_applicant(
    applicant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> Applicant:
    applicant = await _get_applicant_or_404(db, applicant_id)
    job = await _ensure_applicant_access(db, applicant, current_user)

    if applicant.stage != ApplicantStage.interview_scheduled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot accept a candidate from stage '{applicant.stage.value}'.",
        )

    applicant.stage = ApplicantStage.accepted
    job.filled_seats += 1
    if job.filled_seats >= job.seats:
        job.status = JobStatus.closed

    db.add_all([applicant, job])
    await db.commit()
    await db.refresh(applicant)
    return applicant


@router.post("/applicants/{applicant_id}/reject", response_model=ApplicantRead)
async def reject_applicant(
    applicant_id: uuid.UUID,
    payload: RejectApplicantInput,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> Applicant:
    applicant = await _get_applicant_or_404(db, applicant_id)
    job = await _ensure_applicant_access(db, applicant, current_user)

    if applicant.stage in (ApplicantStage.accepted, ApplicantStage.rejected):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot reject a candidate from stage '{applicant.stage.value}'.",
        )

    applicant.stage = ApplicantStage.rejected
    applicant.rejection_note = payload.note

    should_save = payload.save_to_cv_bank or current_user.auto_save_cv_bank_on_reject
    applicant.saved_to_cv_bank = should_save

    db.add(applicant)

    if should_save:
        db.add(_cv_bank_entry(applicant, job, current_user, payload.note))

    await db.commit()
    await db.refresh(applicant)
    return applicant


@router.post("/applicants/{applicant_id}/save-to-cv-bank", response_model=ApplicantRead)
async def save_to_cv_bank(
    applicant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> Applicant:
    """Manually save an already-rejected applicant to the CV bank (e.g. if
    they weren't saved at rejection time)."""
    applicant = await _get_applicant_or_404(db, applicant_id)
    job = await _ensure_applicant_access(db, applicant, current_user)

    if applicant.stage != ApplicantStage.rejected:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only rejected applicants can be saved to the CV bank.",
        )
    if applicant.saved_to_cv_bank:
        return applicant

    applicant.saved_to_cv_bank = True
    db.add(applicant)
    db.add(_cv_bank_entry(applicant, job, current_user, applicant.rejection_note))
    await db.commit()
    await db.refresh(applicant)
    return applicant


@router.put("/jobs/{job_id}/applicants/order", response_model=list[ApplicantRead])
async def set_applicant_order(
    job_id: uuid.UUID,
    payload: ApplicantOrderInput,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> list[Applicant]:
    """HR's manual ranking. `applicant_ids` is the full desired order, top
    first; each gets manual_rank = its index. This overrides the AI order."""
    job = await _get_job_or_404(db, job_id)
    _ensure_job_access(job, current_user)

    result = await db.execute(select(Applicant).where(Applicant.job_id == job_id))
    by_id = {a.id: a for a in result.scalars().all()}
    if len(set(payload.applicant_ids)) != len(payload.applicant_ids) or any(
        i not in by_id for i in payload.applicant_ids
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order must list distinct applicants of this job.",
        )

    for index, applicant_id in enumerate(payload.applicant_ids):
        by_id[applicant_id].manual_rank = index
    await db.commit()
    ordered = [by_id[i] for i in payload.applicant_ids]
    for applicant in ordered:
        await db.refresh(applicant)
    return ordered


@router.post("/jobs/{job_id}/applicants/bulk-action", response_model=list[ApplicantRead])
async def bulk_applicant_action(
    job_id: uuid.UUID,
    payload: BulkApplicantAction,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> list[Applicant]:
    """Moves selected applicants to Interview Pending (stage
    assessment_passed), the coding assessment (technical jobs only) or
    Rejected. Applicants must be in 'applied' (or, for pass_to_interview and
    reject, 'coding_assessment'); others are skipped."""
    job = await _get_job_or_404(db, job_id)
    _ensure_job_access(job, current_user)
    if payload.action == "coding_assessment" and not job.collect_github:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Coding assessments only apply to technical roles.",
        )
    movable = {ApplicantStage.applied}
    if payload.action != "coding_assessment":
        movable.add(ApplicantStage.coding_assessment)

    result = await db.execute(
        select(Applicant).where(
            Applicant.job_id == job_id, Applicant.id.in_(payload.applicant_ids)
        )
    )
    applicants = [a for a in result.scalars().all() if a.stage in movable]
    if not applicants:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="None of the selected applicants can be moved.",
        )

    for applicant in applicants:
        if payload.action == "pass_to_interview":
            applicant.stage = ApplicantStage.assessment_passed
        elif payload.action == "coding_assessment":
            applicant.stage = ApplicantStage.coding_assessment
        else:
            applicant.stage = ApplicantStage.rejected
            applicant.rejection_note = payload.note
            should_save = current_user.auto_save_cv_bank_on_reject
            applicant.saved_to_cv_bank = should_save
            if should_save:
                db.add(_cv_bank_entry(applicant, job, current_user, payload.note))

    await db.commit()
    for applicant in applicants:
        await db.refresh(applicant)
    return applicants


@router.get("/appointments", response_model=list[AppointmentRead])
async def list_appointments(
    hr_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> list[Appointment]:
    query = select(Appointment).order_by(Appointment.scheduled_at)
    if current_user.role == Role.hr:
        query = query.where(Appointment.hr_id == current_user.id)
    elif hr_id is not None:
        query = query.where(Appointment.hr_id == hr_id)
    result = await db.execute(query)
    return list(result.scalars().all())


async def _get_appointment_or_404(db: AsyncSession, appointment_id: uuid.UUID) -> Appointment:
    appointment = await db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found.")
    return appointment


def _ensure_appointment_access(appointment: Appointment, user: User) -> None:
    if user.role == Role.hr and appointment.hr_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This appointment does not belong to you."
        )


@router.patch("/appointments/{appointment_id}/reschedule", response_model=AppointmentRead)
async def reschedule_appointment(
    appointment_id: uuid.UUID,
    payload: RescheduleInput,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> Appointment:
    appointment = await _get_appointment_or_404(db, appointment_id)
    _ensure_appointment_access(appointment, current_user)
    if appointment.room_status == "ended":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This interview has already taken place. Schedule another interview instead.",
        )
    await validate_interview_slot(
        db, payload.scheduled_at, appointment.hr_id, appointment.applicant_id, exclude_id=appointment.id
    )

    appointment.scheduled_at = payload.scheduled_at
    db.add(appointment)
    await db.commit()
    await db.refresh(appointment)
    return appointment


@router.patch("/appointments/{appointment_id}/toggle-notify", response_model=AppointmentRead)
async def toggle_notify(
    appointment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> Appointment:
    appointment = await _get_appointment_or_404(db, appointment_id)
    _ensure_appointment_access(appointment, current_user)

    appointment.notify_day_before = not appointment.notify_day_before
    db.add(appointment)
    await db.commit()
    await db.refresh(appointment)
    return appointment
