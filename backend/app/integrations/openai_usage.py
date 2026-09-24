"""
Pulls real account-level usage from OpenAI's Admin API, for the admin AI
usage panel. This is separate from -- and in addition to -- the app's own
`ai_usage_events` log: that table records every call *this app* makes and
works with zero extra setup; this module asks OpenAI directly "how much has
this account actually used", which needs a separate Admin API key.

Requires OPENAI_ADMIN_API_KEY (an org-level Admin key with the
"api.usage.read" scope -- created at platform.openai.com/settings/organization/admin-keys,
NOT the same key as OPENAI_API_KEY, which is what actually makes AI calls).
Without it configured, fetch_account_usage() returns a clearly-marked
"not configured" result instead of raising, since this panel is decorative
and must never break the rest of the admin dashboard.

NOTE: the exact response shape of OpenAI's usage API may have moved since
this was written -- treat parsing failures here as expected until this has
been exercised against a real Admin key, per the "won't be usable right
now" scope of this feature.
"""

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.config import get_settings

USAGE_URL = "https://api.openai.com/v1/organization/usage/completions"


class OpenAiAccountUsage:
    def __init__(
        self,
        configured: bool,
        period_start: datetime | None = None,
        period_end: datetime | None = None,
        total_requests: int | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        error: str | None = None,
    ) -> None:
        self.configured = configured
        self.period_start = period_start
        self.period_end = period_end
        self.total_requests = total_requests
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.error = error


async def fetch_account_usage(days: int = 7) -> OpenAiAccountUsage:
    settings = get_settings()
    if not settings.openai_admin_api_key:
        return OpenAiAccountUsage(configured=False, error="OPENAI_ADMIN_API_KEY is not set.")

    period_end = datetime.now(timezone.utc)
    period_start = period_end - timedelta(days=days)
    headers = {"Authorization": f"Bearer {settings.openai_admin_api_key}"}
    if settings.openai_org_id:
        headers["OpenAI-Organization"] = settings.openai_org_id

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                USAGE_URL,
                headers=headers,
                params={
                    "start_time": int(period_start.timestamp()),
                    "end_time": int(period_end.timestamp()),
                    "bucket_width": "1d",
                    "limit": days,
                },
            )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
    except Exception as exc:  # noqa: BLE001 - this panel must never break the dashboard
        return OpenAiAccountUsage(
            configured=True, error=f"Could not reach the OpenAI usage API: {exc}"
        )

    try:
        total_requests = 0
        input_tokens = 0
        output_tokens = 0
        for bucket in payload.get("data", []):
            for result in bucket.get("results", []):
                total_requests += result.get("num_model_requests", 0) or 0
                input_tokens += result.get("input_tokens", 0) or 0
                output_tokens += result.get("output_tokens", 0) or 0
    except Exception as exc:  # noqa: BLE001 - unexpected response shape
        return OpenAiAccountUsage(
            configured=True, error=f"Unexpected response shape from OpenAI usage API: {exc}"
        )

    return OpenAiAccountUsage(
        configured=True,
        period_start=period_start,
        period_end=period_end,
        total_requests=total_requests,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )
