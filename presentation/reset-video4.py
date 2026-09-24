"""Undoes what video 4 (AI features) changes, so it can be re-recorded: puts Daniyal Mirza,
Mahnoor Iqbal, Hassan Javed and Sana Farooqi back to stage 'applied' with no interviews, no AI
review, no HR rating/notes; removes their appointments' MinIO objects and AI-usage rows; and
deletes Sara Malik's assistant chat thread (so the agent starts with a blank conversation).
Run from the backend folder:  .venv/Scripts/python.exe ../presentation/reset-video4.py"""
import sys

sys.path.insert(0, ".")
import psycopg

from app.config import get_settings
from app.core.storage import delete_prefix

NAMES = ["Daniyal Mirza", "Mahnoor Iqbal", "Hassan Javed", "Sana Farooqi"]

s = get_settings()
url = s.sync_database_url.split("+")[0] + "://" + s.sync_database_url.split("://")[1]
with psycopg.connect(url) as conn:
    ids = [r[0] for r in conn.execute("select id from applicants where name = any(%s)", (NAMES,)).fetchall()]
    appts = [r[0] for r in conn.execute("select id from appointments where applicant_id = any(%s)", (ids,)).fetchall()]
    conn.execute("delete from appointments where applicant_id = any(%s)", (ids,))
    conn.execute(
        "update applicants set stage='applied', decided_at=null, hr_notes=null, hr_score=null, "
        "communication_score=null, jd_overlap_score=null, github_score=null, linkedin_score=null, "
        "overall_score=null, ranked_at=null, ai_review_details=null where id = any(%s)",
        (ids,),
    )
    n_usage = conn.execute("delete from ai_usage_events where applicant_id = any(%s)", (ids,)).rowcount
    sara = conn.execute("select id from users where email='sara.malik@company.com'").fetchone()
    threads = 0
    if sara:
        for t in ("checkpoint_writes", "checkpoint_blobs", "checkpoints"):
            threads += conn.execute(f"delete from {t} where thread_id = %s", (f"hr-{sara[0]}",)).rowcount
    conn.commit()
for a in appts:
    delete_prefix(f"interviews/{a}/")
delete_prefix("assistant-charts/")
print(f"reset {len(ids)} applicants, {len(appts)} appointments, {n_usage} usage rows, {threads} chat rows")
