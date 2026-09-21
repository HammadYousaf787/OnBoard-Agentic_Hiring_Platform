import enum


class Role(str, enum.Enum):
    admin = "admin"
    hr = "hr"


class AccountStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    removed = "removed"


class ApprovalAction(str, enum.Enum):
    approved = "approved"
    rejected = "rejected"
    removed = "removed"
    reinstated = "reinstated"


class JobStatus(str, enum.Enum):
    open = "open"
    closed = "closed"


class ApplicantStage(str, enum.Enum):
    applied = "applied"
    coding_assessment = "coding_assessment"
    assessment_passed = "assessment_passed"
    interview_scheduled = "interview_scheduled"
    accepted = "accepted"
    rejected = "rejected"
