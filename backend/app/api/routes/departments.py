from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import bad_request, not_found, require_admin, require_admin_or_department
from app.models import Department, Learner, Nomination, User
from app.models.base import RoleCode
from app.repositories import serializers as ser
from app.repositories.scope import ensure_department_access
from app.schemas.requests import DepartmentIn
from app.services import audit
from app.services import dashboard as dash

router = APIRouter(prefix="/departments", tags=["Departments"])


@router.get("")
def list_departments(user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    stmt = select(Department).order_by(Department.code)
    if user.role_code == RoleCode.DEPARTMENT:
        stmt = stmt.where(Department.id == user.department_id)
    rows = []
    for d in db.scalars(stmt).all():
        item = ser.department(d)
        item["learners"] = db.scalar(select(func.count(Learner.id)).where(Learner.department_id == d.id)) or 0
        item["nominations"] = db.scalar(select(func.count(Nomination.id)).where(Nomination.department_id == d.id)) or 0
        item["in_charges"] = [u.full_name for u in db.scalars(
            select(User).where(User.department_id == d.id, User.learner_id.is_(None))).all()]
        rows.append(item)
    return rows


@router.get("/options")
def department_options(user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    stmt = select(Department).where(Department.is_active.is_(True)).order_by(Department.name)
    if user.role_code == RoleCode.DEPARTMENT:
        stmt = stmt.where(Department.id == user.department_id)
    return [{"id": d.id, "code": d.code, "name": d.name} for d in db.scalars(stmt).all()]


@router.get("/{department_id}")
def get_department(department_id: int, user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    ensure_department_access(user, department_id)
    d = db.get(Department, department_id)
    if not d:
        raise not_found("Department")
    data = ser.department(d)
    data["kpis"] = dash.kpis(db, d.id)
    return data


@router.post("")
def create_department(body: DepartmentIn, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.scalar(select(Department.id).where(Department.code == body.code)):
        raise bad_request(f"Department code {body.code} already exists")
    d = Department(**body.model_dump())
    db.add(d)
    db.flush()
    audit.record(db, user, "DEPARTMENT_CREATED", "Department", d.code, details=d.name, request=request)
    db.commit()
    return ser.department(d)


@router.put("/{department_id}")
def update_department(department_id: int, body: DepartmentIn, request: Request, user: User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    d = db.get(Department, department_id)
    if not d:
        raise not_found("Department")
    clash = db.scalar(select(Department.id).where(Department.code == body.code, Department.id != d.id))
    if clash:
        raise bad_request(f"Department code {body.code} already exists")
    for k, v in body.model_dump().items():
        setattr(d, k, v)
    audit.record(db, user, "DEPARTMENT_UPDATED", "Department", d.code, request=request)
    db.commit()
    return ser.department(d)
