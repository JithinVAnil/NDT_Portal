from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import bad_request, not_found, require_admin, require_admin_or_department
from app.models import Attendance, Batch, BatchEnrollment, Course, CourseEnrollment, Learner, LearnerProgress, TrainingSession, User
from app.models.base import RoleCode
from app.repositories import serializers as ser
from app.repositories.scope import ensure_batch_access, scope_batches
from app.schemas.requests import BatchIn, SessionIn
from app.services import audit

router = APIRouter(prefix="/batches", tags=["Batches"])


def _count(db: Session, batch_id: int, dept_id: int | None = None) -> int:
    stmt = select(func.count(BatchEnrollment.id)).where(BatchEnrollment.batch_id == batch_id,
                                                        BatchEnrollment.status != "Withdrawn")
    if dept_id:
        stmt = stmt.join(Learner, Learner.id == BatchEnrollment.learner_id).where(Learner.department_id == dept_id)
    return db.scalar(stmt) or 0


@router.get("")
def list_batches(course_id: int | None = None, status: str | None = None,
                 user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    stmt = scope_batches(select(Batch), user).order_by(Batch.start_date.desc())
    if course_id:
        stmt = stmt.where(Batch.course_id == course_id)
    if status:
        stmt = stmt.where(Batch.status == status)
    dept = user.department_id if user.role_code == RoleCode.DEPARTMENT else None
    out = []
    for b in db.scalars(stmt).all():
        d = ser.batch(b, _count(db, b.id))
        if dept:
            d["department_learners"] = _count(db, b.id, dept)
        out.append(d)
    return out


@router.get("/{batch_id}")
def get_batch(batch_id: int, user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    b = db.get(Batch, batch_id)
    if not b:
        raise not_found("Batch")
    ensure_batch_access(db, user, b)
    roster_stmt = select(BatchEnrollment).where(BatchEnrollment.batch_id == b.id)
    if user.role_code == RoleCode.DEPARTMENT:
        roster_stmt = roster_stmt.join(Learner, Learner.id == BatchEnrollment.learner_id).where(
            Learner.department_id == user.department_id)
    roster = []
    for be in db.scalars(roster_stmt).all():
        p = db.scalar(select(LearnerProgress).join(CourseEnrollment, CourseEnrollment.id == LearnerProgress.enrollment_id)
                      .where(CourseEnrollment.learner_id == be.learner_id, CourseEnrollment.batch_id == b.id))
        roster.append({
            "learner_id": be.learner_id, "learner": be.learner.full_name, "learner_code": be.learner.learner_code,
            "department_code": be.learner.department.code, "designation": be.learner.designation,
            "status": be.status, "onboarded_at": ser.iso(be.onboarded_at),
            "progress": p.overall_pct if p else None, "attendance": p.attendance_pct if p else None,
            "average_score": p.average_score if p else None, "risk_level": p.risk_level if p else None,
        })
    sessions = []
    for s in db.scalars(select(TrainingSession).where(TrainingSession.batch_id == b.id)
                        .order_by(TrainingSession.session_date, TrainingSession.session_no)).all():
        counts = dict(db.execute(select(Attendance.status, func.count(Attendance.id))
                                 .where(Attendance.session_id == s.id).group_by(Attendance.status)).all())
        sessions.append({"id": s.id, "date": ser.iso(s.session_date), "session_no": s.session_no, "title": s.title,
                         "start_time": s.start_time, "end_time": s.end_time, "attendance_marked": s.attendance_marked,
                         "counts": counts})
    data = ser.batch(b, _count(db, b.id))
    data["roster"] = roster
    data["sessions"] = sessions
    return data


def _validate(db: Session, body: BatchIn) -> None:
    if not db.get(Course, body.course_id):
        raise bad_request("Course not found")


@router.post("")
def create_batch(body: BatchIn, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    _validate(db, body)
    if db.scalar(select(Batch.id).where(Batch.code == body.code)):
        raise bad_request(f"Batch ID {body.code} already exists")
    b = Batch(**body.model_dump())
    db.add(b)
    db.flush()
    audit.record(db, user, "BATCH_CREATED", "Batch", b.code, details=b.name, request=request)
    db.commit()
    return ser.batch(b, 0)


@router.put("/{batch_id}")
def update_batch(batch_id: int, body: BatchIn, request: Request, user: User = Depends(require_admin),
                 db: Session = Depends(get_db)):
    b = db.get(Batch, batch_id)
    if not b:
        raise not_found("Batch")
    _validate(db, body)
    if db.scalar(select(Batch.id).where(Batch.code == body.code, Batch.id != b.id)):
        raise bad_request(f"Batch ID {body.code} already exists")
    enrolled = _count(db, b.id)
    if body.capacity < enrolled:
        raise bad_request(f"Capacity cannot be below current enrolment ({enrolled})")
    if body.course_id != b.course_id and enrolled:
        raise bad_request("Cannot change the course of a batch that has enrolled learners")
    for k, v in body.model_dump().items():
        setattr(b, k, v)
    audit.record(db, user, "BATCH_UPDATED", "Batch", b.code, request=request)
    db.commit()
    return ser.batch(b, enrolled)


@router.post("/{batch_id}/sessions")
def add_session(batch_id: int, body: SessionIn, request: Request, user: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    b = db.get(Batch, batch_id)
    if not b:
        raise not_found("Batch")
    if db.scalar(select(TrainingSession.id).where(TrainingSession.batch_id == b.id,
                                                  TrainingSession.session_date == body.session_date,
                                                  TrainingSession.session_no == body.session_no)):
        raise bad_request("A session already exists for this date and slot")
    s = TrainingSession(batch_id=b.id, mode=b.mode, **body.model_dump())
    db.add(s)
    db.flush()
    audit.record(db, user, "SESSION_CREATED", "Batch", b.code, details=f"{s.session_date} #{s.session_no}", request=request)
    db.commit()
    return {"id": s.id}
