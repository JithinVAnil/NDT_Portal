"""Progress monitoring, at-risk identification and completion tracking."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import bad_request, not_found, require_admin, require_admin_or_department
from app.models import CompletionRecord, CourseEnrollment, LearnerProgress, User
from app.models.base import CompletionStatus, utcnow
from app.repositories import serializers as ser
from app.repositories.scope import scope_by_learner_column
from app.services import audit, progress
from app.services.notifications import notify_department, notify_learner
from app.services.settings_service import get_setting

router = APIRouter(tags=["Progress & Completion"])


@router.get("/progress")
def list_progress(course_id: int | None = None, batch_id: int | None = None, risk_level: str | None = None,
                  user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    stmt = (select(LearnerProgress, CourseEnrollment)
            .join(CourseEnrollment, CourseEnrollment.id == LearnerProgress.enrollment_id)
            .where(CourseEnrollment.status.in_(("Onboarded", "Completed", "Not Completed"))))
    stmt = scope_by_learner_column(stmt, user, LearnerProgress.learner_id)
    if course_id:
        stmt = stmt.where(LearnerProgress.course_id == course_id)
    if batch_id:
        stmt = stmt.where(CourseEnrollment.batch_id == batch_id)
    if risk_level:
        stmt = stmt.where(LearnerProgress.risk_level.in_(risk_level.split(",")))
    out = []
    for p, e in db.execute(stmt).all():
        d = ser.progress(p, e.batch.code if e.batch else None)
        c = db.scalar(select(CompletionRecord).where(CompletionRecord.enrollment_id == e.id))
        d["completion_status"] = c.status if c else None
        out.append(d)
    return sorted(out, key=lambda r: ({"CRITICAL": 0, "AT_RISK": 1, "ON_TRACK": 2}.get(r["risk_level"], 3), r["overall_pct"]))


@router.get("/progress/rules")
def risk_rules(user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    return {"risk": get_setting(db, "risk_thresholds"), "completion": get_setting(db, "completion_rules"),
            "weights": progress.WEIGHTS,
            "note": "Prototype / demo rules — final rules to be configured according to official programme requirements."}


@router.post("/progress/recompute")
def recompute_all(request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    n = progress.recompute_all(db)
    audit.record(db, user, "PROGRESS_RECOMPUTED", "LearnerProgress", None, details=f"{n} enrolments", request=request)
    db.commit()
    return {"recomputed": n}


@router.get("/completion")
def list_completion(status: str | None = None, course_id: int | None = None,
                    user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    stmt = (select(CompletionRecord, CourseEnrollment)
            .join(CourseEnrollment, CourseEnrollment.id == CompletionRecord.enrollment_id)
            .where(CourseEnrollment.status.in_(("Onboarded", "Completed", "Not Completed"))))
    stmt = scope_by_learner_column(stmt, user, CompletionRecord.learner_id)
    if status:
        stmt = stmt.where(CompletionRecord.status == status)
    if course_id:
        stmt = stmt.where(CompletionRecord.course_id == course_id)
    out = []
    for c, e in db.execute(stmt).all():
        out.append({
            "id": c.id, "enrollment_id": e.id, "learner_id": c.learner_id, "learner": c.learner.full_name,
            "learner_code": c.learner.learner_code, "department_code": c.learner.department.code,
            "course": c.course.title, "course_code": c.course.code, "batch": e.batch.code if e.batch else None,
            "status": c.status, "criteria": c.criteria, "certificate_no": c.certificate_no,
            "completed_at": ser.iso(c.completed_at), "evaluated_at": ser.iso(c.evaluated_at),
        })
    order = {CompletionStatus.ELIGIBLE: 0, CompletionStatus.IN_PROGRESS: 1, CompletionStatus.NOT_COMPLETED: 2,
             CompletionStatus.COMPLETED: 3}
    return sorted(out, key=lambda r: (order.get(r["status"], 9), r["learner"]))


@router.post("/completion/{enrollment_id}/evaluate")
def evaluate(enrollment_id: int, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    enr = db.get(CourseEnrollment, enrollment_id)
    if not enr:
        raise not_found("Enrolment")
    p = progress.recompute(db, enr)
    c = db.scalar(select(CompletionRecord).where(CompletionRecord.enrollment_id == enr.id))
    audit.record(db, user, "COMPLETION_EVALUATED", "Enrolment", enr.id,
                 details=f"{enr.learner.full_name} — {enr.course.short_title}: {c.status}", request=request)
    db.commit()
    return {"status": c.status, "criteria": c.criteria, "progress": ser.progress(p)}


@router.post("/completion/{enrollment_id}/complete")
def mark_completed(enrollment_id: int, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    enr = db.get(CourseEnrollment, enrollment_id)
    if not enr:
        raise not_found("Enrolment")
    progress.recompute(db, enr)
    c = db.scalar(select(CompletionRecord).where(CompletionRecord.enrollment_id == enr.id))
    if c.status == CompletionStatus.COMPLETED:
        raise bad_request("Already marked as completed")
    if c.status != CompletionStatus.ELIGIBLE:
        unmet = [x["label"] for x in c.criteria if not x["met"]]
        raise bad_request("Completion criteria not met: " + "; ".join(unmet))
    c.status = CompletionStatus.COMPLETED
    c.completed_at = utcnow()
    c.completed_by_id = user.id
    c.certificate_no = f"DEMO-CERT-{enr.course.code}-{enr.learner.learner_code[-4:]}-{enr.id:04d}"
    enr.status = "Completed"
    p = progress.recompute(db, enr)
    audit.record(db, user, "COURSE_COMPLETED", "Enrolment", enr.id,
                 details=f"{enr.learner.full_name} completed {enr.course.title}; {c.certificate_no}", request=request)
    notify_learner(db, enr.learner_id, "Course completed",
                   f"Congratulations! You have completed {enr.course.title}. Reference {c.certificate_no} (demo).",
                   category="completion", severity="success", link="/learner/completion")
    notify_department(db, enr.learner.department_id, "Course completed",
                      f"{enr.learner.full_name} completed {enr.course.short_title}.", category="completion",
                      severity="success", link=f"/department/learners/{enr.learner_id}")
    db.commit()
    return {"status": c.status, "certificate_no": c.certificate_no, "progress": ser.progress(p)}
