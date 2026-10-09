from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import bad_request, not_found, require_admin
from app.core.security import hash_password
from app.models import Department, Learner, Role, User
from app.models.base import RoleCode
from app.repositories import serializers as ser
from app.schemas.requests import UserIn, UserUpdate
from app.services import audit

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("")
def list_users(role: str | None = None, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    stmt = select(User).join(Role).order_by(Role.id, User.full_name)
    if role:
        stmt = stmt.where(Role.code == role)
    return [ser.user(u) for u in db.scalars(stmt).all()]


@router.get("/roles")
def list_roles(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [{"id": r.id, "code": r.code, "name": r.name, "description": r.description}
            for r in db.scalars(select(Role).order_by(Role.id)).all()]


@router.post("")
def create_user(body: UserIn, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.scalar(select(User.id).where(User.email == body.email)):
        raise bad_request("A user with this email already exists")
    role = db.scalar(select(Role).where(Role.code == body.role))
    if body.role == RoleCode.DEPARTMENT:
        if not body.department_id or not db.get(Department, body.department_id):
            raise bad_request("Department In-Charge must be linked to a department")
    if body.role == RoleCode.LEARNER:
        learner = db.get(Learner, body.learner_id) if body.learner_id else None
        if not learner:
            raise bad_request("Learner account must be linked to a learner record")
        body.department_id = learner.department_id
    u = User(
        email=body.email, full_name=body.full_name, role_id=role.id,
        department_id=body.department_id if body.role != RoleCode.ADMIN else None,
        learner_id=body.learner_id if body.role == RoleCode.LEARNER else None, designation=body.designation,
        password_hash=hash_password(body.password or settings.demo_password),
    )
    db.add(u)
    db.flush()
    audit.record(db, user, "USER_CREATED", "User", u.id, details=f"{u.email} ({body.role})", request=request)
    db.commit()
    return ser.user(u)


@router.put("/{user_id}")
def update_user(user_id: int, body: UserUpdate, request: Request, user: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise not_found("User")
    if body.is_active is False and u.id == user.id:
        raise bad_request("You cannot deactivate your own account")
    data = body.model_dump(exclude_unset=True)
    pwd = data.pop("password", None)
    for k, v in data.items():
        setattr(u, k, v)
    if pwd:
        u.password_hash = hash_password(pwd)
    audit.record(db, user, "USER_UPDATED", "User", u.id, details=", ".join(sorted(body.model_dump(exclude_unset=True))),
                 request=request)
    db.commit()
    return ser.user(u)
