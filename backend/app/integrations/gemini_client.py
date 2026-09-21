"""
Sends a candidate's CV/cover letter plus their (optional) GitHub and
LinkedIn summaries to Gemini, and asks for a structured, explained
evaluation: a 1-5 score *and* a written reason for that score, in five
categories (communication, JD overlap, GitHub, LinkedIn, overall).
"""

import asyncio
import json
import re
from typing import Any

from google import genai
from google.genai import types

from app.config import get_settings
from app.models.applicant import Applicant
from app.models.job import Job

settings = get_settings()


class GeminiError(Exception):
    pass


def _category_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "score": {
                "type": "number",
                "minimum": 1,
                "maximum": 5,
                "description": "Rating from 1 to 5, in increments of 0.5.",
            },
            "reasoning": {
                "type": "string",
                "description": "2-4 sentences explaining exactly why this score was given, "
                "citing specific evidence from the material provided.",
            },
        },
        "required": ["score", "reasoning"],
    }


RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "communication": _category_schema(),
        "jd_overlap": _category_schema(),
        "github": _category_schema(),
        "linkedin": _category_schema(),
        "overall": _category_schema(),
    },
    "required": ["communication", "jd_overlap", "github", "linkedin", "overall"],
}


def _build_prompt(
    job: Job,
    applicant: Applicant,
    github_summary: dict | None,
    github_error: str | None,
    linkedin_summary: dict | None,
    linkedin_error: str | None,
) -> str:
    github_section = (
        json.dumps(github_summary, indent=2, default=str)
        if github_summary
        else f"Not available ({github_error or 'no GitHub profile on file'})."
    )
    linkedin_section = (
        json.dumps(linkedin_summary, indent=2, default=str)
        if linkedin_summary
        else f"Not available ({linkedin_error or 'no LinkedIn profile on file'})."
    )

    return f"""You are an experienced technical recruiter evaluating a job applicant.
Score the candidate from 1 to 5 (0.5 increments allowed) in each category
below, and give a concrete, specific 2-4 sentence reason for every score,
citing the actual evidence given. Be honest and critical -- do not default
to high scores, and do not invent evidence that isn't provided.

## Job
Title: {job.title}
Department: {job.department}
Description:
{job.description}

## Candidate
Name: {applicant.name}
Years of experience (self-reported): {applicant.experience_years}
CV summary: {applicant.cv_summary or "not provided"}
Cover letter: {applicant.cover_letter or "not provided"}

## GitHub profile summary
{github_section}

## LinkedIn profile summary
{linkedin_section}

## Categories
1. communication: clarity, professionalism, and specificity of the CV
   summary and cover letter.
2. jd_overlap: how well the candidate's stated skills/experience overlap
   this specific job description's requirements.
3. github: technical activity and relevance of their GitHub profile to
   this role -- recency of activity, relevant languages/projects, depth
   over vanity metrics (stars/followers alone are weak signals). If
   GitHub data is unavailable, give a score of 1 and say clearly in the
   reasoning that this reflects missing data, not a negative judgment of
   the candidate.
4. linkedin: professional activity and relevance signals from their
   LinkedIn profile -- role/experience alignment, evidence of ongoing
   professional engagement. If LinkedIn data is unavailable, give a score
   of 1 and say clearly in the reasoning that this reflects missing data,
   not a negative judgment of the candidate.
5. overall: your holistic assessment, weighing the above by how much
   actual evidence was available for each.

Respond with ONLY JSON matching the required schema -- no prose outside it.
"""


async def generate_json(
    prompt: str, schema: dict, temperature: float = 0.2
) -> tuple[dict[str, Any], dict[str, Any]]:
    """One Gemini call with a forced JSON response schema, retrying transient
    errors. Returns (parsed_json, usage). Raises GeminiError."""
    if not settings.gemini_api_key:
        raise GeminiError("GEMINI_API_KEY is not configured.")

    client = genai.Client(api_key=settings.gemini_api_key)

    last_error: Exception | None = None
    response = None
    for attempt in range(4):
        try:
            response = await client.aio.models.generate_content(
                model=settings.gemini_model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=schema,
                    temperature=temperature,
                ),
            )
            break
        except Exception as exc:  # noqa: BLE001 - surface any SDK/API failure uniformly
            last_error = exc
            if "PerDay" in str(exc):
                raise GeminiError(
                    f"Daily Gemini quota for model '{settings.gemini_model}' is used up "
                    "(free tier). Wait for the reset, switch GEMINI_MODEL, or enable billing."
                ) from exc
            if attempt < 3:
                # 429s from the free tier say how long to wait ("retry in 8.1s").
                hinted = re.search(r"retry in ([\d.]+)s", str(exc))
                delay = min(float(hinted.group(1)) + 1, 30) if hinted else 3 * (attempt + 1)
                await asyncio.sleep(delay)
    if response is None:
        raise GeminiError(str(last_error)) from last_error

    if not response.text:
        raise GeminiError("Gemini returned an empty response.")

    try:
        result = json.loads(response.text)
    except json.JSONDecodeError as exc:
        raise GeminiError(f"Gemini returned non-JSON output: {response.text!r}") from exc

    usage = response.usage_metadata
    usage_dict = {
        "prompt_tokens": getattr(usage, "prompt_token_count", None) if usage else None,
        "completion_tokens": getattr(usage, "candidates_token_count", None) if usage else None,
        "total_tokens": getattr(usage, "total_token_count", None) if usage else None,
    }
    return result, usage_dict


async def evaluate_applicant(
    job: Job,
    applicant: Applicant,
    github_summary: dict | None,
    github_error: str | None,
    linkedin_summary: dict | None,
    linkedin_error: str | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Returns (result, usage). `result` has one entry per category:
    {"score": float, "reasoning": str}. `usage` has prompt/completion/total
    token counts (any of which may be None depending on the API response)."""
    prompt = _build_prompt(
        job, applicant, github_summary, github_error, linkedin_summary, linkedin_error
    )

    return await generate_json(prompt, RESPONSE_SCHEMA, 0.2)
