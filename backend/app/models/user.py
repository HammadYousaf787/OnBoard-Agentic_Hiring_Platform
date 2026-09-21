import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import AccountStatus, Role


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    phone_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)

    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    role: Mapped[Role] = mapped_column(SAEnum(Role, name="user_role"), nullable=False)
    status: Mapped[AccountStatus] = mapped_column(
        SAEnum(AccountStatus, name="account_status"), nullable=False, default=AccountStatus.pending
    )

    title: Mapped[str | None] = mapped_column(String(150), nullable=True)
    department: Mapped[str | None] = mapped_column(String(150), nullable=True)

    # HR-only preference: auto-save a rejected candidate's info to the CV bank.
    auto_save_cv_bank_on_reject: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # lazy="selectin" so this loads automatically as a second query issued by
    # the original SELECT -- required for AsyncSession, which can't do
    # implicit lazy-loading I/O on attribute access outside a greenlet.
    approval_events: Mapped[list["ApprovalEvent"]] = relationship(
        "ApprovalEvent",
        foreign_keys="ApprovalEvent.user_id",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="ApprovalEvent.created_at",
        lazy="selectin",
    )
