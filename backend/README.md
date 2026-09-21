# Onboarding Platform — Backend

FastAPI backend for the Employee Onboarding Platform: authentication, users
(admin/HR), jobs, applicants, interview appointments, the CV bank, and a
real AI Job Review pipeline (GitHub + LinkedIn + CV vs. job description,
scored by Gemini). PostgreSQL for data, MinIO for CV file storage.

The frontend (`../frontend`) is fully wired to this backend — see its
README for how to run both together.

See [`docs/database-schema.pdf`](docs/database-schema.pdf) (or
`docs/database-schema.html`) for the ER diagram, table reference, and auth
design as of the initial build. **Note:** it predates the
`ai_review_details` column and `ai_usage_events` table added for the AI
Job Review pipeline — regenerate via `docs/render_pdf.py` if it matters.

## Prerequisites

- Python 3.10 (newer versions may lack wheels for some dependencies)
- A running PostgreSQL instance and database
- A running MinIO instance
- A Gemini API key (for AI Job Review) — free tier at [Google AI Studio](https://aistudio.google.com/)
- Optional: a GitHub personal access token (raises the API rate limit from 60/hr to 5000/hr; no scopes needed)
- Optional: a Bright Data API token (required for the LinkedIn side of AI Job Review — without it, LinkedIn is scored as "unavailable" rather than failing)

## Setup

```bash
cd backend
py -3.10 -m venv .venv
./.venv/Scripts/pip install -r requirements.txt   # Windows
# source .venv/bin/activate && pip install -r requirements.txt   # macOS/Linux

cp .env.example .env   # then fill in your real credentials
```

Apply migrations:

```bash
./.venv/Scripts/python -m alembic upgrade head
```

(Optional) Load the same demo dataset the frontend prototype ships with —
5 users, 4 jobs, 12 applicants, 3 appointments, 1 CV bank entry, with real
CV files uploaded to MinIO:

```bash
./.venv/Scripts/python -m app.seed
```

Run the API:

```bash
./.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

Interactive docs at `http://localhost:8000/docs`.

**On Windows, avoid `--reload`** for anything other than quick local
iteration: its watcher spawns the real server as a child process, and
killing the parent (e.g. to free the port) can leave that child running
and still holding the socket, orphaned. If port 8000 seems stuck, check
`Get-CimInstance Win32_Process -Filter "Name='python.exe'"` in PowerShell
for a lingering `multiprocessing.spawn` child and stop it directly.

## Demo accounts (if seeded)

| Role  | Email                    | Password    |
| ----- | ------------------------ | ----------- |
| Admin | `admin@demo.com`         | `Admin@123` |
| HR    | `hr@demo.com`            | `Hr@123`    |

Two more accounts (`fatima.noor@company.com`, `usman.tariq@company.com`)
are seeded with `status = pending` to exercise the approval flow.

## Project layout

```
app/
  main.py            FastAPI app, CORS, router wiring, startup (MinIO bucket)
  config.py          Settings loaded from .env (pydantic-settings)
  database.py        Async SQLAlchemy engine/session
  deps.py            Auth dependencies (get_current_user, require_role, ...)
  core/
    security.py      Password hashing (bcrypt) + JWT issue/verify
    storage.py        MinIO client, upload/presign/delete
    cv_extract.py      Extracts text from an uploaded CV (PDF/text) into cv_summary
  integrations/
    github_client.py  Pulls a public GitHub profile's activity/repos (PyGithub)
    linkedin_client.py Pulls a LinkedIn profile via Bright Data (brightdata-sdk)
    gemini_client.py  Sends CV + GitHub + LinkedIn to Gemini, asks for scores + reasoning
  models/            SQLAlchemy ORM models (one file per table)
  schemas/           Pydantic request/response models
  routers/           auth, users, jobs, applicants (+ appointments), cv_bank, ai_review
  seed.py            Demo data loader
alembic/             Migrations
docs/                ER diagram + schema documentation (HTML source + PDF)
```

## AI Job Review

`POST /applicants/{id}/ai-review` (HR only, must own the job) runs the
real evaluation pipeline for one candidate:

1. Pulls their GitHub activity/repos (if `github_url` is set) via PyGithub.
2. Pulls their LinkedIn profile (if `linkedin_url` is set) via Bright Data
   — skipped with a clear "unavailable" reason if `BRIGHTDATA_API_TOKEN`
   isn't configured.
3. Sends both, plus the applicant's CV text (extracted from their upload)
   and cover letter, plus the job description, to Gemini, asking for a
   1–5 score *and* a written reason for each of: communication, JD
   overlap, GitHub, LinkedIn, and overall.
4. Stores the scores on the applicant and the full reasoning/snapshot in `ai_review_details` (JSONB).
5. Logs the call (tokens, success/failure) to `ai_usage_events`, which
   backs `GET /ai-usage/summary` (admin only) — the usage meter in the
   admin frontend.

Each run is a real, metered call to GitHub/Bright Data/Gemini and can be
started by an admin or the job's assigned HR. "Run AI on all" in the UI just
runs this endpoint once per applicant, sequentially. Transient Gemini errors
(503s, 429 rate limits) are retried up to 4 times, honouring Gemini's
"retry in Ns" hint. The result is a recommendation only.

Ranking and moving applicants (assigned HR only):

- `PUT /jobs/{id}/applicants/order` — the HR's manual order (`manual_rank`),
  which overrides the AI order.
- `POST /jobs/{id}/applicants/bulk-action` — `pass_to_interview` (stage
  `assessment_passed`, shown as "Interview Pending"), `coding_assessment`
  (technical jobs only, stage `coding_assessment`) or `reject` (honours the
  HR's auto-save-to-CV-bank setting).
- CV files live in MinIO. Application CVs are stored under `cvs/`; saving a
  rejected applicant to the CV bank makes an independent **copy** under
  `cv-bank/`, so deleting the applicant/job never removes the bank's copy
  and removing a bank entry never touches an application CV. Deleting a job
  or applicant also deletes its CV objects. `GET .../cv-url?inline=true`
  returns a short-lived presigned URL for in-browser viewing (omit for a
  download).
- `POST /applicants/{id}/pass-to-interview` and
  `/forward-coding-assessment` — the single-applicant equivalents.

A job is "technical" when `collect_github` is on (the admin's "Technical role"
checkbox): it shows the GitHub field on the public form and enables the
coding-assessment step.

## Video interviews (Agora)

Setup: `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` in `backend/.env` (the
certificate is a secret and never leaves the backend; the frontends only ever
receive a short-lived RTC token). Tokens are built by `core/agora.py` with the
`agora-token-builder` package (AccessToken v1, "006" - accepted by Agora).

Flow (`routers/interviews.py` for the interviewer, `routers/public_interviews.py`
for the candidate):

1. `POST /appointments/setup-rooms` - for selected appointments, creates a
   secret `room_token` (the candidate's link is
   `{apply-portal}/interview/{room_token}`); status `not_setup -> ready`.
2. `POST /appointments/{id}/room/start` - interviewer opens the room
   (`ready -> live`) and chooses whether to record. The candidate can join
   only while the room is live (`POST /public/interviews/{token}/join`).
3. Each browser transcribes only its own microphone (Web Speech API) and posts
   utterances (`POST .../transcript`), so speakers are always known. They land
   in `interview_segments`; the interviewer polls `GET .../transcript?after=`.
4. `POST /appointments/{id}/live-assist` - Gemini reads the last ~60 transcript
   lines and suggests what to ask next (metered, logged to `ai_usage_events`).
5. `POST /appointments/{id}/recording` - the interviewer's browser records a
   composite (remote + local video, mixed audio) and uploads it at the end.
6. `POST /appointments/{id}/room/end` - compiles the segments into
   `interviews/{id}/transcript.json` in object storage, deletes the temporary
   segment rows, status `ended`.

Storage rule: **blobs live in MinIO, Postgres keeps the pointers + metadata**
(`transcript_object_key`, `transcript_segment_count`, `recording_object_key`,
`recording_size_bytes` on `appointments`), so the DB stays small and files
can be served via presigned URLs. Notes (`interviewer_notes`) and the latest
AI questions (`ai_questions`, `ai_questions_prompt`) are plain columns.

Scheduling rules: `POST /applicants/{id}/schedule-interview` and
`PATCH /appointments/{id}/reschedule` reject past times (422) and overlaps with
another unfinished interview of the same HR or candidate (409, 60-minute slots).
`DELETE /appointments/{id}` removes an unstarted slot (returns the applicant,
who goes back to `assessment_passed` if it was their only interview).

Per-interview data lives on the `appointments` row (the interview "dataset"):
pre-meeting `interviewer_notes`, post-interview `interviewer_review`, the AI
questions, timing, and the object-storage keys of the transcript and recording.
`POST /appointments/{id}/room/end {review}` saves the review when ending;
`PATCH /appointments/{id}/review` edits it later. Rescheduling an interview
that already ended is rejected - schedule another one instead. HR's overall
rating/notes on a candidate: `PATCH /applicants/{id}/hr-assessment`
(`hr_score` in half steps 0.5-5, `hr_notes`).

AI interview questions: `POST /appointments/{id}/ai-questions {prompt?}` feeds
CV text, cover letter, GitHub/LinkedIn (reusing the stored AI-review snapshots
when present) and the job description to Gemini; the default style asks for a
natural, conversational interview and the optional `prompt` is the
interviewer's priorities for that interview.

## Notes on what's intentionally minimal for now

- No refresh-token revocation list — logout is client-side only.
- No public "apply to this job" endpoint yet — applicants are created by an
  authenticated admin/HR. A public careers-page flow is a natural next
  addition (see `../TODO.txt` for the Google Form webhook discussion).
- The "notify me a day prior" flag is stored but nothing sends a real
  reminder yet.

Full rationale for these, plus everything else outstanding, is in
[`../TODO.txt`](../TODO.txt).
