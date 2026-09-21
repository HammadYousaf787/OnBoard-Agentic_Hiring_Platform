# Employee Onboarding Platform

A recruitment/onboarding platform with an Admin dashboard and an HR dashboard:
account approvals, job postings, applicant pipelines (coding assessment for technical roles → interview →
accept/reject), interview scheduling with Agora video rooms (AI interview questions, live transcript, live AI assistance, recording), Gemini-powered AI review (a recommendation only; HR sets the final ranking), and a CV
bank — backed by a real FastAPI + PostgreSQL + MinIO backend.

## Layout

```
frontend/      Next.js app (Admin + HR dashboards), port 3000
apply-portal/  Next.js app (public applicant form), port 3001
backend/    FastAPI app (auth, jobs, applicants, appointments, CV bank)
TODO.txt    Living list of what's left to build + recommendations
```

Each half has its own README with full setup instructions:

- [`frontend/README.md`](frontend/README.md)
- [`backend/README.md`](backend/README.md)

## Running both together (local dev)

1. **Backend** — from `backend/`: create/activate the venv, `pip install -r requirements.txt`,
   run migrations, optionally seed demo data, then `python -m uvicorn app.main:app --reload --port 8000`.
   See `backend/README.md` for exact commands.
2. **Frontend** — from `frontend/`: `npm install`, then `npm run dev`. It expects the
   backend at `http://localhost:8000` (configured via `frontend/.env.local`,
   `NEXT_PUBLIC_API_BASE_URL`).
3. **Apply portal** — from `apply-portal/`: `npm install`, `npm run dev` (port 3001). Its home
   page lists every open job (kept in sync with the platform); each job's form lives at
   `http://localhost:3001/apply/<job id>`, and admins/HR can also copy that link from the
   "Application form" card on the job page.
4. Postgres and MinIO must already be running locally before starting the backend.

Demo accounts (once seeded): `admin@demo.com` / `Admin@123` and `hr@demo.com` / `Hr@123`.

## Status

See [`TODO.txt`](TODO.txt) for what's built, what's outstanding, and open
recommendations — kept up to date as work continues.
