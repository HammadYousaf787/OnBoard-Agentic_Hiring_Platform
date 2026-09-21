import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.database import get_db
from app.deps import require_admin, require_hr
from app.models.approval_event import ApprovalEvent
from app.models.enums import AccountStatus, ApprovalAction, Role
from app.models.job import Job
from app.models.user import User
from app.schemas.user import (
    AdminCreateHrRequest,
    DecisionInput,
    HrSettingsUpdate,
    UserRead,
    UserWithHistory,
)

router = APIRouter(tags=["users"])


async def _get_user_or_404(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


@router.get("/users", response_model=list[UserRead])
async def list_users(
    role: Role | None = None,
    status_filter: AccountStatus | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> list[User]:
    query = select(User)
    if role is not None:
        query = query.where(User.role == role)
    if status_filter is not None:
        query = query.where(User.status == status_filter)
    query = query.order_by(User.created_at)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/users/{user_id}", response_model=UserWithHistory)
async def get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> User:
    return await _get_user_or_404(db, user_id)


@router.post("/users/hr", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_hr_directly(
    payload: AdminCreateHrRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    existing = await db.execute(
        select(User).where((User.email == payload.email) | (User.username == payload.username))
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email or username already exists.",
        )

    hr_user = User(
        username=payload.username,
        full_name=payload.full_name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=Role.hr,
        status=AccountStatus.approved,
        phone_number=payload.phone_number,
        country=payload.country,
        city=payload.city,
        title=payload.title,
        department=payload.department,
    )
    db.add(hr_user)
    await db.flush()

    db.add(
        ApprovalEvent(
            user_id=hr_user.id,
            action=ApprovalAction.approved,
            by_user_id=admin.id,
            by_user_name=admin.full_name,
            note="Added directly by admin.",
        )
    )
    await db.commit()
    await db.refresh(hr_user)
    return hr_user


@router.post("/users/{user_id}/approve", response_model=UserWithHistory)
async def approve_user(
    user_id: uuid.UUID,
    payload: DecisionInput,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    user = await _get_user_or_404(db, user_id)
    user.status = AccountStatus.approved
    db.add(
        ApprovalEvent(
            user_id=user.id,
            action=ApprovalAction.approved,
            by_user_id=admin.id,
            by_user_name=admin.full_name,
            note=payload.note,
        )
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/users/{user_id}/reject", response_model=UserWithHistory)
async def reject_user(
    user_id: uuid.UUID,
    payload: DecisionInput,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    user = await _get_user_or_404(db, user_id)
    user.status = AccountStatus.rejected
    db.add(
        ApprovalEvent(
            user_id=user.id,
            action=ApprovalAction.rejected,
            by_user_id=admin.id,
            by_user_name=admin.full_name,
            note=payload.note,
        )
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/users/{user_id}/remove", response_model=UserWithHistory)
async def remove_hr(
    user_id: uuid.UUID,
    payload: DecisionInput,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    user = await _get_user_or_404(db, user_id)
    user.status = AccountStatus.removed
    db.add(
        ApprovalEvent(
            user_id=user.id,
            action=ApprovalAction.removed,
            by_user_id=admin.id,
            by_user_name=admin.full_name,
            note=payload.note,
        )
    )
    # Unassign this HR from any jobs, mirroring the frontend's removeHr behavior.
    await db.execute(update(Job).where(Job.assigned_hr_id == user.id).values(assigned_hr_id=None))
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/users/{user_id}/reinstate", response_model=UserWithHistory)
async def reinstate_hr(
    user_id: uuid.UUID,
    payload: DecisionInput,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    user = await _get_user_or_404(db, user_id)
    user.status = AccountStatus.approved
    db.add(
        ApprovalEvent(
            user_id=user.id,
            action=ApprovalAction.reinstated,
            by_user_id=admin.id,
            by_user_name=admin.full_name,
            note=payload.note,
        )
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/users/me/settings", response_model=UserRead)
async def update_my_settings(
    payload: HrSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr),
) -> User:
    current_user.auto_save_cv_bank_on_reject = payload.auto_save_cv_bank_on_reject
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user
