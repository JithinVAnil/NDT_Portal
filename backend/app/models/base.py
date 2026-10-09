from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.orm import Mapped, mapped_column


def utcnow() -> datetime:
    """Naive UTC timestamp (portable across PostgreSQL and SQLite)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class RoleCode:
    ADMIN = "ADMIN"
    DEPARTMENT = "DEPARTMENT"
    LEARNER = "LEARNER"
    ALL = (ADMIN, DEPARTMENT, LEARNER)


class NominationStatus:
    DRAFT = "Draft"
    SUBMITTED = "Submitted"
    UNDER_REVIEW = "Under Review"
    ELIGIBLE = "Eligible"
    INELIGIBLE = "Ineligible"
    APPROVED = "Approved"
    REJECTED = "Rejected"
    ALLOCATED = "Allocated"
    ONBOARDED = "Onboarded"
    ALL = (DRAFT, SUBMITTED, UNDER_REVIEW, ELIGIBLE, INELIGIBLE, APPROVED, REJECTED, ALLOCATED, ONBOARDED)


class EligibilityResult:
    ELIGIBLE = "ELIGIBLE"
    REVIEW = "REVIEW_REQUIRED"
    NOT_ELIGIBLE = "NOT_ELIGIBLE"


class RiskLevel:
    ON_TRACK = "ON_TRACK"
    AT_RISK = "AT_RISK"
    CRITICAL = "CRITICAL"
    NOT_STARTED = "NOT_STARTED"


class CompletionStatus:
    IN_PROGRESS = "In Progress"
    ELIGIBLE = "Eligible for Completion"
    COMPLETED = "Completed"
    NOT_COMPLETED = "Not Completed"


PRODUCTION_STAGES = (
    "Idea",
    "Script Ready",
    "Recording Pending",
    "Editing",
    "QC",
    "Captions Pending",
    "Transcript Pending",
    "Approved",
    "Ready for Upload",
)

QC_FIELDS = (
    ("qc_original_content", "Original Content"),
    ("qc_human_review", "Human Review"),
    ("qc_srt", "SRT"),
    ("qc_vtt", "VTT"),
    ("qc_docx", "DOCX Transcript"),
    ("qc_pdf", "Accessible PDF Transcript"),
    ("qc_audio", "Audio QC"),
    ("qc_technical", "Technical QC"),
    ("qc_ai_disclosure", "AI Disclosure"),
)

VIDEO_RESTRICTIONS = (
    ("no_ai_avatar_only", "No AI-avatar-only video"),
    ("no_synthetic_presenter", "No synthetic presenter without instructional value"),
    ("no_stock_only", "No stock-only content"),
    ("no_third_party_reuse", "No reused third-party content"),
    ("no_promotional", "No promotional showreel"),
    ("no_generic_recycled", "No generic recycled content"),
    ("no_unedited_classroom", "No unedited classroom recording"),
    ("no_music_only", "No music-only sections"),
    ("no_unnecessary_pauses", "No unnecessary pauses"),
    ("no_trailers", "No trailers"),
)
