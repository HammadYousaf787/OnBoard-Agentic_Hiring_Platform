"""
Pulls a LinkedIn profile via Bright Data's structured LinkedIn dataset
(brightdata-sdk's LinkedInScraper), used to gauge activity/relevance since
LinkedIn itself blocks ordinary scraping.

Requires BRIGHTDATA_API_TOKEN in .env. Bright Data's LinkedIn profile
collector is a paid, metered dataset -- each call here costs money and
takes up to a few minutes (it triggers a collection job and polls for the
result), so this is only invoked when an admin/HR explicitly runs an AI
review for a specific applicant, never in bulk.
"""

from brightdata import SyncBrightDataClient
from brightdata.exceptions import BrightDataError

from app.config import get_settings

settings = get_settings()


class LinkedInUnavailableError(Exception):
    pass


def fetch_linkedin_summary(profile_url: str, timeout: int = 180) -> dict:
    """
    Returns the raw structured profile record from Bright Data's LinkedIn
    People Profile dataset (fields vary slightly by profile, but generally
    include headline, about, experience, education, skills, location).
    """
    if not settings.brightdata_api_token:
        raise LinkedInUnavailableError(
            "LinkedIn scraping is not configured: BRIGHTDATA_API_TOKEN is not set."
        )

    try:
        with SyncBrightDataClient(token=settings.brightdata_api_token) as client:
            result = client.scrape.linkedin.profiles(profile_url, timeout=timeout)
    except BrightDataError as exc:
        raise LinkedInUnavailableError(f"Bright Data error: {exc}") from exc

    if isinstance(result, list):
        result = result[0] if result else None

    if result is None or not result.success or not result.data:
        error = getattr(result, "error", None) if result else "no result returned"
        raise LinkedInUnavailableError(f"LinkedIn scrape failed: {error}")

    data = result.data
    return data[0] if isinstance(data, list) and data else data
