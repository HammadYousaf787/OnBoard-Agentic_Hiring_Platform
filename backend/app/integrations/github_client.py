"""
Pulls a public GitHub profile's activity/relevance signals via PyGithub.

No auth is required for public data, but GitHub rate-limits unauthenticated
requests to 60/hour; set GITHUB_TOKEN in .env (a personal access token, no
special scopes needed) to raise that to 5000/hour.
"""

import re
from datetime import datetime, timezone

from github import Github, GithubException

from app.config import get_settings

settings = get_settings()

_USERNAME_RE = re.compile(r"github\.com/([A-Za-z0-9-]+)")


class GithubUnavailableError(Exception):
    pass


def _extract_username(profile_url: str) -> str:
    match = _USERNAME_RE.search(profile_url)
    if not match:
        raise GithubUnavailableError(f"Could not parse a GitHub username from '{profile_url}'.")
    return match.group(1)


def fetch_github_summary(profile_url: str) -> dict:
    """
    Returns a compact, JSON-serializable summary of a GitHub profile:
    identity, repo/language stats, and recent public activity. Intended to
    be embedded directly into the Gemini evaluation prompt.
    """
    username = _extract_username(profile_url)
    client = Github(settings.github_token) if settings.github_token else Github()

    try:
        user = client.get_user(username)

        languages: dict[str, int] = {}
        top_repos: list[dict] = []
        total_stars = 0
        last_pushed: datetime | None = None

        for repo in list(user.get_repos(sort="updated", direction="desc")[:25]):
            if repo.fork:
                continue
            if repo.language:
                languages[repo.language] = languages.get(repo.language, 0) + 1
            total_stars += repo.stargazers_count
            if repo.pushed_at and (last_pushed is None or repo.pushed_at > last_pushed):
                last_pushed = repo.pushed_at
            top_repos.append(
                {
                    "name": repo.name,
                    "description": repo.description,
                    "language": repo.language,
                    "stars": repo.stargazers_count,
                    "forks": repo.forks_count,
                    "updated_at": repo.updated_at.isoformat() if repo.updated_at else None,
                    "url": repo.html_url,
                }
            )

        top_repos.sort(key=lambda r: r["stars"], reverse=True)

        recent_event_types: dict[str, int] = {}
        recent_events_count = 0
        try:
            for event in list(user.get_events()[:30]):
                recent_events_count += 1
                recent_event_types[event.type] = recent_event_types.get(event.type, 0) + 1
        except GithubException:
            recent_events_count = 0

        account_age_days = (
            (datetime.now(timezone.utc) - user.created_at).days if user.created_at else None
        )

        return {
            "profile_url": f"https://github.com/{user.login}",
            "username": user.login,
            "name": user.name,
            "bio": user.bio,
            "public_repos": user.public_repos,
            "followers": user.followers,
            "following": user.following,
            "account_created_at": user.created_at.isoformat() if user.created_at else None,
            "account_age_days": account_age_days,
            "total_stars_across_repos": total_stars,
            "top_languages": sorted(languages.items(), key=lambda kv: kv[1], reverse=True)[:6],
            "top_repos": top_repos[:8],
            "last_pushed_at": last_pushed.isoformat() if last_pushed else None,
            "recent_public_events_count_last_30": recent_events_count,
            "recent_event_type_breakdown": recent_event_types,
        }
    except GithubException as exc:
        message = exc.data.get("message", str(exc)) if isinstance(exc.data, dict) else str(exc)
        raise GithubUnavailableError(f"GitHub API error for '{username}': {message}") from exc
