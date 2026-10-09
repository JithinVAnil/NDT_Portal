"""Audit trail, notifications, global search, settings, requirement coverage and demo reset."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import bad_request, not_found, require_admin, require_any
from app.models import AuditLog, Batch, Course, Department, Learner, Nomination, Notification, User
from app.models.base import RoleCode
from app.repositories import serializers as ser
from app.repositories.scope import scope_batches, scope_learners, scope_nominations
from app.schemas.requests import SettingUpdate
from app.services import audit
from app.services.settings_service import DEFAULTS, get_setting, set_setting

router = APIRouter(tags=["System"])


# ---------- Audit ----------
@router.get("/audit")
def list_audit(
    page: int = 1, page_size: int = 50, action: str | None = None, role: str | None = None, entity: str | None = None,
    result: str | None = None, q: str | None = None, date_from: str | None = None, date_to: str | None = None,
    user: User = Depends(require_admin), db: Session = Depends(get_db),
):
    page_size = max(1, min(page_size, 200))
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if role:
        stmt = stmt.where(AuditLog.role == role)
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    if result:
        stmt = stmt.where(AuditLog.result == result)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(AuditLog.user_email.ilike(like), AuditLog.user_name.ilike(like),
                              AuditLog.details.ilike(like), AuditLog.entity_id.ilike(like), AuditLog.action.ilike(like)))
    try:
        if date_from:
            stmt = stmt.where(AuditLog.created_at >= datetime.fromisoformat(date_from))
        if date_to:
            stmt = stmt.where(AuditLog.created_at <= datetime.fromisoformat(date_to + "T23:59:59"))
    except ValueError:
        raise bad_request("Invalid date filter")
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
                      .offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [ser.audit_log(a) for a in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/audit/facets")
def audit_facets(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return {
        "actions": sorted(db.scalars(select(func.distinct(AuditLog.action))).all()),
        "entities": sorted(e for e in db.scalars(select(func.distinct(AuditLog.entity))).all() if e),
        "roles": list(RoleCode.ALL),
    }


# ---------- Notifications ----------
@router.get("/notifications")
def list_notifications(unread_only: bool = False, user: User = Depends(require_any), db: Session = Depends(get_db)):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    rows = db.scalars(stmt.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(200)).all()
    unread = db.scalar(select(func.count(Notification.id)).where(Notification.user_id == user.id,
                                                                 Notification.is_read.is_(False))) or 0
    return {"items": [ser.notification(n) for n in rows], "unread": unread}


@router.post("/notifications/{notification_id}/read")
def mark_read(notification_id: int, user: User = Depends(require_any), db: Session = Depends(get_db)):
    n = db.get(Notification, notification_id)
    if not n or n.user_id != user.id:
        raise not_found("Notification")
    n.is_read = True
    db.commit()
    return {"ok": True}


@router.post("/notifications/read-all")
def mark_all_read(user: User = Depends(require_any), db: Session = Depends(get_db)):
    for n in db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.is_read.is_(False))).all():
        n.is_read = True
    db.commit()
    return {"ok": True}


# ---------- Global search (role-scoped) ----------
@router.get("/search")
def search(q: str, user: User = Depends(require_any), db: Session = Depends(get_db)):
    term = q.strip()
    if len(term) < 2:
        return {"results": []}
    like = f"%{term}%"
    role = user.role_code
    base = "/admin" if role == RoleCode.ADMIN else "/department" if role == RoleCode.DEPARTMENT else "/learner"
    results: list[dict] = []
    if role != RoleCode.LEARNER:
        for l in db.scalars(scope_learners(select(Learner), user).where(or_(
                Learner.full_name.ilike(like), Learner.learner_code.ilike(like), Learner.email.ilike(like),
                Learner.employee_id.ilike(like))).limit(8)).all():
            results.append({"type": "Learner", "title": l.full_name, "subtitle": f"{l.learner_code} · {l.department.code}",
                            "href": f"{base}/learners/{l.id}"})
        for n in db.scalars(scope_nominations(select(Nomination), user).join(Learner, Learner.id == Nomination.learner_id)
                            .where(or_(Nomination.nomination_no.ilike(like), Learner.full_name.ilike(like))).limit(6)).all():
            results.append({"type": "Nomination", "title": n.nomination_no,
                            "subtitle": f"{n.learner.full_name} · {n.course.short_title} · {n.status}",
                            "href": f"{base}/nominations/{n.id}"})
        dstmt = select(Department).where(or_(Department.name.ilike(like), Department.code.ilike(like)))
        if role == RoleCode.DEPARTMENT:
            dstmt = dstmt.where(Department.id == user.department_id)
        for d in db.scalars(dstmt.limit(5)).all():
            results.append({"type": "Department", "title": d.name, "subtitle": d.code,
                            "href": "/admin/departments" if role == RoleCode.ADMIN else "/department/dashboard"})
    for b in db.scalars(scope_batches(select(Batch), user).where(or_(Batch.code.ilike(like), Batch.name.ilike(like))).limit(5)).all():
        results.append({"type": "Batch", "title": b.code, "subtitle": f"{b.course.short_title} · {b.status}",
                        "href": f"{base}/batches/{b.id}" if role != RoleCode.LEARNER else "/learner/course"})
    for c in db.scalars(select(Course).where(or_(Course.title.ilike(like), Course.code.ilike(like))).limit(4)).all():
        results.append({"type": "Course", "title": c.title, "subtitle": c.code,
                        "href": f"/admin/courses/{c.id}" if role == RoleCode.ADMIN else
                        ("/department/dashboard" if role == RoleCode.DEPARTMENT else "/learner/course")})
    return {"results": results}


# ---------- Settings ----------
@router.get("/settings")
def get_settings(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return {k: {"value": get_setting(db, k), "description": v["description"]} for k, v in DEFAULTS.items()}


@router.put("/settings/{key}")
def update_setting(key: str, body: SettingUpdate, request: Request, user: User = Depends(require_admin),
                   db: Session = Depends(get_db)):
    if key not in DEFAULTS:
        raise not_found("Setting")
    current = get_setting(db, key)
    if type(current) is not type(body.value):
        raise bad_request("Setting value has the wrong shape")
    if isinstance(current, dict):
        unknown = set(body.value) - set(current)
        if unknown:
            raise bad_request(f"Unknown keys: {', '.join(sorted(unknown))}")
        merged = {**current, **body.value}
    else:
        merged = body.value
    set_setting(db, key, merged)
    audit.record(db, user, "SETTINGS_UPDATED", "Setting", key, details=str(body.value)[:500], request=request)
    if key in ("risk_thresholds", "completion_rules"):
        from app.services import progress

        progress.recompute_all(db)
    db.commit()
    return {"key": key, "value": merged}


# ---------- Requirement coverage ----------
COVERAGE = [
    ("Authentication (local JWT + bcrypt)", "Implemented", "Local login, hashed passwords, JWT sessions, audit of login/logout"),
    ("RBAC — Administrator / Department In-Charge / Learner", "Implemented", "Enforced by backend dependencies and row scoping"),
    ("Department & learner data isolation", "Implemented", "Department and learner scoping on every list/detail API"),
    ("Learner Nomination", "Implemented", "Create, edit-free draft, submit, status history"),
    ("Bulk Import (CSV / Excel)", "Implemented", "Upload → parse → validate → preview → confirm → import"),
    ("Eligibility", "Implemented", "Configurable demo rules with reasons (final rules to be configured)"),
    ("Approval Workflow", "Implemented", "Review, eligibility, approve/reject with remarks; all transitions stored"),
    ("Course Allocation", "Implemented", "Creates enrolment, progress and completion records"),
    ("Batch Management", "Implemented", "Physical / Digital / Hybrid batches with capacity checks"),
    ("Learner Onboarding", "Implemented", "Creates learner portal account and demo NDU enrolment"),
    ("Attendance", "Implemented", "Per-session marking, Mark All Present, recalculated KPIs"),
    ("Assessment", "Implemented", "Quiz / Practical / Assignment / Final with pass/fail and evaluator"),
    ("Practicals", "Implemented", "Scenario-based practicals with rubric-based evaluation"),
    ("Exercises", "Implemented", "Exercise records with answer-key flag, linked to modules/lessons"),
    ("Rubrics", "Implemented", "Criteria-weighted rubrics used for practical scoring"),
    ("Progress", "Implemented", "Module, content, practical, assessment, attendance, score, last activity"),
    ("At-Risk Identification", "Implemented", "Demo ON TRACK / AT RISK / CRITICAL rules with reasons"),
    ("Completion", "Implemented", "Demo criteria; Eligible → Completed with reference number"),
    ("Reporting (14 reports)", "Implemented", "Search, filter, sort, pagination"),
    ("Export — CSV / Excel / PDF", "Implemented", "csv, openpyxl, ReportLab — generated locally"),
    ("Audit Trail", "Implemented", "Timestamp, user, role, action, entity, entity ID, result"),
    ("Notifications (in-app)", "Implemented", "Local notifications; no external email/SMS"),
    ("Global Search", "Implemented", "Role-scoped search across learners, nominations, batches, courses"),
    ("Content Library", "Implemented", "Course → Module → Lesson → Video → Resource → Practical → Exercise → Assessment → Rubric"),
    ("Video Metadata Tracking", "Implemented", "Instructional, technical, accessibility and AI-disclosure metadata"),
    ("Video QC", "Implemented", "Nine-point QC checklist + restriction compliance; overall status"),
    ("Content Production Tracking", "Implemented", "Idea → Ready for Upload pipeline"),
    ("25.5-Hour Tracking", "Implemented", "Computed from actual stored video durations"),
    ("Video Player", "Implemented", "HTML5 player with captions for uploaded files; placeholder when asset not yet supplied"),
    ("Final instructional videos", "Pending — content production", "Demo content records only; real videos to be uploaded"),
    ("NDU Integration", "Prototype / Mock", "Demo adapter simulates enrolment, progress and completion sync"),
    ("Email / SMS delivery", "Prototype / Mock", "In-app notifications only"),
    ("Demo Reset", "Implemented", "Administrator can restore the initial demo state"),
    ("API Documentation (Swagger)", "Implemented", "http://localhost:8000/docs"),
]


@router.get("/coverage")
def coverage(user: User = Depends(require_admin)):
    return [{"requirement": r, "status": s, "notes": n} for r, s, n in COVERAGE]


# ---------- Demo reset ----------
@router.post("/admin/reset-demo")
def reset_demo(request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    from app.seed.seed import reset_and_seed

    email = user.email
    # Release this request's DB session (and its table locks) before dropping tables.
    db.rollback()
    db.close()
    summary = reset_and_seed()
    from app.core.database import SessionLocal

    with SessionLocal() as db:
        admin = db.scalar(select(User).where(User.email == email))
        audit.record(db, admin, "DEMO_RESET", "System", None, details="Demo data restored to initial state", request=request)
        db.commit()
    return {"ok": True, "summary": summary}
