from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import bad_request, forbid, not_found, require_admin_or_department
from app.models import ReportLog, User
from app.models.base import RoleCode
from app.reports.definitions import REPORTS
from app.reports.exporters import EXPORTERS
from app.repositories import serializers as ser
from app.services import audit

router = APIRouter(prefix="/reports", tags=["Reports"])

FILTER_KEYS = ("course_id", "department_id", "batch_id", "status")


def _filters(request: Request, user: User) -> dict:
    f = {k: request.query_params.get(k) for k in FILTER_KEYS if request.query_params.get(k)}
    if user.role_code == RoleCode.DEPARTMENT:
        f.pop("department_id", None)  # department users are always scoped to their own department
    return f


def _report(key: str, user: User):
    rep = REPORTS.get(key)
    if not rep:
        raise not_found("Report")
    if user.role_code not in rep.roles:
        raise forbid("This report is available to Administrators only")
    return rep


@router.get("")
def catalogue(user: User = Depends(require_admin_or_department)):
    return [{"key": r.key, "title": r.title, "description": r.description, "filters": r.filters,
             "columns": [{"key": k, "label": l} for k, l in r.columns]}
            for r in REPORTS.values() if user.role_code in r.roles]


@router.get("/history")
def history(user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    stmt = select(ReportLog).order_by(ReportLog.created_at.desc()).limit(50)
    if user.role_code == RoleCode.DEPARTMENT:
        stmt = stmt.where(ReportLog.department_id == user.department_id)
    return [{"id": r.id, "report": r.title, "format": r.output_format, "rows": r.row_count, "by": r.generated_by_name,
             "filters": r.filters, "timestamp": ser.iso(r.created_at)} for r in db.scalars(stmt).all()]


def _log(db: Session, user: User, rep, fmt: str, filters: dict, rows: int) -> None:
    db.add(ReportLog(report_type=rep.key, title=rep.title, output_format=fmt, filters=filters, row_count=rows,
                     generated_by_id=user.id, generated_by_name=user.full_name, role=user.role_code,
                     department_id=user.department_id))


@router.get("/{key}")
def generate(key: str, request: Request, user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    rep = _report(key, user)
    f = _filters(request, user)
    rows = rep.builder(db, user, f)
    _log(db, user, rep, "VIEW", f, len(rows))
    audit.record(db, user, "REPORT_GENERATED", "Report", rep.key, details=f"{rep.title}: {len(rows)} rows {f or ''}",
                 request=request)
    db.commit()
    return {"key": rep.key, "title": rep.title, "description": rep.description,
            "columns": [{"key": k, "label": l} for k, l in rep.columns], "rows": rows, "filters": f,
            "generated_at": ser.iso(datetime.utcnow()), "generated_by": user.full_name,
            "scope": user.department.name if user.role_code == RoleCode.DEPARTMENT else "All departments"}


@router.get("/{key}/export")
def export(key: str, request: Request, format: str = "csv", user: User = Depends(require_admin_or_department),
           db: Session = Depends(get_db)):
    rep = _report(key, user)
    fmt = format.lower()
    if fmt not in EXPORTERS:
        raise bad_request("Format must be csv, xlsx or pdf")
    f = _filters(request, user)
    rows = rep.builder(db, user, f)
    fn, mime, ext = EXPORTERS[fmt]
    title = rep.title + (f" — {user.department.code}" if user.role_code == RoleCode.DEPARTMENT else "")
    data = fn(title, rep.columns, rows, f"{user.full_name} ({user.role.name})")
    _log(db, user, rep, fmt.upper(), f, len(rows))
    audit.record(db, user, "REPORT_EXPORTED", "Report", rep.key, details=f"{rep.title} as {fmt.upper()} ({len(rows)} rows)",
                 request=request)
    db.commit()
    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M")
    filename = f"nielit-demo-{rep.key}-{stamp}.{ext}"
    return Response(content=data, media_type=mime, headers={"Content-Disposition": f'attachment; filename="{filename}"'})
