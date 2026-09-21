import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import AccountStatus, ApprovalAction, Role


class SignupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_.-]+$")
    full_name: str = Field(min_length=1, max_length=150)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Role
    phone_number: str | None = Field(default=None, max_length=30)
    country: str | None = Field(default=None, max_length=100)
    city: str | None = Field(default=None, max_length=100)
    title: str | None = Field(default=None, max_length=150)
    department: str | None = Field(default=None, max_length=150)


class AdminCreateHrRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_.-]+$")
    full_name: str = Field(min_length=1, max_length=150)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    phone_number: str | None = Field(default=None, max_length=30)
    country: str | None = Field(default=None, max_length=100)
    city: str | None = Field(default=None, max_length=100)
    title: str | None = Field(default=None, max_length=150)
    department: str | None = Field(default=None, max_length=150)


class ApprovalEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    action: ApprovalAction
    by_user_id: uuid.UUID | None
    by_user_name: str
    note: str | None
    created_at: datetime


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    full_name: str
    email: EmailStr
    phone_number: str | None
    country: str | None
    city: str | None
    role: Role
    status: AccountStatus
    title: str | None
    department: str | None
    is_demo: bool
    auto_save_cv_bank_on_reject: bool
    created_at: datetime
    updated_at: datetime


class UserWithHistory(UserRead):
    approval_events: list[ApprovalEventRead] = []


class DecisionInput(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


class HrSettingsUpdate(BaseModel):
    auto_save_cv_bank_on_reject: bool
