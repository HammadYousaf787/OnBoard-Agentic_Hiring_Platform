import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import delete_cv, get_cv_download_url
from app.database import get_db
from app.deps import require_any_role
from app.models.cv_bank_entry import CvBankEntry
from app.models.user import User
from app.schemas.cv_bank import CvBankEntryRead

router = APIRouter(prefix="/cv-bank", tags=["cv-bank"])


@router.get("", response_model=list[CvBankEntryRead])
async def list_cv_bank_entries(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_any_role),
) -> list[CvBankEntry]:
    # Shared, org-wide talent pool -- not scoped to the HR who rejected the
    # candidate, so any admin or HR can browse it for future openings.
    result = await db.execute(select(CvBankEntry).order_by(CvBankEntry.rejected_at.desc()))
    return list(result.scalars().all())


@router.get("/{entry_id}/cv-url")
async def get_cv_bank_entry_cv_url(
    entry_id: uuid.UUID,
    inline: bool = False,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_any_role),
) -> dict[str, str | None]:
    entry = await db.get(CvBankEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV bank entry not found.")
    if not entry.cv_object_key:
        return {"url": None}
    return {"url": get_cv_download_url(entry.cv_object_key, entry.cv_file_name, inline)}


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cv_bank_entry(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_any_role),
) -> None:
    entry = await db.get(CvBankEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV bank entry not found.")

    # Each entry owns its own copy of the file (see copy_cv_to_bank), so this
    # never touches the original applicant's CV.
    if entry.cv_object_key:
        delete_cv(entry.cv_object_key)

    await db.delete(entry)
    await db.commit()
