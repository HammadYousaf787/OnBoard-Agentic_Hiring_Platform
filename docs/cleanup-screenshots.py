"""Puts the demo data back after docs/make-screenshots.js: removes the extra "HR Coordinator" job (and its
applicant), the pending "Zoya Farhan" account, all interviews/AI reviews created for the AI Engineer
applicants (via presentation/reset-video4.py), and clears the AI-usage log and the agent's chat history.
Run from the backend folder with the backend venv:  .venv/Scripts/python.exe ../docs/cleanup-screenshots.py"""
import runpy
import sys

sys.path.insert(0, ".")
import httpx
import psycopg

from app.config import get_settings

c = httpx.Client(base_url="http://127.0.0.1:8000", timeout=60)
tok = c.post("/auth/login", data={"username": "hrlead@company.com", "password": "HrLead@123"}).json()["access_token"]
h = {"Authorization": f"Bearer {tok}"}
for j in c.get("/jobs", headers=h).json():
    if j["title"] == "HR Coordinator":
        print("delete job", j["title"], c.delete(f"/jobs/{j['id']}", headers=h).status_code)

sara = httpx.Client(base_url="http://127.0.0.1:8000", timeout=60)
st = sara.post("/auth/login", data={"username": "sara.malik@company.com", "password": "Sara@123"}).json()["access_token"]
sh = {"Authorization": f"Bearer {st}"}
for j in sara.get("/jobs", headers=sh).json():
    for a in sara.get(f"/jobs/{j['id']}/applicants", headers=sh).json():
        if a["email"] == "zain.ahmed@example.com":
            print("delete applicant", a["name"], sara.delete(f"/applicants/{a['id']}", headers=sh).status_code)

s = get_settings()
url = s.sync_database_url.split("+")[0] + "://" + s.sync_database_url.split("://")[1]
with psycopg.connect(url) as conn:
    print("removed users:", conn.execute("delete from users where email = 'zoya.farhan@example.com' returning full_name").fetchall())
    conn.commit()

runpy.run_path("../presentation/reset-video4.py", run_name="__main__")

with psycopg.connect(url) as conn:
    print("usage rows cleared:", conn.execute("delete from ai_usage_events").rowcount)
    conn.commit()
