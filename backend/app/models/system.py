"""NDU integration (mock), notifications, audit log, report log and settings."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import utcnow
from app.models.course import Course
from app.models.org import Learner


class NduEnrollment(Base):
    __tablename__ = "ndu_enrollments"
    __table_args__ = (UniqueConstraint("learner_id", "course_id", name="uq_ndu_learner_course"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    learner_id: Mapped[int] = mapped_column(ForeignKey("learners.id"), nullable=False, index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    enrollment_id: Mapped[Optional[int]] = mapped_column(ForeignKey("course_enrollments.id", ondelete="SET NULL"))
    ndu_learner_ref: Mapped[str] = mapped_column(String(60), nullable=False)
    ndu_course_ref: Mapped[str] = mapped_column(String(60), nullable=False)
    sync_status: Mapped[str] = mapped_column(String(30), default="Pending")  # Pending / Synced / Failed
    learner_synced: Mapped[bool] = mapped_column(Boolean, default=False)
    progress_synced: Mapped[bool] = mapped_column(Boolean, default=False)
    completion_synced: Mapped[bool] = mapped_column(Boolean, default=False)
    ndu_progress_pct: Mapped[float] = mapped_column(Float, default=0)
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    learner: Mapped[Learner] = relationship(lazy="joined")
    course: Mapped[Course] = relationship(lazy="joined")


class NduSyncLog(Base):
    __tablename__ = "ndu_sync_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sync_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(20), default="Portal → NDU")
    learner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("learners.id"), index=True)
    course_id: Mapped[Optional[int]] = mapped_column(ForeignKey("courses.id"))
    field: Mapped[Optional[str]] = mapped_column(String(60))
    old_value: Mapped[Optional[str]] = mapped_column(String(200))
    new_value: Mapped[Optional[str]] = mapped_column(String(200))
    result: Mapped[str] = mapped_column(String(20), default="Success", index=True)
    message: Mapped[Optional[str]] = mapped_column(Text)
    records_processed: Mapped[int] = mapped_column(Integer, default=1)
    triggered_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    triggered_by_name: Mapped[Optional[str]] = mapped_column(String(150))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    learner: Mapped[Optional[Learner]] = relationship(lazy="joined")
    course: Mapped[Optional[Course]] = relationship(lazy="joined")


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(40), default="info")
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    link: Mapped[Optional[str]] = mapped_column(String(300))
    severity: Mapped[str] = mapped_column(String(20), default="info")  # info / success / warning / critical
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    user_email: Mapped[Optional[str]] = mapped_column(String(200))
    user_name: Mapped[Optional[str]] = mapped_column(String(150))
    role: Mapped[Optional[str]] = mapped_column(String(30), index=True)
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    entity: Mapped[Optional[str]] = mapped_column(String(60), index=True)
    entity_id: Mapped[Optional[str]] = mapped_column(String(60))
    result: Mapped[str] = mapped_column(String(20), default="SUCCESS")
    details: Mapped[Optional[str]] = mapped_column(Text)
    ip_address: Mapped[Optional[str]] = mapped_column(String(60))


class ReportLog(Base):
    __tablename__ = "reports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    output_format: Mapped[str] = mapped_column(String(10), default="VIEW")
    filters: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON)
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    generated_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    generated_by_name: Mapped[Optional[str]] = mapped_column(String(150))
    role: Mapped[Optional[str]] = mapped_column(String(30))
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class AppSetting(Base):
    __tablename__ = "app_settings"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON)
    description: Mapped[Optional[str]] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
