"""Row-level data scoping for Department and Learner isolation.

Every list/detail endpoint passes its query through these helpers so that a
Department In-Charge only ever sees their department's rows and a Learner only
their own rows. Admins are unrestricted.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session

from app.core.deps import forbid, not_found
from app.models import Batch, BatchEnrollment, Learner, Nomination, User
from app.models.base import RoleCode


def scope_by_learner_column(stmt: Select, user: User, learner_column: Any, join_learner: bool = True) -> Select:
    """Restrict a statement whose rows belong to a learner."""
    if user.role_code == RoleCode.ADMIN:
        return stmt
    if user.role_code == RoleCode.LEARNER:
        return stmt.where(learner_column == (user.learner_id or -1))
    # Department
    sub = select(Learner.id).where(Learner.department_id == (user.department_id or -1))
    return stmt.where(learner_column.in_(sub))


def scope_learners(stmt: Select, user: User) -> Select:
    if user.role_code == RoleCode.ADMIN:
        return stmt
    if user.role_code == RoleCode.DEPARTMENT:
        return stmt.where(Learner.department_id == (user.department_id or -1))
    return stmt.where(Learner.id == (user.learner_id or -1))


def scope_nominations(stmt: Select, user: User) -> Select:
    if user.role_code == RoleCode.ADMIN:
        return stmt
    if user.role_code == RoleCode.DEPARTMENT:
        return stmt.where(Nomination.department_id == (user.department_id or -1))
    return stmt.where(Nomination.learner_id == (user.learner_id or -1))


def scope_batches(stmt: Select, user: User) -> Select:
    """Departments see batches owned by them or containing their learners."""
    if user.role_code == RoleCode.ADMIN:
        return stmt
    if user.role_code == RoleCode.DEPARTMENT:
        dept_learners = select(Learner.id).where(Learner.department_id == (user.department_id or -1))
        batch_ids = select(BatchEnrollment.batch_id).where(BatchEnrollment.learner_id.in_(dept_learners))
        return stmt.where(or_(Batch.department_id == user.department_id, Batch.id.in_(batch_ids)))
    batch_ids = select(BatchEnrollment.batch_id).where(BatchEnrollment.learner_id == (user.learner_id or -1))
    return stmt.where(Batch.id.in_(batch_ids))


def get_learner_checked(db: Session, user: User, learner_id: int) -> Learner:
    learner = db.get(Learner, learner_id)
    if not learner:
        raise not_found("Learner")
    ensure_learner_access(user, learner)
    return learner


def ensure_learner_access(user: User, learner: Learner) -> None:
    if user.role_code == RoleCode.ADMIN:
        return
    if user.role_code == RoleCode.DEPARTMENT and learner.department_id == user.department_id:
        return
    if user.role_code == RoleCode.LEARNER and learner.id == user.learner_id:
        return
    raise forbid()


def ensure_department_access(user: User, department_id: int | None) -> None:
    if user.role_code == RoleCode.ADMIN:
        return
    if user.role_code == RoleCode.DEPARTMENT and department_id == user.department_id:
        return
    raise forbid()


def ensure_batch_access(db: Session, user: User, batch: Batch) -> None:
    if user.role_code == RoleCode.ADMIN:
        return
    stmt = scope_batches(select(Batch.id).where(Batch.id == batch.id), user)
    if db.execute(stmt).first() is None:
        raise forbid()
