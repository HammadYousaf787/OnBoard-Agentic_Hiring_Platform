from starlette.concurrency import run_in_threadpool

from app.integrations.github_client import GithubUnavailableError, fetch_github_summary
from app.integrations.linkedin_client import LinkedInUnavailableError, fetch_linkedin_summary
from app.models.applicant import Applicant


async def gather_online_profiles(
    applicant: Applicant,
) -> tuple[dict | None, str | None, dict | None, str | None]:
    """Fetches the applicant's public GitHub / LinkedIn data. Returns
    (github_summary, github_error, linkedin_summary, linkedin_error); exactly
    one of each pair is set."""
    github_summary: dict | None = None
    github_error: str | None = None
    if applicant.github_url:
        try:
            github_summary = await run_in_threadpool(fetch_github_summary, applicant.github_url)
        except GithubUnavailableError as exc:
            github_error = str(exc)
    else:
        github_error = "No GitHub URL on file for this applicant."

    linkedin_summary: dict | None = None
    linkedin_error: str | None = None
    if applicant.linkedin_url:
        try:
            linkedin_summary = await run_in_threadpool(fetch_linkedin_summary, applicant.linkedin_url)
        except LinkedInUnavailableError as exc:
            linkedin_error = str(exc)
    else:
        linkedin_error = "No LinkedIn URL on file for this applicant."

    return github_summary, github_error, linkedin_summary, linkedin_error
