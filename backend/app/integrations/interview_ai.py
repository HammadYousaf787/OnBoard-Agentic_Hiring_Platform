"""
Gemini prompts for the video-interview feature: (1) a set of natural,
personalised interview questions prepared before the call, and (2) live
suggestions based on the running transcript.
"""

import json

from app.integrations.gemini_client import generate_json
from app.models.applicant import Applicant
from app.models.job import Job

QUESTIONS_SCHEMA = {
    "type": "object",
    "properties": {
        "opening": {
            "type": "string",
            "description": "1-2 sentences the interviewer can say to open the call warmly.",
        },
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "topic": {"type": "string", "description": "2-4 word label."},
                    "question": {"type": "string", "description": "The question phrased as it would be spoken aloud."},
                    "why": {"type": "string", "description": "The specific evidence (CV/GitHub/LinkedIn/job) that prompted it."},
                    "follow_up": {"type": "string", "description": "A natural follow-up depending on their answer."},
                    "source": {
                        "type": "string",
                        "enum": ["cv", "cover_letter", "github", "linkedin", "job_description", "general"],
                    },
                },
                "required": ["topic", "question", "why", "follow_up", "source"],
            },
        },
        "closing": {"type": "string", "description": "A natural way to wrap up and invite the candidate's questions."},
    },
    "required": ["opening", "questions", "closing"],
}

LIVE_SCHEMA = {
    "type": "object",
    "properties": {
        "observation": {
            "type": "string",
            "description": "1-2 sentences on how the conversation is going and what has been covered.",
        },
        "suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "reason": {"type": "string", "description": "Why ask this now, referencing what was just said."},
                },
                "required": ["question", "reason"],
            },
        },
    },
    "required": ["observation", "suggestions"],
}

DEFAULT_STYLE = """Write the questions the way a thoughtful, friendly senior colleague would
actually talk -- this should feel like a natural conversation, not an
interrogation or a checklist. Guidelines:
- Follow a natural arc: a warm, easy opener; their background and story; deeper
  dives into specific things from their CV / GitHub / LinkedIn; how their skills
  fit this role; a realistic scenario or two; and space for their own questions.
- Prefer open-ended questions ("Tell me about...", "How did you approach...",
  "What was hardest about...") over yes/no or trivia questions.
- Reference specifics (a named project, employer, repo, technology) so it is
  clear you read their materials; never invent details that were not given.
- Each question should stand alone as something you can say out loud, with a
  short follow-up to keep the conversation flowing.
- Where GitHub/LinkedIn data is unavailable, rely on the CV and job description
  and do not mention that data was missing to the candidate.
- Aim for 8-12 questions."""


def _profile_section(name: str, summary: dict | None, error: str | None) -> str:
    if summary:
        return f"## {name}\n{json.dumps(summary, indent=2, default=str)[:6000]}"
    return f"## {name}\nNot available ({error or 'not provided'})."


def _candidate_block(job: Job, applicant: Applicant) -> str:
    return f"""## Role
Title: {job.title}
Department: {job.department}
Description:
{job.description}

## Candidate
Name: {applicant.name}
Years of experience (self-reported): {applicant.experience_years}
CV text: {(applicant.cv_summary or "not provided")[:8000]}
Cover letter: {(applicant.cover_letter or "not provided")[:3000]}"""


async def generate_interview_questions(
    job: Job,
    applicant: Applicant,
    github: tuple[dict | None, str | None],
    linkedin: tuple[dict | None, str | None],
    extra_instructions: str | None,
) -> tuple[dict, dict]:
    extra = ""
    if extra_instructions and extra_instructions.strip():
        extra = f"""

## Interviewer's priorities for THIS interview (follow these; they take precedence
## over the default guidelines where they conflict)
{extra_instructions.strip()[:2000]}"""

    prompt = f"""You are helping an interviewer prepare for a live video interview with a candidate.
Using ONLY the material below, prepare questions to ask.

{DEFAULT_STYLE}{extra}

{_candidate_block(job, applicant)}

{_profile_section("GitHub", *github)}

{_profile_section("LinkedIn", *linkedin)}

Respond with ONLY JSON matching the required schema."""
    return await generate_json(prompt, QUESTIONS_SCHEMA, temperature=0.6)


async def generate_live_suggestions(
    job: Job,
    applicant: Applicant,
    transcript_lines: list[str],
    prepared_topics: list[str],
) -> tuple[dict, dict]:
    transcript = "\n".join(transcript_lines[-60:]) or "(nothing said yet)"
    topics = ", ".join(prepared_topics) if prepared_topics else "none prepared"
    prompt = f"""You are an assistant sitting silently beside an interviewer during a live
video interview, watching the live speech-to-text transcript. Suggest what to
ask next so the conversation stays natural.

Rules:
- Give at most 3 suggestions, each a single question phrased as it would be
  spoken, tied to something the candidate actually just said (probe vague claims,
  dig into interesting specifics, check claims against the CV).
- Do NOT repeat anything the interviewer already asked.
- If the transcript is short or empty, suggest a gentle opener.
- Be brief; the interviewer is mid-conversation.

## Role: {job.title}
{job.description[:1500]}

## Candidate: {applicant.name}
CV text: {(applicant.cv_summary or "not provided")[:3000]}

## Topics already prepared by the interviewer
{topics}

## Live transcript so far (oldest first)
{transcript}

Respond with ONLY JSON matching the required schema."""
    return await generate_json(prompt, LIVE_SCHEMA, temperature=0.5)
