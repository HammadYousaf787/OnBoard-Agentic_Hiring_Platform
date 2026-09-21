import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import ApprovalAction


class ApprovalEvent(Base):
    """Audit trail of approvals/rejections/removals/reinstatements for a user account."""

    __tablename__ = "approval_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action: Mapped[ApprovalAction] = mapped_column(SAEnum(ApprovalAction, name="approval_action"), nullable=False)

    # The actor may later be deleted; by_user_name is a snapshot so history
    # stays readable even if that account no longer exists. by_user_id is
    # nullable to allow a "system" actor (e.g. the seeded initial admin).
    by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    by_user_name: Mapped[str] = mapped_column(String(150), nullable=False)

    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], back_populates="approval_events")
