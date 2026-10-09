"""Nomination workflow, batches, enrolment, sessions, attendance and results."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, utcnow
from app.models.course import Assessment, Course, Practical
from app.models.org import Department, Learner, User


class Batch(TimestampMixin, Base):
    __tablename__ = "batches"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"), index=True)  # null = multi-department
    mode: Mapped[str] = mapped_column(String(20), nullable=False)  # Physical / Digital / Hybrid
    location: Mapped[Optional[str]] = mapped_column(String(150))
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, default=30)
    instructor: Mapped[Optional[str]] = mapped_column(String(150))
    status: Mapped[str] = mapped_column(String(20), default="Planned")  # Planned / Active / Completed / Cancelled

    course: Mapped[Course] = relationship(lazy="joined")
    department: Mapped[Optional[Department]] = relationship(lazy="joined")


class Nomination(TimestampMixin, Base):
    __tablename__ = "nominations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nomination_no: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    learner_id: Mapped[int] = mapped_column(ForeignKey("learners.id"), nullable=False, index=True)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"), nullable=False, index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    training_mode: Mapped[str] = mapped_column(String(20), default="Digital")
    status: Mapped[str] = mapped_column(String(30), default="Draft", nullable=False, index=True)
    eligibility_result: Mapped[Optional[str]] = mapped_column(String(30))
    justification: Mapped[Optional[str]] = mapped_column(Text)
    decision_remarks: Mapped[Optional[str]] = mapped_column(Text)
    allocated_course_id: Mapped[Optional[int]] = mapped_column(ForeignKey("courses.id"))
    allocated_batch_id: Mapped[Optional[int]] = mapped_column(ForeignKey("batches.id"))
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    reviewed_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    onboarded_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    learner: Mapped[Learner] = relationship(lazy="joined")
    department: Mapped[Department] = relationship(lazy="joined")
    course: Mapped[Course] = relationship(foreign_keys=[course_id], lazy="joined")
    allocated_course: Mapped[Optional[Course]] = relationship(foreign_keys=[allocated_course_id])
    allocated_batch: Mapped[Optional[Batch]] = relationship()
    created_by: Mapped[Optional[User]] = relationship(foreign_keys=[created_by_id])
    reviewed_by: Mapped[Optional[User]] = relationship(foreign_keys=[reviewed_by_id])
    history: Mapped[list["NominationHistory"]] = relationship(
        back_populates="nomination", order_by="NominationHistory.created_at", cascade="all, delete-orphan"
    )


class NominationHistory(Base):
    __tablename__ = "nomination_history"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nomination_id: Mapped[int] = mapped_column(ForeignKey("nominations.id", ondelete="CASCADE"), index=True)
    from_status: Mapped[Optional[str]] = mapped_column(String(30))
    to_status: Mapped[str] = mapped_column(String(30), nullable=False)
    action: Mapped[str] = mapped_column(String(60), nullable=False)
    remarks: Mapped[Optional[str]] = mapped_column(Text)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    user_name: Mapped[Optional[str]] = mapped_column(String(150))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    nomination: Mapped[Nomination] = relationship(back_populates="history")


class EligibilityCheck(Base):
    __tablename__ = "eligibility_checks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nomination_id: Mapped[int] = mapped_column(ForeignKey("nominations.id", ondelete="CASCADE"), index=True)
    result: Mapped[str] = mapped_column(String(30), nullable=False)
    rules: Mapped[list] = mapped_column(JSON, default=list)  # [{code, rule, outcome: PASS/WARN/FAIL, message}]
    checked_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    checked_by_name: Mapped[Optional[str]] = mapped_column(String(150))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class CourseEnrollment(TimestampMixin, Base):
    """A learner allocated to a course (created on course allocation)."""

    __tablename__ = "course_enrollments"
    __table_args__ = (UniqueConstraint("learner_id", "course_id", name="uq_enrollment_learner_course"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    learner_id: Mapped[int] = mapped_column(ForeignKey("learners.id"), nullable=False, index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    nomination_id: Mapped[Optional[int]] = mapped_column(ForeignKey("nominations.id"))
    batch_id: Mapped[Optional[int]] = mapped_column(ForeignKey("batches.id"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="Allocated")  # Allocated/Batch Assigned/Onboarded/Completed/Not Completed
    allocated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    onboarded_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    learner: Mapped[Learner] = relationship(lazy="joined")
    course: Mapped[Course] = relationship(lazy="joined")
    batch: Mapped[Optional[Batch]] = relationship(lazy="joined")


class BatchEnrollment(TimestampMixin, Base):
    __tablename__ = "batch_enrollments"
    __table_args__ = (UniqueConstraint("batch_id", "learner_id", name="uq_batch_learner"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("batches.id"), nullable=False, index=True)
    learner_id: Mapped[int] = mapped_column(ForeignKey("learners.id"), nullable=False, index=True)
    enrollment_id: Mapped[Optional[int]] = mapped_column(ForeignKey("course_enrollments.id"))
    status: Mapped[str] = mapped_column(String(30), default="Assigned")  # Assigned / Onboarded / Withdrawn
    onboarded_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    batch: Mapped[Batch] = relationship(lazy="joined")
    learner: Mapped[Learner] = relationship(lazy="joined")


class TrainingSession(TimestampMixin, Base):
    __tablename__ = "training_sessions"
    __table_args__ = (UniqueConstraint("batch_id", "session_date", "session_no", name="uq_session_slot"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("batches.id"), nullable=False, index=True)
    session_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    session_no: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[Optional[str]] = mapped_column(String(200))
    module_id: Mapped[Optional[int]] = mapped_column(ForeignKey("modules.id"))
    start_time: Mapped[Optional[str]] = mapped_column(String(10))
    end_time: Mapped[Optional[str]] = mapped_column(String(10))
    mode: Mapped[Optional[str]] = mapped_column(String(20))
    attendance_marked: Mapped[bool] = mapped_column(Boolean, default=False)

    batch: Mapped[Batch] = relationship()


class Attendance(TimestampMixin, Base):
    __tablename__ = "attendance"
    __table_args__ = (UniqueConstraint("session_id", "learner_id", name="uq_attendance_session_learner"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("training_sessions.id", ondelete="CASCADE"), index=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("batches.id"), index=True)
    learner_id: Mapped[int] = mapped_column(ForeignKey("learners.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # Present / Absent / Late / Excused
    remarks: Mapped[Optional[str]] = mapped_column(String(300))
    marked_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))

    session: Mapped[TrainingSession] = relationship()


class PracticalSubmission(TimestampMixin, Base):
    __tablename__ = "practical_submissions"
    __table_args__ = (UniqueConstraint("practical_id", "learner_id", name="uq_practical_learner"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    practical_id: Mapped[int] = mapped_column(ForeignKey("practicals.id"), nullable=False, index=True)
    learner_id: Mapped[int] = mapped_column(ForeignKey("learners.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), default="Not Started")  # Not Started/In Progress/Submitted/Evaluated
    score: Mapped[Optional[float]] = mapped_column(Float)
    rubric_scores: Mapped[Optional[dict]] = mapped_column(JSON)
    remarks: Mapped[Optional[str]] = mapped_column(Text)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    evaluated_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    evaluated_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    practical: Mapped[Practical] = relationship(lazy="joined")
    learner: Mapped[Learner] = relationship(lazy="joined")


class AssessmentResult(TimestampMixin, Base):
    __tablename__ = "assessment_results"
    __table_args__ = (UniqueConstraint("assessment_id", "learner_id", name="uq_result_assessment_learner"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id"), nullable=False, index=True)
    learner_id: Mapped[int] = mapped_column(ForeignKey("learners.id"), nullable=False, index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    module_id: Mapped[Optional[int]] = mapped_column(ForeignKey("modules.id"))
    score: Mapped[float] = mapped_column(Float, nullable=False)
    max_score: Mapped[float] = mapped_column(Float, nullable=False)
    percentage: Mapped[float] = mapped_column(Float, nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=1)
    remarks: Mapped[Optional[str]] = mapped_column(Text)
    evaluator_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    evaluator_name: Mapped[Optional[str]] = mapped_column(String(150))
    evaluated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    assessment: Mapped[Assessment] = relationship(lazy="joined")
    learner: Mapped[Learner] = relationship(lazy="joined")


class LearnerProgress(Base):
    __tablename__ = "learner_progress"
    __table_args__ = (UniqueConstraint("enrollment_id", name="uq_progress_enrollment"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    enrollment_id: Mapped[int] = mapped_column(ForeignKey("course_enrollments.id", ondelete="CASCADE"), index=True)
    learner_id: Mapped[int] = mapped_column(ForeignKey("learners.id"), nullable=False, index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    # Learning-platform (NDU) reported values
    modules_completed: Mapped[int] = mapped_column(Integer, default=0)
    modules_total: Mapped[int] = mapped_column(Integer, default=0)
    content_completed: Mapped[int] = mapped_column(Integer, default=0)
    content_total: Mapped[int] = mapped_column(Integer, default=0)
    current_module_id: Mapped[Optional[int]] = mapped_column(ForeignKey("modules.id"))
    # Portal-computed values
    practicals_completed: Mapped[int] = mapped_column(Integer, default=0)
    practicals_total: Mapped[int] = mapped_column(Integer, default=0)
    assessments_completed: Mapped[int] = mapped_column(Integer, default=0)
    assessments_passed: Mapped[int] = mapped_column(Integer, default=0)
    assessments_failed: Mapped[int] = mapped_column(Integer, default=0)
    assessments_total: Mapped[int] = mapped_column(Integer, default=0)
    attendance_pct: Mapped[Optional[float]] = mapped_column(Float)
    sessions_attended: Mapped[int] = mapped_column(Integer, default=0)
    sessions_marked: Mapped[int] = mapped_column(Integer, default=0)
    average_score: Mapped[Optional[float]] = mapped_column(Float)
    overall_pct: Mapped[float] = mapped_column(Float, default=0)
    expected_pct: Mapped[Optional[float]] = mapped_column(Float)  # schedule-expected progress to date
    schedule_pct: Mapped[Optional[float]] = mapped_column(Float)  # overall / expected (progress against schedule)
    risk_level: Mapped[str] = mapped_column(String(20), default="NOT_STARTED", index=True)
    risk_reasons: Mapped[list] = mapped_column(JSON, default=list)
    last_activity_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_source: Mapped[str] = mapped_column(String(20), default="Portal")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    enrollment: Mapped[CourseEnrollment] = relationship()
    learner: Mapped[Learner] = relationship(lazy="joined")
    course: Mapped[Course] = relationship(lazy="joined")


class CompletionRecord(Base):
    __tablename__ = "completion_records"
    __table_args__ = (UniqueConstraint("enrollment_id", name="uq_completion_enrollment"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    enrollment_id: Mapped[int] = mapped_column(ForeignKey("course_enrollments.id", ondelete="CASCADE"), index=True)
    learner_id: Mapped[int] = mapped_column(ForeignKey("learners.id"), nullable=False, index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(40), default="In Progress", index=True)
    criteria: Mapped[list] = mapped_column(JSON, default=list)  # [{code, label, met, detail}]
    certificate_no: Mapped[Optional[str]] = mapped_column(String(40))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    completed_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    evaluated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    learner: Mapped[Learner] = relationship(lazy="joined")
    course: Mapped[Course] = relationship(lazy="joined")
