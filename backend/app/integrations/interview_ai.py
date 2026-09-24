"""
OpenAI prompts for the video-interview feature: (1) a set of natural,
personalised interview questions prepared before the call, and (2) live
suggestions based on the running transcript.
"""

import json

from app.integrations.openai_client import generate_json
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
    return await generate_json(prompt, QUESTIONS_SCHEMA, "interview_questions", temperature=0.6)


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
    return await generate_json(prompt, LIVE_SCHEMA, "interview_live_assist", temperature=0.5)



QA_SCHEMA = {
    "type": "object",
    "properties": {
        "evaluations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question_segment_id": {
                        "type": "integer",
                        "description": "The [id] of the interviewer line that contains the question.",
                    },
                    "question": {"type": "string", "description": "The question, as asked (short)."},
                    "answer_summary": {"type": "string", "description": "1-2 sentences on what the candidate actually said."},
                    "depth": {"type": "string", "enum": ["shallow", "adequate", "strong"]},
                    "should_probe": {
                        "type": "boolean",
                        "description": "True if the interviewer would learn something valuable by going deeper.",
                    },
                    "recommendation": {
                        "type": "string",
                        "description": "1-2 sentences to the interviewer: what to dig into (or 'Covered well -- move on').",
                    },
                    "follow_ups": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "0-2 follow-up questions phrased as spoken aloud; empty when should_probe is false.",
                    },
                },
                "required": [
                    "question_segment_id",
                    "question",
                    "answer_summary",
                    "depth",
                    "should_probe",
                    "recommendation",
                    "follow_ups",
                ],
            },
        }
    },
    "required": ["evaluations"],
}


async def analyze_answered_questions(
    job: Job,
    applicant: Applicant,
    transcript_lines: list[str],
    already_evaluated_ids: list[int],
    prepared_topics: list[str],
) -> tuple[dict, dict]:
    """Looks at the running transcript and evaluates every interviewer question
    that has been asked AND fully answered but not yet evaluated. Returns an
    empty `evaluations` list (the common case) when nothing new qualifies."""
    transcript = "\n".join(transcript_lines[-80:]) or "(nothing said yet)"
    done = ", ".join(str(i) for i in already_evaluated_ids) or "none"
    topics = ", ".join(prepared_topics) if prepared_topics else "none prepared"
    prompt = f"""You are silently assisting an interviewer during a live video interview. You read
the running speech-to-text transcript. Each line is "[id] Speaker (role): text".
Your ONLY job: find interviewer questions that have now been asked AND answered by
the candidate, and judge whether the interviewer should dig deeper into that answer.

Rules:
- Evaluate a question only if (a) the interviewer really asked the candidate an
  interview question (not small talk, logistics, or "can you hear me"), AND
  (b) the candidate has given a complete answer to it -- the candidate finished
  speaking, or the interviewer has moved on. If the candidate may still be mid-answer
  or has not answered yet, do NOT evaluate that question now (it will be considered
  on a later pass).
- Never evaluate a question whose interviewer line [id] is in this already-evaluated
  list: {done}
- An empty "evaluations" list is the normal, expected result when nothing new qualifies.
- Judge the depth of the answer: "shallow" (vague, generic, no specifics), "adequate"
  (reasonable but could show more), "strong" (specific, owned, with detail/trade-offs/
  results). Set should_probe=true only when going deeper would reveal something useful
  (vague claims, missing specifics like numbers/ownership/trade-offs, something that
  doesn't match the CV, an interesting thread). When should_probe is false, say the
  topic is covered and leave follow_ups empty.
- follow_ups: at most 2, each a single natural question phrased as spoken aloud, tied to
  what the candidate actually said. Do not repeat what the interviewer already asked.
- The transcript is machine-generated and may contain mishearings; don't penalise the
  candidate for likely transcription errors.
- Be concise: the interviewer is mid-conversation.

## Role: {job.title}
{job.description[:1200]}

## Candidate: {applicant.name}
CV text: {(applicant.cv_summary or "not provided")[:2500]}

## Topics the interviewer prepared
{topics}

## Transcript (oldest first)
{transcript}

Respond with ONLY JSON matching the required schema."""
    return await generate_json(prompt, QA_SCHEMA, "interview_qa_analysis", temperature=0.3)
