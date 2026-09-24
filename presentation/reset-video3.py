"""Puts applicant Areeba Khan back to stage 'applied' with no interviews, so video 3 can be
re-recorded (a finished interview can't be removed through the app). Run from the backend
folder with the backend venv:  .venv/Scripts/python.exe ../presentation/reset-video3.py
Only touches Areeba Khan's row, her appointments, their MinIO objects, and the job's seat count."""
import sys

sys.path.insert(0, ".")
import psycopg

from app.config import get_settings
from app.core.storage import delete_prefix

s = get_settings()
url = s.sync_database_url.split("+")[0] + "://" + s.sync_database_url.split("://")[1]
with psycopg.connect(url) as conn:
    row = conn.execute("select id, job_id, stage from applicants where name = 'Areeba Khan'").fetchone()
    if row is None:
        sys.exit("Areeba Khan not found")
    applicant_id, job_id, stage = row
    appts = [r[0] for r in conn.execute("select id from appointments where applicant_id = %s", (applicant_id,)).fetchall()]
    if stage == "accepted":
        conn.execute("update jobs set filled_seats = greatest(filled_seats - 1, 0), status = 'open' where id = %s", (job_id,))
    conn.execute("delete from appointments where applicant_id = %s", (applicant_id,))
    conn.execute(
        "update applicants set stage = 'applied', decided_at = null, hr_notes = null, hr_score = null where id = %s",
        (applicant_id,),
    )
    conn.commit()
for a in appts:
    delete_prefix(f"interviews/{a}/")
print(f"reset Areeba Khan (was '{stage}'), removed {len(appts)} appointment(s)")
