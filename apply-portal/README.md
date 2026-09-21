# Apply portal

Public, unauthenticated Next.js app where applicants browse open positions and apply. Runs on its
own port (3001) so it can be exposed to the internet separately from the internal admin/HR platform.

- `/` — lists every job that is currently open and has seats left (`GET /public/jobs`). Refetches
  every 20s and when the tab regains focus, so jobs an admin opens/closes show up on their own.
- `/apply/<jobId>` — the application form. Every job uses the same standard fields; only the job
  title/description (from the job entry) differ, plus an optional GitHub URL field that appears
  only when an admin ticked "Ask applicants for their GitHub profile" on that job.
- Submits to `POST /public/jobs/{id}/apply`.
- Configure the backend location with `NEXT_PUBLIC_API_BASE_URL` in `.env.local`; the backend must
  list this app's origin in `APPLY_PORTAL_ORIGIN` (CORS).

```bash
npm install
npm run dev   # http://localhost:3001
```
