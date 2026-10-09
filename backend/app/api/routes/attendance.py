from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import bad_request, not_found, require_admin, require_admin_or_department
from app.models import Attendance, Batch, BatchEnrollment, CourseEnrollment, Learner, LearnerProgress, TrainingSession, User
from app.models.base import RoleCode
from app.repositories import serializers as ser
from app.repositories.scope import ensure_batch_access, scope_by_learner_column
from app.schemas.requests import AttendanceSaveRequest
from app.services import audit, progress
from app.services.notifications import notify_department, notify_learner
from app.services.settings_service import get_setting

router = APIRouter(prefix="/attendance", tags=["Attendance"])


def _roster(db: Session, user: User, batch_id: int) -> list[BatchEnrollment]:
    stmt = (select(BatchEnrollment).join(Learner, Learner.id == BatchEnrollment.learner_id)
            .where(BatchEnrollment.batch_id == batch_id, BatchEnrollment.status == "Onboarded")
            .order_by(Learner.full_name))
    if user.role_code == RoleCode.DEPARTMENT:
        stmt = stmt.where(Learner.department_id == user.department_id)
    return list(db.scalars(stmt).all())


@router.get("/sessions")
def list_sessions(batch_id: int, user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    b = db.get(Batch, batch_id)
    if not b:
        raise not_found("Batch")
    ensure_batch_access(db, user, b)
    out = []
    for s in db.scalars(select(TrainingSession).where(TrainingSession.batch_id == b.id)
                        .order_by(TrainingSession.session_date.desc(), TrainingSession.session_no)).all():
        out.append({"id": s.id, "date": ser.iso(s.session_date), "session_no": s.session_no, "title": s.title,
                    "attendance_marked": s.attendance_marked})
    return out


@router.get("/sheet")
def get_sheet(batch_id: int, session_date: date, session_no: int = 1,
              user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    b = db.get(Batch, batch_id)
    if not b:
        raise not_found("Batch")
    ensure_batch_access(db, user, b)
    session = db.scalar(select(TrainingSession).where(TrainingSession.batch_id == b.id,
                                                      TrainingSession.session_date == session_date,
                                                      TrainingSession.session_no == session_no))
    existing = {}
    if session:
        existing = {a.learner_id: a for a in db.scalars(select(Attendance).where(Attendance.session_id == session.id)).all()}
    rows = []
    for be in _roster(db, user, b.id):
        p = db.scalar(select(LearnerProgress).join(CourseEnrollment, CourseEnrollment.id == LearnerProgress.enrollment_id)
                      .where(CourseEnrollment.learner_id == be.learner_id, CourseEnrollment.batch_id == b.id))
        a = existing.get(be.learner_id)
        rows.append({"learner_id": be.learner_id, "learner": be.learner.full_name, "learner_code": be.learner.learner_code,
                     "department_code": be.learner.department.code, "status": a.status if a else None,
                     "remarks": a.remarks if a else None, "attendance_pct": p.attendance_pct if p else None})
    return {
        "batch": ser.batch(b),
        "session": {"id": session.id, "title": session.title, "attendance_marked": session.attendance_marked,
                    "date": ser.iso(session.session_date), "session_no": session.session_no} if session else None,
        "rows": rows,
        "can_edit": user.role_code == RoleCode.ADMIN,
    }


@router.post("/sheet")
def save_sheet(body: AttendanceSaveRequest, request: Request, user: User = Depends(require_admin),
               db: Session = Depends(get_db)):
    b = db.get(Batch, body.batch_id)
    if not b:
        raise not_found("Batch")
    if body.session_date < b.start_date or body.session_date > b.end_date:
        raise bad_request(f"Date must be within the batch schedule ({b.start_date} to {b.end_date})")
    if body.session_date > date.today():
        raise bad_request("Attendance cannot be recorded for a future date")
    roster_ids = {be.learner_id for be in _roster(db, user, b.id)}
    unknown = [r.learner_id for r in body.records if r.learner_id not in roster_ids]
    if unknown:
        raise bad_request("Some learners are not onboarded in this batch")

    session = db.scalar(select(TrainingSession).where(TrainingSession.batch_id == b.id,
                                                      TrainingSession.session_date == body.session_date,
                                                      TrainingSession.session_no == body.session_no))
    if session is None:
        session = TrainingSession(batch_id=b.id, session_date=body.session_date, session_no=body.session_no,
                                  title=body.title or f"Session {body.session_no}", mode=b.mode,
                                  start_time="10:00", end_time="13:00")
        db.add(session)
        db.flush()
    existing = {a.learner_id: a for a in db.scalars(select(Attendance).where(Attendance.session_id == session.id)).all()}
    counts: dict[str, int] = {}
    for r in body.records:
        a = existing.get(r.learner_id)
        if a is None:
            a = Attendance(session_id=session.id, batch_id=b.id, learner_id=r.learner_id, status=r.status)
            db.add(a)
        a.status, a.remarks, a.marked_by_id = r.status, r.remarks, user.id
        counts[r.status] = counts.get(r.status, 0) + 1
    session.attendance_marked = True
    db.flush()

    thresholds = get_setting(db, "risk_thresholds")
    warnings = 0
    for r in body.records:
        enr = db.scalar(select(CourseEnrollment).where(CourseEnrollment.learner_id == r.learner_id,
                                                       CourseEnrollment.batch_id == b.id))
        if not enr:
            continue
        if r.status in ("Present", "Late"):
            progress.touch_activity(db, r.learner_id, enr.course_id)
        prev = db.scalar(select(LearnerProgress.attendance_pct).where(LearnerProgress.enrollment_id == enr.id))
        p = progress.recompute(db, enr)
        if p.attendance_pct is not None and p.attendance_pct < thresholds["at_risk_attendance"] and (
                prev is None or prev >= thresholds["at_risk_attendance"] or r.status == "Absent"):
            warnings += 1
            notify_learner(db, r.learner_id, "Attendance warning",
                           f"Your attendance in {b.code} is {p.attendance_pct:.0f}% (minimum {thresholds['at_risk_attendance']}%).",
                           category="attendance", severity="warning", link="/learner/attendance")
            notify_department(db, enr.learner.department_id, "Attendance warning",
                              f"{enr.learner.full_name} ({b.code}) attendance is {p.attendance_pct:.0f}%.",
                              category="attendance", severity="warning", link=f"/department/learners/{r.learner_id}")
    audit.record(db, user, "ATTENDANCE_SAVED", "Batch", b.code,
                 details=f"{body.session_date} session {body.session_no}: " + ", ".join(f"{k} {v}" for k, v in counts.items()),
                 request=request)
    db.commit()
    rate = db.execute(select(Attendance.status, func.count(Attendance.id)).where(Attendance.batch_id == b.id)
                      .group_by(Attendance.status)).all()
    rc = dict(rate)
    att = rc.get("Present", 0) + rc.get("Late", 0)
    marked = att + rc.get("Absent", 0)
    return {"saved": len(body.records), "counts": counts, "session_id": session.id, "warnings": warnings,
            "batch_attendance_rate": round(100 * att / marked, 1) if marked else None}


@router.get("/summary")
def attendance_summary(batch_id: int | None = None, user: User = Depends(require_admin_or_department),
                       db: Session = Depends(get_db)):
    stmt = select(LearnerProgress, CourseEnrollment).join(CourseEnrollment, CourseEnrollment.id == LearnerProgress.enrollment_id)
    stmt = scope_by_learner_column(stmt, user, LearnerProgress.learner_id)
    stmt = stmt.where(CourseEnrollment.batch_id.is_not(None))
    if batch_id:
        stmt = stmt.where(CourseEnrollment.batch_id == batch_id)
    out = []
    for p, e in db.execute(stmt).all():
        if p.sessions_marked == 0:
            continue
        out.append({"learner_id": p.learner_id, "learner": p.learner.full_name, "learner_code": p.learner.learner_code,
                    "department_code": p.learner.department.code, "batch": e.batch.code, "course": p.course.short_title,
                    "sessions_attended": p.sessions_attended, "sessions_marked": p.sessions_marked,
                    "attendance_pct": p.attendance_pct})
    return sorted(out, key=lambda r: (r["attendance_pct"] if r["attendance_pct"] is not None else 101))
