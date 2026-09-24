"""CV tools. Two different jobs, deliberately separate:

- get_applicant_cv_file / get_cv_bank_file: the HR wants to SEE a CV. Returns
  the real PDF as an attachment (rendered as a file card in the chat panel via
  the tool's artifact channel) -- the extracted text never goes into the reply.
- get_applicant_cv_text: the HR asks a QUESTION about a CV. Returns the text
  already extracted at application time (Applicant.cv_summary) so the model can
  reason over it, instead of re-reading the PDF from MinIO.
"""

import uuid
from typing import Annotated

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from sqlalchemy import or_, select

from app.assistant.state import HrAssistantState
from app.assistant.tools._actions import attachment
from app.assistant.tools._db import session
from app.assistant.tools.applicants import _owned_applicant
from app.core.storage import get_cv_download_url
from app.models.cv_bank_entry import CvBankEntry

_URL_MINUTES = 60


def _kind(file_name: str | None) -> str:
    name = (file_name or "").lower()
    if name.endswith(".pdf"):
        return "pdf"
    if name.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp")):
        return "image"
    return "file"


def _cv_attachment(object_key: str, file_name: str | None) -> dict:
    name = file_name or "cv.pdf"
    return attachment(
        name,
        get_cv_download_url(object_key, name, inline=True, expires_minutes=_URL_MINUTES),
        get_cv_download_url(object_key, name, inline=False, expires_minutes=_URL_MINUTES),
        _kind(name),
    )


@tool(response_format="content_and_artifact")
async def get_applicant_cv_file(
    applicant_ids: list[str], state: Annotated[HrAssistantState, InjectedState]
) -> tuple[str, list[dict]]:
    """Attach the actual CV file (PDF) of one or more applicants to your reply,
    shown to the HR as an openable/downloadable file. Use this when the HR
    asks to see, open, send or share a CV. Do NOT paste CV text or links into
    your reply -- the files appear on their own."""
    hr_id = uuid.UUID(state["hr_id"])
    files, notes = [], []
    async with session() as db:
        for applicant_id in applicant_ids[:10]:
            found = await _owned_applicant(db, hr_id, applicant_id)
            if found is None:
                notes.append(f"{applicant_id}: not one of your applicants")
                continue
            applicant, _job = found
            if not applicant.cv_object_key:
                notes.append(f"{applicant.name}: no CV file on record")
                continue
            files.append(_cv_attachment(applicant.cv_object_key, applicant.cv_file_name))
            notes.append(f"{applicant.name}: attached {applicant.cv_file_name or 'CV'}")
    return "\n".join(notes), files


@tool
async def get_applicant_cv_text(
    applicant_id: str, state: Annotated[HrAssistantState, InjectedState]
) -> str:
    """Returns the extracted text of one applicant's CV, so you can answer a
    question about it (e.g. "does this CV mention Kubernetes experience?").
    For QUESTIONS only -- if the HR wants to see the CV itself use
    get_applicant_cv_file. Never paste the text back in your reply; summarise
    or quote only what answers the question. Don't call it repeatedly for the
    same applicant."""
    hr_id = uuid.UUID(state["hr_id"])
    async with session() as db:
        found = await _owned_applicant(db, hr_id, applicant_id)
        if found is None:
            return "No applicant with that id is assigned to you."
        applicant, _job = found
        if not applicant.cv_summary:
            return f"No CV text is on file for {applicant.name}."
        return f"CV text for {applicant.name} ({applicant.cv_file_name}):\n\n{applicant.cv_summary}"


@tool
async def search_cv_bank(
    state: Annotated[HrAssistantState, InjectedState], query: str | None = None
) -> str:
    """Browse the shared CV bank (previously rejected candidates kept for
    future openings). Optional query matches name, source job or CV text.
    Returns entry ids to use with get_cv_bank_file. Max 20 shown."""
    async with session() as db:
        stmt = select(CvBankEntry).order_by(CvBankEntry.rejected_at.desc())
        if query:
            like = f"%{query}%"
            stmt = stmt.where(
                or_(
                    CvBankEntry.name.ilike(like),
                    CvBankEntry.source_job_title.ilike(like),
                    CvBankEntry.cv_summary.ilike(like),
                )
            )
        entries = (await db.execute(stmt.limit(20))).scalars().all()
        if not entries:
            return "No CV bank entries match."
        return "\n".join(
            f"- {e.name} (entry_id={e.id}) · {e.experience_years} yrs · from '{e.source_job_title}' · "
            f"{'has CV file' if e.cv_object_key else 'no file'}"
            + (f" · note: {e.note}" if e.note else "")
            for e in entries
        )


@tool(response_format="content_and_artifact")
async def get_cv_bank_file(
    entry_ids: list[str], state: Annotated[HrAssistantState, InjectedState]
) -> tuple[str, list[dict]]:
    """Attach the CV file of one or more CV bank entries to your reply as
    openable files (same rules as get_applicant_cv_file)."""
    files, notes = [], []
    async with session() as db:
        for entry_id in entry_ids[:10]:
            try:
                entry = await db.get(CvBankEntry, uuid.UUID(entry_id))
            except ValueError:
                entry = None
            if entry is None or not entry.cv_object_key:
                notes.append(f"{entry_id}: no such entry or no file")
                continue
            files.append(_cv_attachment(entry.cv_object_key, entry.cv_file_name))
            notes.append(f"{entry.name}: attached {entry.cv_file_name or 'CV'}")
    return "\n".join(notes), files


CV_TOOLS = [get_applicant_cv_file, get_applicant_cv_text, search_cv_bank, get_cv_bank_file]
