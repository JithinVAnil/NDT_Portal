"""Validated request bodies (Pydantic). Input validation protects every write endpoint."""
from __future__ import annotations

import re
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
MOBILE_RE = re.compile(r"^[6-9]\d{9}$")

TrainingMode = Literal["Physical", "Digital", "Hybrid"]


def _email(v: str) -> str:
    v = v.strip().lower()
    if not EMAIL_RE.match(v):
        raise ValueError("Enter a valid email address")
    return v


def _mobile(v: Optional[str]) -> Optional[str]:
    if v in (None, ""):
        return None
    v = re.sub(r"[\s-]", "", str(v))
    if v.startswith("+91"):
        v = v[3:]
    if not MOBILE_RE.match(v):
        raise ValueError("Enter a valid 10-digit Indian mobile number")
    return v


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("email")
    @classmethod
    def _v(cls, v: str) -> str:
        return v.strip().lower()


class LearnerCreate(BaseModel):
    employee_id: str = Field(min_length=4, max_length=30)
    full_name: str = Field(min_length=2, max_length=150)
    email: str
    mobile: Optional[str] = Field(default=None, max_length=15)
    designation: Optional[str] = Field(default=None, max_length=120)
    qualification: Optional[str] = Field(default=None, max_length=120)
    department_id: Optional[int] = None
    location: Optional[str] = Field(default=None, max_length=120)

    @field_validator("email")
    @classmethod
    def _e(cls, v: str) -> str:
        return _email(v)

    @field_validator("employee_id")
    @classmethod
    def _id(cls, v: str) -> str:
        v = v.strip().upper()
        if not re.match(r"^[A-Z0-9][A-Z0-9-]{3,29}$", v):
            raise ValueError("Employee ID may contain only letters, digits and hyphens")
        return v

    @field_validator("mobile")
    @classmethod
    def _m(cls, v: Optional[str]) -> Optional[str]:
        return _mobile(v)

    @field_validator("full_name", "designation", "location")
    @classmethod
    def _strip(cls, v: Optional[str]) -> Optional[str]:
        return v.strip() if isinstance(v, str) else v


class LearnerUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    mobile: Optional[str] = Field(default=None, max_length=15)
    designation: Optional[str] = Field(default=None, max_length=120)
    qualification: Optional[str] = Field(default=None, max_length=120)
    location: Optional[str] = Field(default=None, max_length=120)

    @field_validator("mobile")
    @classmethod
    def _m(cls, v: Optional[str]) -> Optional[str]:
        return _mobile(v)


class NominationCreate(BaseModel):
    learner_id: Optional[int] = None
    new_learner: Optional[LearnerCreate] = None
    course_id: int
    training_mode: TrainingMode = "Digital"
    justification: Optional[str] = Field(default=None, max_length=1000)
    submit: bool = False


class DecisionRequest(BaseModel):
    remarks: Optional[str] = Field(default=None, max_length=1000)


class AllocateCourseRequest(BaseModel):
    course_id: Optional[int] = None


class AllocateBatchRequest(BaseModel):
    batch_id: int


class BulkActionRequest(BaseModel):
    nomination_ids: list[int] = Field(min_length=1, max_length=200)


class DepartmentIn(BaseModel):
    code: str = Field(min_length=2, max_length=20)
    name: str = Field(min_length=3, max_length=200)
    ministry: Optional[str] = Field(default=None, max_length=200)
    category: Optional[str] = Field(default=None, max_length=80)
    location: Optional[str] = Field(default=None, max_length=120)
    contact_name: Optional[str] = Field(default=None, max_length=120)
    contact_email: Optional[str] = None
    is_active: bool = True

    @field_validator("code")
    @classmethod
    def _c(cls, v: str) -> str:
        v = v.strip().upper()
        if not re.match(r"^[A-Z0-9-]{2,20}$", v):
            raise ValueError("Code may contain only letters, digits and hyphens")
        return v

    @field_validator("contact_email")
    @classmethod
    def _e(cls, v: Optional[str]) -> Optional[str]:
        return _email(v) if v else None


class UserIn(BaseModel):
    email: str
    full_name: str = Field(min_length=2, max_length=150)
    role: Literal["ADMIN", "DEPARTMENT", "LEARNER"]
    department_id: Optional[int] = None
    learner_id: Optional[int] = None
    designation: Optional[str] = Field(default=None, max_length=120)
    password: Optional[str] = Field(default=None, min_length=8, max_length=100)

    @field_validator("email")
    @classmethod
    def _e(cls, v: str) -> str:
        return _email(v)


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    designation: Optional[str] = Field(default=None, max_length=120)
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=100)


class BatchIn(BaseModel):
    code: str = Field(min_length=4, max_length=40)
    name: str = Field(min_length=3, max_length=200)
    course_id: int
    department_id: Optional[int] = None
    mode: TrainingMode
    location: Optional[str] = Field(default=None, max_length=150)
    start_date: date
    end_date: date
    capacity: int = Field(ge=1, le=500)
    instructor: Optional[str] = Field(default=None, max_length=150)
    status: Literal["Planned", "Active", "Completed", "Cancelled"] = "Planned"

    @field_validator("code")
    @classmethod
    def _c(cls, v: str) -> str:
        v = v.strip().upper()
        if not re.match(r"^[A-Z0-9-]{4,40}$", v):
            raise ValueError("Batch ID may contain only letters, digits and hyphens")
        return v

    @field_validator("end_date")
    @classmethod
    def _d(cls, v: date, info) -> date:
        start = info.data.get("start_date")
        if start and v < start:
            raise ValueError("End date must be on or after start date")
        return v


class SessionIn(BaseModel):
    session_date: date
    session_no: int = Field(default=1, ge=1, le=6)
    title: Optional[str] = Field(default=None, max_length=200)
    module_id: Optional[int] = None
    start_time: Optional[str] = Field(default="10:00", max_length=10)
    end_time: Optional[str] = Field(default="13:00", max_length=10)


class AttendanceRecordIn(BaseModel):
    learner_id: int
    status: Literal["Present", "Absent", "Late", "Excused"]
    remarks: Optional[str] = Field(default=None, max_length=300)


class AttendanceSaveRequest(BaseModel):
    batch_id: int
    session_date: date
    session_no: int = Field(default=1, ge=1, le=6)
    title: Optional[str] = Field(default=None, max_length=200)
    records: list[AttendanceRecordIn] = Field(min_length=1, max_length=500)


class AssessmentResultIn(BaseModel):
    learner_id: int
    assessment_id: int
    score: float = Field(ge=0)
    remarks: Optional[str] = Field(default=None, max_length=1000)


class PracticalEvaluationIn(BaseModel):
    status: Literal["Not Started", "In Progress", "Submitted", "Evaluated"]
    score: Optional[float] = Field(default=None, ge=0)
    rubric_scores: Optional[dict[str, float]] = None
    remarks: Optional[str] = Field(default=None, max_length=1000)


class ContentUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=3, max_length=200)
    description: Optional[str] = Field(default=None, max_length=4000)
    instructor: Optional[str] = Field(default=None, max_length=150)
    duration_minutes: Optional[float] = Field(default=None, ge=0, le=60)
    learning_objective: Optional[str] = Field(default=None, max_length=2000)
    is_deep_dive: Optional[bool] = None
    module_id: Optional[int] = None
    lesson_id: Optional[int] = None
    practical_id: Optional[int] = None
    exercise_id: Optional[int] = None
    assessment_id: Optional[int] = None
    resolution: Optional[str] = Field(default=None, max_length=20)
    aspect_ratio: Optional[str] = Field(default=None, max_length=10)
    frame_rate: Optional[str] = Field(default=None, max_length=10)
    file_format: Optional[str] = Field(default=None, max_length=10)
    codec: Optional[str] = Field(default=None, max_length=20)
    audio_sample_rate: Optional[str] = Field(default=None, max_length=20)
    ai_used: Optional[bool] = None
    ai_tool: Optional[str] = Field(default=None, max_length=150)
    ai_purpose: Optional[str] = Field(default=None, max_length=300)
    ai_human_reviewer: Optional[str] = Field(default=None, max_length=150)
    ai_disclosure_text: Optional[str] = Field(default=None, max_length=2000)


class ContentCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    course_id: int
    module_id: Optional[int] = None
    lesson_id: Optional[int] = None
    content_type: Literal["Video", "Resource"] = "Video"
    description: Optional[str] = Field(default=None, max_length=4000)
    instructor: Optional[str] = Field(default=None, max_length=150)
    duration_minutes: float = Field(default=10, ge=0, le=60)
    learning_objective: Optional[str] = Field(default=None, max_length=2000)


class QcUpdate(BaseModel):
    qc_original_content: Optional[bool] = None
    qc_human_review: Optional[bool] = None
    qc_srt: Optional[bool] = None
    qc_vtt: Optional[bool] = None
    qc_docx: Optional[bool] = None
    qc_pdf: Optional[bool] = None
    qc_audio: Optional[bool] = None
    qc_technical: Optional[bool] = None
    qc_ai_disclosure: Optional[bool] = None
    qc_needs_review: Optional[bool] = None
    qc_notes: Optional[str] = Field(default=None, max_length=2000)
    compliance: Optional[dict[str, bool]] = None


class ProductionStatusUpdate(BaseModel):
    production_status: str


class ModuleIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    duration_minutes: int = Field(default=60, ge=0, le=6000)


class LessonIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    objective: Optional[str] = Field(default=None, max_length=2000)


class CourseUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=3, max_length=200)
    description: Optional[str] = Field(default=None, max_length=4000)
    level: Optional[str] = Field(default=None, max_length=40)
    planned_hours: Optional[float] = Field(default=None, ge=0, le=1000)
    target_video_hours: Optional[float] = Field(default=None, ge=0, le=100)
    min_qualification: Optional[str] = Field(default=None, max_length=120)
    pass_percentage: Optional[float] = Field(default=None, ge=0, le=100)
    min_attendance: Optional[float] = Field(default=None, ge=0, le=100)


class PracticalIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    course_id: int
    module_id: Optional[int] = None
    scenario: Optional[str] = Field(default=None, max_length=4000)
    objective: Optional[str] = Field(default=None, max_length=2000)
    instructions: list[str] = Field(default_factory=list, max_length=30)
    tools: Optional[str] = Field(default=None, max_length=300)
    max_score: int = Field(default=100, ge=1, le=1000)
    rubric_id: Optional[int] = None


class ExerciseIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    course_id: int
    module_id: Optional[int] = None
    description: Optional[str] = Field(default=None, max_length=4000)
    exercise_type: str = Field(default="Hands-on", max_length=40)
    max_score: int = Field(default=10, ge=1, le=1000)


class RubricCriterion(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    max_score: int = Field(ge=1, le=1000)
    descriptor: Optional[str] = Field(default=None, max_length=500)


class RubricIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    course_id: Optional[int] = None
    description: Optional[str] = Field(default=None, max_length=2000)
    criteria: list[RubricCriterion] = Field(min_length=1, max_length=20)


class AssessmentIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    course_id: int
    module_id: Optional[int] = None
    assessment_type: Literal["Quiz", "Practical", "Assignment", "Final Assessment"]
    max_score: float = Field(default=100, gt=0, le=1000)
    pass_percentage: float = Field(default=50, ge=0, le=100)
    rubric_id: Optional[int] = None
    practical_id: Optional[int] = None


class NduLearnerRequest(BaseModel):
    learner_id: Optional[int] = None


class NduSimulateRequest(BaseModel):
    enrollment_id: Optional[int] = None
    learner_id: Optional[int] = None


class SettingUpdate(BaseModel):
    value: dict | list


class ImportConfirmRequest(BaseModel):
    rows: list[dict] = Field(min_length=1, max_length=1000)
    course_id: Optional[int] = None
    create_nominations: bool = True
    training_mode: TrainingMode = "Digital"
    submit: bool = False
