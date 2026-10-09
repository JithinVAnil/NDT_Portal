from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import bad_request, forbid, not_found, require_admin, require_admin_or_department
from app.models import Batch, BatchEnrollment, Course, EligibilityCheck, Learner, Nomination, User
from app.models.base import NominationStatus as S, RoleCode
from app.repositories import serializers as ser
from app.repositories.scope import get_learner_checked, scope_nominations
from app.schemas.requests import (
    AllocateBatchRequest,
    AllocateCourseRequest,
    BulkActionRequest,
    DecisionRequest,
    NominationCreate,
)
from app.api.routes.learners import create_learner_record
from app.services import audit, workflow

router = APIRouter(prefix="/nominations", tags=["Nominations"])


def _get(db: Session, user: User, nomination_id: int) -> Nomination:
    nom = db.get(Nomination, nomination_id)
    if not nom:
        raise not_found("Nomination")
    if user.role_code == RoleCode.DEPARTMENT and nom.department_id != user.department_id:
        raise forbid()
    if user.role_code == RoleCode.LEARNER:
        raise forbid()
    return nom


def _detail(db: Session, nom: Nomination) -> dict:
    data = ser.nomination(nom)
    data["history"] = [{"id": h.id, "from_status": h.from_status, "to_status": h.to_status, "action": h.action,
                        "remarks": h.remarks, "user": h.user_name, "timestamp": ser.iso(h.created_at)}
                       for h in nom.history]
    checks = db.scalars(select(EligibilityCheck).where(EligibilityCheck.nomination_id == nom.id)
                        .order_by(EligibilityCheck.created_at.desc())).all()
    data["eligibility_checks"] = [{"id": c.id, "result": c.result, "rules": c.rules, "checked_by": c.checked_by_name,
                                   "timestamp": ser.iso(c.created_at)} for c in checks]
    # Suggested batches for allocation
    course_id = nom.allocated_course_id or nom.course_id
    batches = db.scalars(select(Batch).where(Batch.course_id == course_id, Batch.status.in_(("Planned", "Active")),
                                             or_(Batch.department_id.is_(None), Batch.department_id == nom.department_id))
                         .order_by(Batch.start_date)).all()
    data["available_batches"] = []
    for b in batches:
        n = db.scalar(select(func.count(BatchEnrollment.id)).where(BatchEnrollment.batch_id == b.id,
                                                                   BatchEnrollment.status != "Withdrawn")) or 0
        data["available_batches"].append(ser.batch(b, n))
    data["learner_detail"] = ser.learner(nom.learner)
    return data


@router.get("")
def list_nominations(
    status: str | None = None, course_id: int | None = None, department_id: int | None = None, q: str | None = None,
    user: User = Depends(require_admin_or_department), db: Session = Depends(get_db),
):
    stmt = scope_nominations(select(Nomination), user).order_by(Nomination.updated_at.desc())
    if status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        stmt = stmt.where(Nomination.status.in_(statuses))
    if course_id:
        stmt = stmt.where(Nomination.course_id == course_id)
    if department_id:
        stmt = stmt.where(Nomination.department_id == department_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.join(Learner, Learner.id == Nomination.learner_id).where(
            or_(Nomination.nomination_no.ilike(like), Learner.full_name.ilike(like), Learner.learner_code.ilike(like)))
    return [ser.nomination(n) for n in db.scalars(stmt).all()]


@router.get("/summary")
def nomination_summary(user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    stmt = scope_nominations(select(Nomination.status, func.count(Nomination.id)), user).group_by(Nomination.status)
    counts = dict(db.execute(stmt).all())
    return {s: counts.get(s, 0) for s in S.ALL}


@router.post("")
def create_nomination(body: NominationCreate, request: Request, user: User = Depends(require_admin_or_department),
                      db: Session = Depends(get_db)):
    course = db.get(Course, body.course_id)
    if not course:
        raise bad_request("Select a valid course")
    if body.new_learner is not None:
        learner = create_learner_record(db, user, body.new_learner)
        audit.record(db, user, "LEARNER_CREATED", "Learner", learner.learner_code, details=learner.full_name,
                     request=request)
    elif body.learner_id:
        learner = get_learner_checked(db, user, body.learner_id)
    else:
        raise bad_request("Select an existing learner or enter new learner details")
    nom = workflow.create_nomination(db, user, learner, course, body.training_mode, body.justification, body.submit, request)
    db.commit()
    return _detail(db, nom)


@router.post("/bulk-submit")
def bulk_submit(body: BulkActionRequest, request: Request, user: User = Depends(require_admin_or_department),
                db: Session = Depends(get_db)):
    done = 0
    for nid in body.nomination_ids:
        nom = _get(db, user, nid)
        if nom.status == S.DRAFT:
            workflow.submit_nomination(db, user, nom, request)
            done += 1
    db.commit()
    return {"submitted": done}


@router.get("/{nomination_id}")
def get_nomination(nomination_id: int, user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    return _detail(db, _get(db, user, nomination_id))


@router.post("/{nomination_id}/submit")
def submit(nomination_id: int, request: Request, user: User = Depends(require_admin_or_department),
           db: Session = Depends(get_db)):
    nom = _get(db, user, nomination_id)
    workflow.submit_nomination(db, user, nom, request)
    db.commit()
    return _detail(db, nom)


@router.post("/{nomination_id}/review")
def review(nomination_id: int, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    nom = _get(db, user, nomination_id)
    workflow.review_nomination(db, user, nom, request)
    db.commit()
    return _detail(db, nom)


@router.post("/{nomination_id}/eligibility")
def run_eligibility(nomination_id: int, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    nom = _get(db, user, nomination_id)
    workflow.run_eligibility(db, user, nom, request)
    db.commit()
    return _detail(db, nom)


@router.post("/{nomination_id}/approve")
def approve(nomination_id: int, body: DecisionRequest, request: Request, user: User = Depends(require_admin),
            db: Session = Depends(get_db)):
    nom = _get(db, user, nomination_id)
    workflow.approve(db, user, nom, body.remarks, request)
    db.commit()
    return _detail(db, nom)


@router.post("/{nomination_id}/reject")
def reject(nomination_id: int, body: DecisionRequest, request: Request, user: User = Depends(require_admin),
           db: Session = Depends(get_db)):
    nom = _get(db, user, nomination_id)
    workflow.reject(db, user, nom, body.remarks or "", request)
    db.commit()
    return _detail(db, nom)


@router.post("/{nomination_id}/allocate-course")
def allocate_course(nomination_id: int, body: AllocateCourseRequest, request: Request, user: User = Depends(require_admin),
                    db: Session = Depends(get_db)):
    nom = _get(db, user, nomination_id)
    workflow.allocate_course(db, user, nom, body.course_id, request)
    db.commit()
    return _detail(db, nom)


@router.post("/{nomination_id}/allocate-batch")
def allocate_batch(nomination_id: int, body: AllocateBatchRequest, request: Request, user: User = Depends(require_admin),
                   db: Session = Depends(get_db)):
    nom = _get(db, user, nomination_id)
    workflow.allocate_batch(db, user, nom, body.batch_id, request)
    db.commit()
    return _detail(db, nom)


@router.post("/{nomination_id}/onboard")
def onboard(nomination_id: int, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    nom = _get(db, user, nomination_id)
    info = workflow.onboard(db, user, nom, request)
    db.commit()
    data = _detail(db, nom)
    data["onboarding"] = info
    return data
