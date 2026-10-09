"""Report catalogue. Each report builds role-scoped rows from live database data."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AssessmentResult,
    Attendance,
    AuditLog,
    Batch,
    BatchEnrollment,
    CompletionRecord,
    ContentItem,
    Course,
    CourseEnrollment,
    Department,
    Learner,
    LearnerProgress,
    Nomination,
    NduSyncLog,
    TrainingSession,
    User,
)
from app.models.base import RoleCode
from app.repositories import serializers as ser
from app.repositories.scope import scope_batches, scope_by_learner_column, scope_learners, scope_nominations
from app.services import dashboard as dash
from app.services.content_service import production_summary


@dataclass
class Report:
    key: str
    title: str
    description: str
    columns: list[tuple[str, str]]
    builder: Callable[[Session, User, dict], list[dict]]
    roles: tuple[str, ...] = (RoleCode.ADMIN, RoleCode.DEPARTMENT)
    filters: list[str] = field(default_factory=list)


def _f(filters: dict, key: str) -> int | None:
    v = filters.get(key)
    try:
        return int(v) if v not in (None, "", "all") else None
    except (TypeError, ValueError):
        return None


def _pct(v):
    return None if v is None else round(v, 1)


# ---------------- Builders ----------------
def programme_summary(db: Session, user: User, f: dict) -> list[dict]:
    dept = user.department_id if user.role_code == RoleCode.DEPARTMENT else _f(f, "department_id")
    k = dash.kpis(db, dept)
    rows = [
        ("Departments (active)", k["departments"] if not dept else 1),
        ("Learners", k["learners"]),
        ("Total nominations", k["total_nominations"]),
        ("Pending nominations", k["pending_nominations"]),
        ("Approved / allocated / onboarded nominations", k["approved_nominations"]),
        ("Active batches", k["active_batches"]),
        ("Course enrolments", k["enrolments"]),
        ("Active learners (training started)", k["active_learners"]),
        ("Attendance rate (%)", k["attendance_rate"]),
        ("Average progress (%)", k["average_progress"]),
        ("Average assessment score (%)", k["average_score"]),
        ("Completed", k["completed"]),
        ("Completion rate (%)", k["completion_rate"]),
        ("Eligible for completion", k["eligible_for_completion"]),
        ("At-risk learners", k["at_risk_learners"]),
        ("Critical learners", k["critical_learners"]),
    ]
    if not dept:
        c = production_summary(db)
        rows += [
            ("Instructional video records", c["total_videos"]),
            ("Video content produced (hours)", f'{c["total_hours"]:.2f} / {c["target_hours"]}'),
            ("Videos QC-ready", c["videos_ready"]),
        ]
    return [{"metric": m, "value": v if v is not None else "—"} for m, v in rows]


def learner_report(db: Session, user: User, f: dict) -> list[dict]:
    stmt = scope_learners(select(Learner), user).order_by(Learner.learner_code)
    if _f(f, "department_id"):
        stmt = stmt.where(Learner.department_id == _f(f, "department_id"))
    rows = []
    progress = {}
    for p, e in db.execute(select(LearnerProgress, CourseEnrollment).join(
            CourseEnrollment, CourseEnrollment.id == LearnerProgress.enrollment_id)).all():
        progress.setdefault(p.learner_id, (p, e))
    for l in db.scalars(stmt).all():
        p, e = progress.get(l.id, (None, None))
        if _f(f, "course_id") and (not p or p.course_id != _f(f, "course_id")):
            continue
        rows.append({
            "learner_code": l.learner_code, "employee_id": l.employee_id, "name": l.full_name, "email": l.email,
            "designation": l.designation, "department": l.department.code, "location": l.location,
            "status": l.status, "course": p.course.short_title if p else "", "batch": e.batch.code if e and e.batch else "",
            "progress": _pct(p.overall_pct) if p else None,
        })
    return rows


def nomination_report(db: Session, user: User, f: dict) -> list[dict]:
    stmt = scope_nominations(select(Nomination), user).order_by(Nomination.nomination_no)
    if _f(f, "course_id"):
        stmt = stmt.where(Nomination.course_id == _f(f, "course_id"))
    if _f(f, "department_id"):
        stmt = stmt.where(Nomination.department_id == _f(f, "department_id"))
    if f.get("status"):
        stmt = stmt.where(Nomination.status == f["status"])
    return [{
        "nomination_no": n.nomination_no, "learner": n.learner.full_name, "learner_code": n.learner.learner_code,
        "department": n.department.code, "course": n.course.short_title, "mode": n.training_mode, "status": n.status,
        "eligibility": (n.eligibility_result or "").replace("_", " ").title(), "batch": n.allocated_batch.code if n.allocated_batch else "",
        "submitted": (ser.iso(n.submitted_at) or "")[:10], "remarks": n.decision_remarks or "",
    } for n in db.scalars(stmt).all()]


def department_report(db: Session, user: User, f: dict) -> list[dict]:
    stmt = select(Department).order_by(Department.code)
    if user.role_code == RoleCode.DEPARTMENT:
        stmt = stmt.where(Department.id == user.department_id)
    rows = []
    for d in db.scalars(stmt).all():
        k = dash.kpis(db, d.id)
        rows.append({
            "code": d.code, "department": d.name, "learners": k["learners"], "nominations": k["total_nominations"],
            "pending": k["pending_nominations"], "approved": k["approved_nominations"], "enrolments": k["enrolments"],
            "attendance": k["attendance_rate"], "progress": k["average_progress"], "score": k["average_score"],
            "completed": k["completed"], "at_risk": k["at_risk_learners"],
        })
    return rows


def course_report(db: Session, user: User, f: dict) -> list[dict]:
    dept = user.department_id if user.role_code == RoleCode.DEPARTMENT else _f(f, "department_id")
    return [{
        "code": c["code"], "course": c["title"], "level": c["level"], "learners": c["learners"], "active": c["active"],
        "completed": c["completed"], "completion_pct": c["completion_pct"], "average_score": c["average_score"],
        "videos": c["video_count"], "video_minutes": c["video_minutes"], "practicals": c["practical_count"],
    } for c in dash.course_cards(db, dept)]


def batch_report(db: Session, user: User, f: dict) -> list[dict]:
    stmt = scope_batches(select(Batch), user).order_by(Batch.start_date)
    if _f(f, "course_id"):
        stmt = stmt.where(Batch.course_id == _f(f, "course_id"))
    if f.get("status"):
        stmt = stmt.where(Batch.status == f["status"])
    rows = []
    for b in db.scalars(stmt).all():
        enr_stmt = select(func.count(BatchEnrollment.id)).where(BatchEnrollment.batch_id == b.id)
        if user.role_code == RoleCode.DEPARTMENT:
            enr_stmt = enr_stmt.join(Learner, Learner.id == BatchEnrollment.learner_id).where(
                Learner.department_id == user.department_id)
        enrolled = db.scalar(enr_stmt) or 0
        sessions = db.scalar(select(func.count(TrainingSession.id)).where(TrainingSession.batch_id == b.id)) or 0
        rows.append({
            "batch_id": b.code, "name": b.name, "course": b.course.short_title, "mode": b.mode, "location": b.location,
            "start": ser.iso(b.start_date), "end": ser.iso(b.end_date), "capacity": b.capacity, "enrolled": enrolled,
            "sessions": sessions, "instructor": b.instructor, "status": b.status,
        })
    return rows


def attendance_report(db: Session, user: User, f: dict) -> list[dict]:
    stmt = (select(LearnerProgress, CourseEnrollment).join(CourseEnrollment, CourseEnrollment.id == LearnerProgress.enrollment_id)
            .where(CourseEnrollment.batch_id.is_not(None)))
    stmt = scope_by_learner_column(stmt, user, LearnerProgress.learner_id)
    if _f(f, "batch_id"):
        stmt = stmt.where(CourseEnrollment.batch_id == _f(f, "batch_id"))
    if _f(f, "course_id"):
        stmt = stmt.where(CourseEnrollment.course_id == _f(f, "course_id"))
    rows = []
    for p, e in db.execute(stmt).all():
        counts = dict(db.execute(select(Attendance.status, func.count(Attendance.id)).where(
            Attendance.learner_id == p.learner_id, Attendance.batch_id == e.batch_id).group_by(Attendance.status)).all())
        if not counts:
            continue
        rows.append({
            "learner_code": p.learner.learner_code, "learner": p.learner.full_name, "department": p.learner.department.code,
            "batch": e.batch.code, "present": counts.get("Present", 0), "late": counts.get("Late", 0),
            "absent": counts.get("Absent", 0), "excused": counts.get("Excused", 0), "attendance_pct": _pct(p.attendance_pct),
        })
    return sorted(rows, key=lambda r: r["attendance_pct"] if r["attendance_pct"] is not None else 101)


def assessment_report(db: Session, user: User, f: dict) -> list[dict]:
    stmt = scope_by_learner_column(select(AssessmentResult), user, AssessmentResult.learner_id)
    if _f(f, "course_id"):
        stmt = stmt.where(AssessmentResult.course_id == _f(f, "course_id"))
    return [{
        "learner_code": r.learner.learner_code, "learner": r.learner.full_name, "department": r.learner.department.code,
        "course": r.assessment.course.short_title, "module": r.assessment.module.title if r.assessment.module else "Course-level",
        "assessment": r.assessment.title, "type": r.assessment.assessment_type, "score": f"{r.score:g} / {r.max_score:g}",
        "percentage": _pct(r.percentage), "result": "Pass" if r.passed else "Fail", "evaluator": r.evaluator_name,
        "remarks": r.remarks or "", "date": (ser.iso(r.evaluated_at) or "")[:10],
    } for r in db.scalars(stmt.order_by(AssessmentResult.evaluated_at.desc())).all()]


def _progress_rows(db: Session, user: User, f: dict, risk_only: bool = False) -> list[dict]:
    stmt = (select(LearnerProgress, CourseEnrollment).join(CourseEnrollment, CourseEnrollment.id == LearnerProgress.enrollment_id)
            .where(CourseEnrollment.status.in_(("Onboarded", "Completed", "Not Completed"))))
    stmt = scope_by_learner_column(stmt, user, LearnerProgress.learner_id)
    if _f(f, "course_id"):
        stmt = stmt.where(LearnerProgress.course_id == _f(f, "course_id"))
    if _f(f, "batch_id"):
        stmt = stmt.where(CourseEnrollment.batch_id == _f(f, "batch_id"))
    if risk_only:
        stmt = stmt.where(LearnerProgress.risk_level.in_(("AT_RISK", "CRITICAL")))
    rows = []
    for p, e in db.execute(stmt).all():
        rows.append({
            "learner_code": p.learner.learner_code, "learner": p.learner.full_name, "department": p.learner.department.code,
            "course": p.course.short_title, "batch": e.batch.code if e.batch else "", "progress": _pct(p.overall_pct),
            "modules": f"{p.modules_completed}/{p.modules_total}", "videos": f"{p.content_completed}/{p.content_total}",
            "practicals": f"{p.practicals_completed}/{p.practicals_total}",
            "assessments": f"{p.assessments_passed}/{p.assessments_total}", "attendance": _pct(p.attendance_pct),
            "average_score": _pct(p.average_score), "risk": p.risk_level.replace("_", " ").title(),
            "reasons": "; ".join(p.risk_reasons or []), "last_activity": (ser.iso(p.last_activity_at) or "")[:10],
        })
    return sorted(rows, key=lambda r: r["progress"])


def progress_report(db, user, f):
    return _progress_rows(db, user, f)


def at_risk_report(db, user, f):
    rows = _progress_rows(db, user, f, risk_only=True)
    return sorted(rows, key=lambda r: (0 if r["risk"] == "Critical" else 1, r["progress"]))


def completion_report(db: Session, user: User, f: dict) -> list[dict]:
    stmt = (select(CompletionRecord, CourseEnrollment).join(CourseEnrollment, CourseEnrollment.id == CompletionRecord.enrollment_id)
            .where(CourseEnrollment.status.in_(("Onboarded", "Completed", "Not Completed"))))
    stmt = scope_by_learner_column(stmt, user, CompletionRecord.learner_id)
    if _f(f, "course_id"):
        stmt = stmt.where(CompletionRecord.course_id == _f(f, "course_id"))
    if f.get("status"):
        stmt = stmt.where(CompletionRecord.status == f["status"])
    rows = []
    for c, e in db.execute(stmt).all():
        crit = {x["code"]: x for x in (c.criteria or [])}

        def mark(code):
            x = crit.get(code)
            return ("✓ " if x and x["met"] else "✕ ") + (x["detail"] if x else "")
        rows.append({
            "learner_code": c.learner.learner_code, "learner": c.learner.full_name, "department": c.learner.department.code,
            "course": c.course.short_title, "batch": e.batch.code if e.batch else "", "status": c.status,
            "modules": mark("MODULES"), "assessments": mark("ASSESSMENTS"), "practicals": mark("PRACTICALS"),
            "attendance": mark("ATTENDANCE"), "reference": c.certificate_no or "", "completed_on": (ser.iso(c.completed_at) or "")[:10],
        })
    return rows


def content_report(db: Session, user: User, f: dict) -> list[dict]:
    stmt = select(ContentItem).order_by(ContentItem.code)
    if _f(f, "course_id"):
        stmt = stmt.where(ContentItem.course_id == _f(f, "course_id"))
    rows = []
    for c in db.scalars(stmt).all():
        s = ser.content(c)
        rows.append({
            "code": c.code, "type": c.content_type, "title": c.title, "course": c.course.short_title,
            "module": c.module.title if c.module else "", "instructor": c.instructor or "",
            "minutes": c.duration_minutes, "production": c.production_status, "qc_status": s["overall_status"],
            "captions": "✓" if c.qc_srt and c.qc_vtt else "Pending", "transcripts": "✓" if c.qc_docx and c.qc_pdf else "Pending",
            "ai_disclosure": ("AI used: " + (c.ai_tool or "")) if c.ai_used else "No AI used",
            "video_file": "Uploaded" if c.video_file else "To be inserted",
        })
    return rows


def ndu_report(db: Session, user: User, f: dict) -> list[dict]:
    return [{
        "timestamp": (ser.iso(s.created_at) or "").replace("T", " ")[:19], "type": s.sync_type, "direction": s.direction,
        "learner": s.learner.full_name if s.learner else "All", "course": s.course.short_title if s.course else "All",
        "field": s.field or "", "old": s.old_value or "", "new": s.new_value or "", "result": s.result,
        "records": s.records_processed, "message": s.message or "", "by": s.triggered_by_name or "",
    } for s in db.scalars(select(NduSyncLog).order_by(NduSyncLog.created_at.desc()).limit(1000)).all()]


def audit_report(db: Session, user: User, f: dict) -> list[dict]:
    return [{
        "timestamp": (ser.iso(a.created_at) or "").replace("T", " ")[:19], "user": a.user_name or a.user_email or "System",
        "role": a.role or "", "action": a.action, "entity": a.entity or "", "entity_id": a.entity_id or "",
        "result": a.result, "details": a.details or "",
    } for a in db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(2000)).all()]


ADMIN = (RoleCode.ADMIN,)
BOTH = (RoleCode.ADMIN, RoleCode.DEPARTMENT)

REPORTS: dict[str, Report] = {r.key: r for r in [
    Report("programme-summary", "Programme Summary", "Headline programme KPIs computed from live data.",
           [("metric", "Metric"), ("value", "Value")], programme_summary, BOTH, ["department_id"]),
    Report("learners", "Learner Report", "All learners with department, status and current course progress.",
           [("learner_code", "Learner ID"), ("employee_id", "Employee ID"), ("name", "Name"), ("email", "Email"),
            ("designation", "Designation"), ("department", "Dept"), ("location", "Location"), ("status", "Status"),
            ("course", "Course"), ("batch", "Batch"), ("progress", "Progress %")], learner_report, BOTH,
           ["department_id", "course_id"]),
    Report("nominations", "Nomination Report", "Nominations with eligibility outcome and workflow status.",
           [("nomination_no", "Nomination"), ("learner", "Learner"), ("learner_code", "Learner ID"),
            ("department", "Dept"), ("course", "Course"), ("mode", "Mode"), ("status", "Status"),
            ("eligibility", "Eligibility"), ("batch", "Batch"), ("submitted", "Submitted"), ("remarks", "Remarks")],
           nomination_report, BOTH, ["department_id", "course_id", "status"]),
    Report("departments", "Department Report", "Department-level participation and performance.",
           [("code", "Code"), ("department", "Department"), ("learners", "Learners"), ("nominations", "Nominations"),
            ("pending", "Pending"), ("approved", "Approved"), ("enrolments", "Enrolments"), ("attendance", "Attendance %"),
            ("progress", "Avg Progress %"), ("score", "Avg Score %"), ("completed", "Completed"), ("at_risk", "At Risk")],
           department_report, BOTH),
    Report("courses", "Course Report", "Enrolment, completion, scores and content per course.",
           [("code", "Code"), ("course", "Course"), ("level", "Level"), ("learners", "Enrolled"), ("active", "Active"),
            ("completed", "Completed"), ("completion_pct", "Completion %"), ("average_score", "Avg Score %"),
            ("videos", "Videos"), ("video_minutes", "Video Min"), ("practicals", "Practicals")], course_report, BOTH),
    Report("batches", "Batch Report", "Batch schedule, capacity and enrolment.",
           [("batch_id", "Batch ID"), ("name", "Name"), ("course", "Course"), ("mode", "Mode"), ("location", "Location"),
            ("start", "Start"), ("end", "End"), ("capacity", "Capacity"), ("enrolled", "Enrolled"),
            ("sessions", "Sessions"), ("instructor", "Instructor"), ("status", "Status")], batch_report, BOTH,
           ["course_id", "status"]),
    Report("attendance", "Attendance Report", "Session attendance per learner and batch.",
           [("learner_code", "Learner ID"), ("learner", "Learner"), ("department", "Dept"), ("batch", "Batch"),
            ("present", "Present"), ("late", "Late"), ("absent", "Absent"), ("excused", "Excused"),
            ("attendance_pct", "Attendance %")], attendance_report, BOTH, ["course_id", "batch_id"]),
    Report("assessments", "Assessment Report", "Assessment results with pass/fail and evaluator.",
           [("learner_code", "Learner ID"), ("learner", "Learner"), ("department", "Dept"), ("course", "Course"),
            ("module", "Module"), ("assessment", "Assessment"), ("type", "Type"), ("score", "Score"),
            ("percentage", "%"), ("result", "Result"), ("evaluator", "Evaluator"), ("date", "Date")],
           assessment_report, BOTH, ["course_id"]),
    Report("progress", "Progress Report", "Learner progress across modules, content, practicals and assessments.",
           [("learner_code", "Learner ID"), ("learner", "Learner"), ("department", "Dept"), ("course", "Course"),
            ("batch", "Batch"), ("progress", "Progress %"), ("modules", "Modules"), ("videos", "Videos"),
            ("practicals", "Practicals"), ("assessments", "Assessments"), ("attendance", "Attendance %"),
            ("average_score", "Avg Score %"), ("risk", "Risk"), ("last_activity", "Last Activity")],
           progress_report, BOTH, ["course_id", "batch_id"]),
    Report("completion", "Completion Report", "Completion status against demo criteria.",
           [("learner_code", "Learner ID"), ("learner", "Learner"), ("department", "Dept"), ("course", "Course"),
            ("batch", "Batch"), ("status", "Status"), ("modules", "Modules"), ("assessments", "Assessments"),
            ("practicals", "Practicals"), ("attendance", "Attendance"), ("reference", "Reference"),
            ("completed_on", "Completed")], completion_report, BOTH, ["course_id", "status"]),
    Report("at-risk", "At-Risk Report", "Learners flagged AT RISK or CRITICAL, with reasons.",
           [("learner_code", "Learner ID"), ("learner", "Learner"), ("department", "Dept"), ("course", "Course"),
            ("batch", "Batch"), ("risk", "Risk"), ("progress", "Progress %"), ("attendance", "Attendance %"),
            ("average_score", "Avg Score %"), ("reasons", "Reasons"), ("last_activity", "Last Activity")],
           at_risk_report, BOTH, ["course_id", "batch_id"]),
    Report("content-production", "Content Production Report", "Instructional video records, production stage and QC.",
           [("code", "Code"), ("type", "Type"), ("title", "Title"), ("course", "Course"), ("module", "Module"),
            ("instructor", "Instructor"), ("minutes", "Minutes"), ("production", "Production"), ("qc_status", "QC Status"),
            ("captions", "Captions"), ("transcripts", "Transcripts"), ("ai_disclosure", "AI Disclosure"),
            ("video_file", "Video File")], content_report, ADMIN, ["course_id"]),
    Report("ndu-sync", "NDU Sync Report", "Prototype / Demo NDU synchronisation log.",
           [("timestamp", "Timestamp (UTC)"), ("type", "Sync Type"), ("direction", "Direction"), ("learner", "Learner"),
            ("course", "Course"), ("field", "Field"), ("old", "Old"), ("new", "New"), ("result", "Result"),
            ("records", "Records"), ("message", "Message"), ("by", "Triggered By")], ndu_report, ADMIN),
    Report("audit", "Audit Report", "Complete audit trail of portal activity.",
           [("timestamp", "Timestamp (UTC)"), ("user", "User"), ("role", "Role"), ("action", "Action"),
            ("entity", "Entity"), ("entity_id", "Entity ID"), ("result", "Result"), ("details", "Details")],
           audit_report, ADMIN),
]}
