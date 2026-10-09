"""Learner self-service endpoints — strictly the logged-in learner's own data."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import not_found, require_roles
from app.models import ContentItem, CourseEnrollment, Learner, User
from app.models.base import RoleCode
from app.repositories import serializers as ser
from app.services import learner_profile

router = APIRouter(prefix="/learner", tags=["Learner Portal"])

require_learner = require_roles(RoleCode.LEARNER)


def _me(db: Session, user: User) -> Learner:
    learner = db.get(Learner, user.learner_id) if user.learner_id else None
    if not learner:
        raise not_found("Learner profile")
    return learner


def _primary_enrollment(db: Session, learner: Learner) -> CourseEnrollment | None:
    enrs = db.scalars(select(CourseEnrollment).where(CourseEnrollment.learner_id == learner.id)
                      .order_by(CourseEnrollment.allocated_at.desc())).all()
    for status in ("Onboarded", "Batch Assigned", "Allocated", "Completed", "Not Completed"):
        for e in enrs:
            if e.status == status:
                return e
    return enrs[0] if enrs else None


@router.get("/me")
def me(user: User = Depends(require_learner), db: Session = Depends(get_db)):
    learner = _me(db, user)
    profile = learner_profile.full_profile(db, learner)
    primary = _primary_enrollment(db, learner)
    profile["primary_enrollment_id"] = primary.id if primary else None
    return profile


@router.get("/course")
def my_course(enrollment_id: int | None = None, user: User = Depends(require_learner), db: Session = Depends(get_db)):
    learner = _me(db, user)
    enr = db.get(CourseEnrollment, enrollment_id) if enrollment_id else _primary_enrollment(db, learner)
    if not enr or enr.learner_id != learner.id:
        raise not_found("Course enrolment")
    tree = learner_profile.course_tree(db, enr.course_id, learner.id)
    tree["enrollment"] = ser.enrollment(enr)
    tree["batch"] = ser.batch(enr.batch) if enr.batch else None
    return tree


@router.get("/content")
def my_content(user: User = Depends(require_learner), db: Session = Depends(get_db)):
    learner = _me(db, user)
    enr = _primary_enrollment(db, learner)
    if not enr:
        return []
    items = db.scalars(select(ContentItem).where(ContentItem.course_id == enr.course_id)
                       .order_by(ContentItem.module_id, ContentItem.code)).all()
    return [ser.content(c) for c in items]
