"""Configurable demo eligibility engine.

Demo Eligibility Rules — final rules to be configured according to official
programme requirements.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CompletionRecord, CourseEnrollment, Course, Department, Learner, Nomination
from app.models.base import CompletionStatus, EligibilityResult, NominationStatus
from app.services.settings_service import QUALIFICATION_LEVELS, get_setting, qualification_rank

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
ID_RE = re.compile(r"^[A-Z0-9][A-Z0-9-]{3,29}$")

INACTIVE_NOMINATION_STATUSES = (NominationStatus.REJECTED, NominationStatus.INELIGIBLE, NominationStatus.DRAFT)


@dataclass
class RuleOutcome:
    code: str
    rule: str
    outcome: str  # PASS / WARN / FAIL
    message: str

    def as_dict(self) -> dict:
        return {"code": self.code, "rule": self.rule, "outcome": self.outcome, "message": self.message}


def evaluate(
    db: Session,
    learner: Learner,
    course: Course,
    department: Department | None,
    exclude_nomination_id: int | None = None,
) -> tuple[str, list[dict]]:
    rules_cfg = get_setting(db, "eligibility_rules")
    outcomes: list[RuleOutcome] = []

    def add(cfg: dict, passed: bool, ok_msg: str, fail_msg: str) -> None:
        outcome = "PASS" if passed else cfg.get("severity", "FAIL")
        outcomes.append(RuleOutcome(cfg["code"], cfg["label"], outcome, ok_msg if passed else fail_msg))

    for cfg in rules_cfg:
        if not cfg.get("enabled", True):
            continue
        code = cfg["code"]
        if code == "VALID_ID":
            emp = (learner.employee_id or "").strip().upper()
            add(cfg, bool(ID_RE.match(emp)), f"Employee ID {emp} is valid",
                f"Employee ID '{learner.employee_id or ''}' is missing or malformed")
        elif code == "VALID_DEPARTMENT":
            ok = department is not None and department.is_active
            add(cfg, ok, f"{department.name if department else ''} is an active registered department",
                "Nominating department is not registered or inactive")
        elif code == "VALID_EMAIL":
            ok = bool(learner.email and EMAIL_RE.match(learner.email))
            add(cfg, ok, f"{learner.email} is a valid email address", f"Email '{learner.email or ''}' is invalid")
        elif code == "DESIGNATION":
            ok = bool(learner.designation and learner.designation.strip())
            add(cfg, ok, f"Designation: {learner.designation}", "Designation not provided — manual review required")
        elif code == "QUALIFICATION":
            required = course.min_qualification
            have = qualification_rank(learner.qualification)
            need = qualification_rank(required)
            if not learner.qualification:
                outcomes.append(RuleOutcome(code, cfg["label"], "WARN", "Qualification not provided — manual review required"))
            else:
                add(cfg, have >= need,
                    f"Qualification '{learner.qualification}' meets minimum '{required}'",
                    f"Qualification '{learner.qualification}' is below the minimum '{required}' for {course.short_title}")
        elif code == "PREREQUISITE":
            if not course.prerequisite_course_id:
                add(cfg, True, "No prerequisite course required", "")
            else:
                prereq = db.get(Course, course.prerequisite_course_id)
                completed = db.scalar(
                    select(CompletionRecord.id).where(
                        CompletionRecord.learner_id == learner.id,
                        CompletionRecord.course_id == course.prerequisite_course_id,
                        CompletionRecord.status == CompletionStatus.COMPLETED,
                    )
                )
                technical = qualification_rank(learner.qualification) >= QUALIFICATION_LEVELS.index("Graduate (Engineering/IT)")
                if completed:
                    add(cfg, True, f"Prerequisite '{prereq.short_title}' completed", "")
                elif technical:
                    add(cfg, True, f"Prerequisite '{prereq.short_title}' satisfied by equivalent technical qualification", "")
                else:
                    add(cfg, False, "",
                        f"Prerequisite '{prereq.short_title}' not completed and no equivalent technical qualification")
        elif code == "DUPLICATE":
            stmt = select(Nomination.nomination_no).where(
                Nomination.learner_id == learner.id,
                Nomination.course_id == course.id,
                Nomination.status.not_in(INACTIVE_NOMINATION_STATUSES),
            )
            if exclude_nomination_id:
                stmt = stmt.where(Nomination.id != exclude_nomination_id)
            dup = db.scalar(stmt)
            enrolled = db.scalar(
                select(CourseEnrollment.id).where(
                    CourseEnrollment.learner_id == learner.id, CourseEnrollment.course_id == course.id
                )
            )
            if dup:
                add(cfg, False, "", f"Duplicate: active nomination {dup} already exists for this course")
            elif enrolled:
                add(cfg, False, "", "Duplicate: learner is already enrolled in this course")
            else:
                add(cfg, True, "No duplicate nomination or enrolment found", "")

    if any(o.outcome == "FAIL" for o in outcomes):
        result = EligibilityResult.NOT_ELIGIBLE
    elif any(o.outcome == "WARN" for o in outcomes):
        result = EligibilityResult.REVIEW
    else:
        result = EligibilityResult.ELIGIBLE
    return result, [o.as_dict() for o in outcomes]
