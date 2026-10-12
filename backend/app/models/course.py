"""Course structure: Course → Module → Lesson → Content → Practical/Exercise → Assessment → Rubric."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class Course(TimestampMixin, Base):
    __tablename__ = "courses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    short_title: Mapped[str] = mapped_column(String(60), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    level: Mapped[str] = mapped_column(String(40), default="Foundation")
    version: Mapped[str] = mapped_column(String(20), default="1.0")
    delivery_mode: Mapped[str] = mapped_column(String(40), default="Blended")  # Online / Classroom / Hybrid / Blended
    planned_hours: Mapped[float] = mapped_column(Float, default=0)
    target_video_hours: Mapped[float] = mapped_column(Float, default=0)
    prerequisite_course_id: Mapped[Optional[int]] = mapped_column(ForeignKey("courses.id"))
    min_qualification: Mapped[Optional[str]] = mapped_column(String(120))
    target_audience: Mapped[Optional[str]] = mapped_column(Text)
    ndu_course_ref: Mapped[Optional[str]] = mapped_column(String(60))
    pass_percentage: Mapped[float] = mapped_column(Float, default=50)
    min_attendance: Mapped[float] = mapped_column(Float, default=75)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    modules: Mapped[list["Module"]] = relationship(
        back_populates="course", order_by="Module.sequence", cascade="all, delete-orphan"
    )
    prerequisite: Mapped[Optional["Course"]] = relationship(remote_side=[id])


class Module(TimestampMixin, Base):
    __tablename__ = "modules"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)

    course: Mapped[Course] = relationship(back_populates="modules")
    lessons: Mapped[list["Lesson"]] = relationship(
        back_populates="module", order_by="Lesson.sequence", cascade="all, delete-orphan"
    )


class Lesson(TimestampMixin, Base):
    __tablename__ = "lessons"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    module_id: Mapped[int] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"), nullable=False, index=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    objective: Mapped[Optional[str]] = mapped_column(Text)

    module: Mapped[Module] = relationship(back_populates="lessons")
    content_items: Mapped[list["ContentItem"]] = relationship(back_populates="lesson")


class Rubric(TimestampMixin, Base):
    __tablename__ = "rubrics"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[Optional[int]] = mapped_column(ForeignKey("courses.id"), index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    criteria: Mapped[list] = mapped_column(JSON, default=list)  # [{"name": str, "max_score": int, "descriptor": str}]
    total_score: Mapped[int] = mapped_column(Integer, default=100)


class Practical(TimestampMixin, Base):
    __tablename__ = "practicals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    module_id: Mapped[Optional[int]] = mapped_column(ForeignKey("modules.id"), index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    scenario: Mapped[Optional[str]] = mapped_column(Text)
    objective: Mapped[Optional[str]] = mapped_column(Text)
    instructions: Mapped[list] = mapped_column(JSON, default=list)
    tools: Mapped[Optional[str]] = mapped_column(String(300))
    max_score: Mapped[int] = mapped_column(Integer, default=100)
    rubric_id: Mapped[Optional[int]] = mapped_column(ForeignKey("rubrics.id"))
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=90)

    course: Mapped[Course] = relationship()
    module: Mapped[Optional[Module]] = relationship()
    rubric: Mapped[Optional[Rubric]] = relationship()


class Exercise(TimestampMixin, Base):
    __tablename__ = "exercises"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    module_id: Mapped[Optional[int]] = mapped_column(ForeignKey("modules.id"), index=True)
    lesson_id: Mapped[Optional[int]] = mapped_column(ForeignKey("lessons.id"))
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    exercise_type: Mapped[str] = mapped_column(String(40), default="Hands-on")
    has_answer_key: Mapped[bool] = mapped_column(Boolean, default=True)
    max_score: Mapped[int] = mapped_column(Integer, default=10)

    module: Mapped[Optional[Module]] = relationship()


class Assessment(TimestampMixin, Base):
    __tablename__ = "assessments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    module_id: Mapped[Optional[int]] = mapped_column(ForeignKey("modules.id"), index=True)
    practical_id: Mapped[Optional[int]] = mapped_column(ForeignKey("practicals.id"))
    rubric_id: Mapped[Optional[int]] = mapped_column(ForeignKey("rubrics.id"))
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    assessment_type: Mapped[str] = mapped_column(String(30), nullable=False)  # Quiz/Practical/Assignment/Final Assessment
    max_score: Mapped[float] = mapped_column(Float, default=100)
    pass_percentage: Mapped[float] = mapped_column(Float, default=50)
    sequence: Mapped[int] = mapped_column(Integer, default=1)
    has_answer_key: Mapped[bool] = mapped_column(Boolean, default=True)

    course: Mapped[Course] = relationship()
    module: Mapped[Optional[Module]] = relationship()
    rubric: Mapped[Optional[Rubric]] = relationship()


class ContentItem(TimestampMixin, Base):
    """Instructional video / resource record in the Digital Content Library."""

    __tablename__ = "content_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(30), default="Video")  # Video / Resource
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    module_id: Mapped[Optional[int]] = mapped_column(ForeignKey("modules.id"), index=True)
    lesson_id: Mapped[Optional[int]] = mapped_column(ForeignKey("lessons.id"), index=True)
    instructor: Mapped[Optional[str]] = mapped_column(String(150))
    duration_minutes: Mapped[float] = mapped_column(Float, default=0)
    learning_objective: Mapped[Optional[str]] = mapped_column(Text)
    is_deep_dive: Mapped[bool] = mapped_column(Boolean, default=False)
    production_status: Mapped[str] = mapped_column(String(40), default="Idea")
    practical_id: Mapped[Optional[int]] = mapped_column(ForeignKey("practicals.id"))
    exercise_id: Mapped[Optional[int]] = mapped_column(ForeignKey("exercises.id"))
    assessment_id: Mapped[Optional[int]] = mapped_column(ForeignKey("assessments.id"))

    # Technical metadata
    resolution: Mapped[Optional[str]] = mapped_column(String(20), default="1920x1080")
    aspect_ratio: Mapped[Optional[str]] = mapped_column(String(10), default="16:9")
    frame_rate: Mapped[Optional[str]] = mapped_column(String(10), default="25")
    file_format: Mapped[Optional[str]] = mapped_column(String(10), default="MP4")
    codec: Mapped[Optional[str]] = mapped_column(String(20), default="H.264")
    audio_sample_rate: Mapped[Optional[str]] = mapped_column(String(20), default="48 kHz")

    # Asset files (local storage; empty until real assets are supplied)
    video_file: Mapped[Optional[str]] = mapped_column(String(300))
    captions_file: Mapped[Optional[str]] = mapped_column(String(300))
    resource_file: Mapped[Optional[str]] = mapped_column(String(300))

    # QC checklist
    qc_original_content: Mapped[bool] = mapped_column(Boolean, default=False)
    qc_human_review: Mapped[bool] = mapped_column(Boolean, default=False)
    qc_srt: Mapped[bool] = mapped_column(Boolean, default=False)
    qc_vtt: Mapped[bool] = mapped_column(Boolean, default=False)
    qc_docx: Mapped[bool] = mapped_column(Boolean, default=False)
    qc_pdf: Mapped[bool] = mapped_column(Boolean, default=False)
    qc_audio: Mapped[bool] = mapped_column(Boolean, default=False)
    qc_technical: Mapped[bool] = mapped_column(Boolean, default=False)
    qc_ai_disclosure: Mapped[bool] = mapped_column(Boolean, default=False)
    qc_needs_review: Mapped[bool] = mapped_column(Boolean, default=False)
    qc_notes: Mapped[Optional[str]] = mapped_column(Text)
    qc_reviewed_by: Mapped[Optional[str]] = mapped_column(String(150))
    qc_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    # AI usage disclosure
    ai_used: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_tool: Mapped[Optional[str]] = mapped_column(String(150))
    ai_purpose: Mapped[Optional[str]] = mapped_column(String(300))
    ai_human_reviewer: Mapped[Optional[str]] = mapped_column(String(150))
    ai_disclosure_text: Mapped[Optional[str]] = mapped_column(Text)

    # Restriction compliance checklist {key: bool}
    compliance: Mapped[dict] = mapped_column(JSON, default=dict)

    course: Mapped[Course] = relationship(lazy="joined")
    module: Mapped[Optional[Module]] = relationship(lazy="joined")
    lesson: Mapped[Optional[Lesson]] = relationship(back_populates="content_items", lazy="joined")
    practical: Mapped[Optional[Practical]] = relationship()
    exercise: Mapped[Optional[Exercise]] = relationship()
    assessment: Mapped[Optional[Assessment]] = relationship()
