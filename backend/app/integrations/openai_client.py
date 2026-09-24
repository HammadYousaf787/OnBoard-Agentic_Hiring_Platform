"""
Sends a candidate's CV/cover letter plus their (optional) GitHub and
LinkedIn summaries to OpenAI, and asks for a structured, explained
evaluation: a 1-5 score *and* a written reason for that score, in five
categories (communication, JD overlap, GitHub, LinkedIn, overall).

Replaces the earlier Gemini-based client (app/integrations/gemini_client.py,
removed) -- every AI review / interview-question / live-assist caller now
goes through generate_json() here instead. Requires OPENAI_API_KEY; until
that's set, every call raises AiProviderError (same role GeminiError played).
"""

import asyncio
import json
from typing import Any

from openai import APIStatusError, AsyncOpenAI, BadRequestError, RateLimitError

from app.config import get_settings
from app.models.applicant import Applicant
from app.models.job import Job

settings = get_settings()


class AiProviderError(Exception):
    """Raised for any failure talking to the configured AI provider (OpenAI)."""


# purpose (as logged in ai_usage_events.purpose) -> which model runs it.
_MODEL_SETTING = {
    "applicant_ai_review": "openai_model_scoring",
    "interview_questions": "openai_model_interview_prep",
    "interview_live_assist": "openai_model_live_assist",
    "hr_assistant": "openai_model_assistant",
    "assistant_transcribe": "openai_model_transcribe",
    "interview_transcribe": "openai_model_interview_transcribe",
    "interview_qa_analysis": "openai_model_qa_analysis",
}


def model_for(purpose: str) -> str:
    """The model configured for a task; every call site (and its usage log
    row) goes through this so the log always shows the model actually used."""
    return getattr(settings, _MODEL_SETTING[purpose])


# Some models (e.g. gpt-5-nano, gpt-5.5) reject the `temperature` parameter
# with a 400. Learned at runtime the first time it happens, so switching
# models in .env never needs a code change.
NO_TEMPERATURE: set[str] = set()


def is_temperature_rejection(exc: Exception) -> bool:
    return isinstance(exc, BadRequestError) and "temperature" in str(exc).lower()


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
        "additionalProperties": False,
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
    "additionalProperties": False,
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
    prompt: str, schema: dict, purpose: str, temperature: float = 0.2
) -> tuple[dict[str, Any], dict[str, Any]]:
    """One OpenAI chat-completion call with a forced JSON schema response,
    retrying transient errors. Returns (parsed_json, usage). Raises
    AiProviderError."""
    if not settings.openai_api_key:
        raise AiProviderError("OPENAI_API_KEY is not configured.")

    client = AsyncOpenAI(api_key=settings.openai_api_key, organization=settings.openai_org_id)

    model = model_for(purpose)
    last_error: Exception | None = None
    response = None
    for attempt in range(4):
        try:
            sampling = {} if model in NO_TEMPERATURE else {"temperature": temperature}
            response = await client.chat.completions.create(
                model=model,
                **sampling,
                messages=[
                    {
                        "role": "system",
                        "content": "You produce only JSON that matches the caller-provided schema. "
                        "No prose, no markdown fences, no commentary outside the JSON object.",
                    },
                    {"role": "user", "content": f"{prompt}\n\nJSON schema to match exactly:\n{json.dumps(schema)}"},
                ],
                response_format={"type": "json_object"},
            )
            break
        except BadRequestError as exc:
            last_error = exc
            if is_temperature_rejection(exc) and model not in NO_TEMPERATURE:
                NO_TEMPERATURE.add(model)
                continue  # retry immediately without temperature
            break
        except RateLimitError as exc:
            last_error = exc
            if attempt < 3:
                await asyncio.sleep(3 * (attempt + 1))
        except APIStatusError as exc:
            last_error = exc
            if exc.status_code >= 500 and attempt < 3:
                await asyncio.sleep(3 * (attempt + 1))
            else:
                break
        except Exception as exc:  # noqa: BLE001 - surface any SDK/network failure uniformly
            last_error = exc
            break
    if response is None:
        raise AiProviderError(str(last_error)) from last_error

    text = response.choices[0].message.content if response.choices else None
    if not text:
        raise AiProviderError("OpenAI returned an empty response.")

    try:
        result = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AiProviderError(f"OpenAI returned non-JSON output: {text!r}") from exc

    usage = response.usage
    usage_dict = {
        "prompt_tokens": getattr(usage, "prompt_tokens", None) if usage else None,
        "completion_tokens": getattr(usage, "completion_tokens", None) if usage else None,
        "total_tokens": getattr(usage, "total_tokens", None) if usage else None,
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

    return await generate_json(prompt, RESPONSE_SCHEMA, "applicant_ai_review", 0.2)


async def transcribe_audio(
    audio: bytes,
    filename: str,
    content_type: str | None,
    purpose: str = "assistant_transcribe",
    prompt: str | None = None,
) -> tuple[str, dict[str, Any]]:
    """Speech-to-text for the assistant's mic button. Returns (text, usage);
    usage keys mirror generate_json's (token counts, any may be None).
    Raises AiProviderError."""
    if not settings.openai_api_key:
        raise AiProviderError("OPENAI_API_KEY is not configured.")

    client = AsyncOpenAI(api_key=settings.openai_api_key, organization=settings.openai_org_id)
    try:
        response = await client.audio.transcriptions.create(
            model=model_for(purpose),
            file=(filename, audio, content_type or "application/octet-stream"),
            **({"prompt": prompt} if prompt else {}),
        )
    except Exception as exc:  # noqa: BLE001 - surface any SDK/network failure uniformly
        raise AiProviderError(str(exc)) from exc

    usage = getattr(response, "usage", None)
    usage_dict = {
        "prompt_tokens": getattr(usage, "input_tokens", None),
        "completion_tokens": getattr(usage, "output_tokens", None),
        "total_tokens": getattr(usage, "total_tokens", None),
    }
    return (response.text or "").strip(), usage_dict
