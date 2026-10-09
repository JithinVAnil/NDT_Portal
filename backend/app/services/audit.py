"""Audit trail writer. Every significant action calls `record`."""
from __future__ import annotations

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import AuditLog, User


def record(
    db: Session,
    user: User | None,
    action: str,
    entity: str | None = None,
    entity_id: str | int | None = None,
    result: str = "SUCCESS",
    details: str | None = None,
    request: Request | None = None,
    email_override: str | None = None,
) -> AuditLog:
    ip = None
    if request is not None and request.client is not None:
        ip = request.client.host
    log = AuditLog(
        user_id=user.id if user else None,
        user_email=user.email if user else email_override,
        user_name=user.full_name if user else None,
        role=user.role_code if user else None,
        department_id=user.department_id if user else None,
        action=action,
        entity=entity,
        entity_id=str(entity_id) if entity_id is not None else None,
        result=result,
        details=details,
        ip_address=ip,
    )
    db.add(log)
    return log
