"""Best-effort text extraction from an uploaded CV file, so its actual
content (not just a filename) can be stored as `cv_summary` and fed to the
AI Job Review pipeline. Supports plain text and PDF; anything else is left
unextracted (cv_summary stays whatever the caller already had)."""

import io

from pypdf import PdfReader

MAX_CHARS = 8000


def extract_cv_text(file_bytes: bytes, filename: str, content_type: str) -> str | None:
    lower_name = filename.lower()

    if content_type == "application/pdf" or lower_name.endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception:  # noqa: BLE001 - a malformed PDF shouldn't break applicant creation
            return None
        text = text.strip()
        return text[:MAX_CHARS] if text else None

    if content_type.startswith("text/") or lower_name.endswith(".txt"):
        try:
            text = file_bytes.decode("utf-8", errors="ignore").strip()
        except Exception:  # noqa: BLE001
            return None
        return text[:MAX_CHARS] if text else None

    return None
