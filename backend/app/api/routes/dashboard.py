from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_admin, require_roles
from app.models import User
from app.models.base import RoleCode
from app.services import dashboard as dash
from app.services.content_service import production_summary

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/admin")
def admin_dashboard(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return {
        "kpis": dash.kpis(db),
        "charts": dash.charts(db),
        "courses": dash.course_cards(db),
        "content": production_summary(db),
    }


@router.get("/department")
def department_dashboard(user: User = Depends(require_roles(RoleCode.DEPARTMENT)), db: Session = Depends(get_db)):
    return {
        "department": {"id": user.department_id, "name": user.department.name, "code": user.department.code},
        "kpis": dash.kpis(db, user.department_id),
        "charts": dash.charts(db, user.department_id),
        "courses": dash.course_cards(db, user.department_id),
    }
