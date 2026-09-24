import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.applicant_context import gather_online_profiles
from app.database import get_db
from app.deps import require_admin, require_any_role
from app.integrations.openai_client import AiProviderError, evaluate_applicant, model_for
from app.integrations.openai_usage import fetch_account_usage
from app.models.ai_usage import AiUsageEvent
from app.models.applicant import Applicant
from app.models.enums import Role
from app.models.job import Job
from app.models.user import User
from app.schemas.ai_review import AiUsageEventRead, AiUsageSummary, OpenAiAccountUsageRead
from app.schemas.applicant import ApplicantRead

router = APIRouter(tags=["ai-review"])


async def _get_applicant_or_404(db: AsyncSession, applicant_id: uuid.UUID) -> Applicant:
    applicant = await db.get(Applicant, applicant_id)
    if applicant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Applicant not found.")
    return applicant


@router.post("/applicants/{applicant_id}/ai-review", response_model=ApplicantRead)
async def run_ai_job_review(
    applicant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> Applicant:
    """
    Runs the real AI Job Review for one applicant: GitHub activity
    (PyGithub) and LinkedIn (Bright Data) where available, plus their
    CV/cover letter and the job description, sent to OpenAI for a scored
    and explained evaluation. Admins or the job's assigned HR may run it.
    The result is a recommendation only -- it never moves the applicant.
    """
    applicant = await _get_applicant_or_404(db, applicant_id)
    job = await db.get(Job, applicant.job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    if current_user.role == Role.hr and job.assigned_hr_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This job is not assigned to you."
        )

    github_summary, github_error, linkedin_summary, linkedin_error = await gather_online_profiles(
        applicant
    )

    settings = get_settings()

    try:
        result, usage = await evaluate_applicant(
            job, applicant, github_summary, github_error, linkedin_summary, linkedin_error
        )
    except AiProviderError as exc:
        db.add(
            AiUsageEvent(
                provider="openai",
                model_name=model_for("applicant_ai_review"),
                purpose="applicant_ai_review",
                applicant_id=applicant.id,
                triggered_by_id=current_user.id,
                success=False,
                error_message=str(exc),
            )
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"AI evaluation failed: {exc}"
        )

    generated_at = datetime.now(timezone.utc)

    applicant.communication_score = result["communication"]["score"]
    applicant.jd_overlap_score = result["jd_overlap"]["score"]
    applicant.github_score = result["github"]["score"]
    applicant.linkedin_score = result["linkedin"]["score"]
    applicant.overall_score = result["overall"]["score"]
    applicant.ranked_at = generated_at
    applicant.ai_review_details = {
        **result,
        "github_available": github_summary is not None,
        "linkedin_available": linkedin_summary is not None,
        "github_error": github_error,
        "linkedin_error": linkedin_error,
        "github_snapshot": github_summary,
        "linkedin_snapshot": linkedin_summary,
        "model": model_for("applicant_ai_review"),
        "generated_at": generated_at.isoformat(),
    }
    db.add(applicant)

    db.add(
        AiUsageEvent(
            provider="openai",
            model_name=model_for("applicant_ai_review"),
            purpose="applicant_ai_review",
            applicant_id=applicant.id,
            triggered_by_id=current_user.id,
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
            total_tokens=usage.get("total_tokens"),
            success=True,
        )
    )

    await db.commit()
    await db.refresh(applicant)
    return applicant


@router.get("/ai-usage/summary", response_model=AiUsageSummary)
async def get_ai_usage_summary(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> AiUsageSummary:
    totals = (
        await db.execute(
            select(
                func.count(AiUsageEvent.id),
                func.count(AiUsageEvent.id).filter(AiUsageEvent.success.is_(True)),
                func.count(AiUsageEvent.id).filter(AiUsageEvent.success.is_(False)),
                func.coalesce(func.sum(AiUsageEvent.total_tokens), 0),
                func.coalesce(func.sum(AiUsageEvent.prompt_tokens), 0),
                func.coalesce(func.sum(AiUsageEvent.completion_tokens), 0),
            )
        )
    ).one()
    total_calls, successful_calls, failed_calls, total_tokens, prompt_tokens, completion_tokens = (
        totals
    )

    provider_rows = (
        await db.execute(
            select(AiUsageEvent.provider, func.count(AiUsageEvent.id)).group_by(
                AiUsageEvent.provider
            )
        )
    ).all()
    by_provider = {provider: count for provider, count in provider_rows}

    recent_result = await db.execute(
        select(AiUsageEvent).order_by(AiUsageEvent.created_at.desc()).limit(20)
    )
    recent_events = [AiUsageEventRead.model_validate(e) for e in recent_result.scalars().all()]

    account_usage = await fetch_account_usage()

    return AiUsageSummary(
        total_calls=total_calls,
        successful_calls=successful_calls,
        failed_calls=failed_calls,
        total_tokens=total_tokens,
        total_prompt_tokens=prompt_tokens,
        total_completion_tokens=completion_tokens,
        by_provider=by_provider,
        recent_events=recent_events,
        openai_account=OpenAiAccountUsageRead(
            configured=account_usage.configured,
            period_start=account_usage.period_start,
            period_end=account_usage.period_end,
            total_requests=account_usage.total_requests,
            input_tokens=account_usage.input_tokens,
            output_tokens=account_usage.output_tokens,
            error=account_usage.error,
        ),
    )
