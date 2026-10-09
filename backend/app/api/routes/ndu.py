"""Prototype / Demo NDU Integration endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import bad_request, not_found, require_admin
from app.integrations.ndu import get_adapter
from app.models import CourseEnrollment, LearnerProgress, NduEnrollment, NduSyncLog, User
from app.repositories import serializers as ser
from app.schemas.requests import NduLearnerRequest, NduSimulateRequest
from app.services import audit, ndu_service
from app.services.settings_service import get_setting

router = APIRouter(prefix="/ndu", tags=["NDU Integration (Demo)"])


@router.get("/status")
def status(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    prog = get_setting(db, "programme")
    total = db.scalar(select(func.count(NduEnrollment.id))) or 0
    last = db.scalar(select(func.max(NduSyncLog.created_at)))
    return {
        "label": "Prototype / Demo NDU Integration",
        "integration_status": "Connected (Demo Adapter)",
        "mode": get_adapter().mode,
        "ndu_platform": prog.get("ndu_base_url", "https://ndu.digital"),
        "note": "No real NDU API is called. Real integration requires official NDU API documentation and credentials.",
        "last_sync": ser.iso(last),
        "learners_synced": db.scalar(select(func.count(NduEnrollment.id)).where(NduEnrollment.learner_synced.is_(True))) or 0,
        "courses_synced": db.scalar(select(func.count(func.distinct(NduEnrollment.course_id)))) or 0,
        "progress_synced": db.scalar(select(func.count(NduEnrollment.id)).where(NduEnrollment.progress_synced.is_(True))) or 0,
        "completion_synced": db.scalar(select(func.count(NduEnrollment.id)).where(NduEnrollment.completion_synced.is_(True))) or 0,
        "total_enrollments": total,
        "sync_success": db.scalar(select(func.count(NduSyncLog.id)).where(NduSyncLog.result == "Success")) or 0,
        "sync_failure": db.scalar(select(func.count(NduSyncLog.id)).where(NduSyncLog.result == "Failure")) or 0,
    }


@router.get("/enrollments")
def enrollments(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = []
    for ne in db.scalars(select(NduEnrollment).order_by(NduEnrollment.last_synced_at.desc())).all():
        enr = db.scalar(select(CourseEnrollment).where(CourseEnrollment.learner_id == ne.learner_id,
                                                       CourseEnrollment.course_id == ne.course_id))
        p = db.scalar(select(LearnerProgress).where(LearnerProgress.enrollment_id == enr.id)) if enr else None
        rows.append({
            "id": ne.id, "enrollment_id": enr.id if enr else None, "learner_id": ne.learner_id,
            "learner": ne.learner.full_name, "learner_code": ne.learner.learner_code, "course": ne.course.short_title,
            "batch": enr.batch.code if enr and enr.batch else None,
            "ndu_learner_ref": ne.ndu_learner_ref, "ndu_course_ref": ne.ndu_course_ref, "sync_status": ne.sync_status,
            "learner_synced": ne.learner_synced, "progress_synced": ne.progress_synced,
            "completion_synced": ne.completion_synced, "ndu_progress_pct": ne.ndu_progress_pct,
            "portal_progress_pct": p.overall_pct if p else None,
            "modules": f"{p.modules_completed}/{p.modules_total}" if p else None,
            "last_synced_at": ser.iso(ne.last_synced_at),
        })
    return rows


@router.get("/logs")
def logs(limit: int = 200, learner_id: int | None = None, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    stmt = select(NduSyncLog).order_by(NduSyncLog.created_at.desc(), NduSyncLog.id.desc()).limit(min(limit, 1000))
    if learner_id:
        stmt = stmt.where(NduSyncLog.learner_id == learner_id)
    return [ser.sync_log(s) for s in db.scalars(stmt).all()]


@router.post("/sync-learner")
def sync_learner(body: NduLearnerRequest, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    res = ndu_service.sync_learners(db, user, body.learner_id)
    audit.record(db, user, "NDU_SYNC_LEARNER", "NDU", body.learner_id, details=str(res), request=request)
    db.commit()
    return res


@router.post("/sync-progress")
def sync_progress(body: NduLearnerRequest, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    res = ndu_service.sync_progress(db, user, body.learner_id)
    audit.record(db, user, "NDU_SYNC_PROGRESS", "NDU", body.learner_id, details=str(res), request=request)
    db.commit()
    return res


@router.post("/sync-completion")
def sync_completion(body: NduLearnerRequest, request: Request, user: User = Depends(require_admin),
                    db: Session = Depends(get_db)):
    res = ndu_service.sync_completion(db, user, body.learner_id)
    audit.record(db, user, "NDU_SYNC_COMPLETION", "NDU", body.learner_id, details=str(res), request=request)
    db.commit()
    return res


@router.post("/simulate-update")
def simulate_update(body: NduSimulateRequest, request: Request, user: User = Depends(require_admin),
                    db: Session = Depends(get_db)):
    enr = None
    if body.enrollment_id:
        enr = db.get(CourseEnrollment, body.enrollment_id)
    elif body.learner_id:
        enr = db.scalar(select(CourseEnrollment).where(CourseEnrollment.learner_id == body.learner_id,
                                                       CourseEnrollment.status == "Onboarded"))
    if not enr:
        raise not_found("Onboarded enrolment")
    if enr.status not in ("Onboarded",):
        raise bad_request("NDU updates can only be simulated for learners currently onboarded")
    res = ndu_service.simulate_update(db, user, enr)
    audit.record(db, user, "NDU_SIMULATED_UPDATE", "Learner", enr.learner.learner_code,
                 details=f"Progress {res['old_progress']:.0f}% → {res['new_progress']:.0f}% (demo)", request=request)
    db.commit()
    return res
