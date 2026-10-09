"""Local in-app notifications (no external email/SMS — prototype adapter)."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Notification, Role, User


def notify_user(
    db: Session, user_id: int, title: str, message: str, category: str = "info",
    severity: str = "info", link: str | None = None,
) -> None:
    db.add(Notification(user_id=user_id, title=title, message=message, category=category, severity=severity, link=link))


def notify_role(db: Session, role_code: str, title: str, message: str, **kw) -> None:
    ids = db.scalars(select(User.id).join(Role).where(Role.code == role_code, User.is_active.is_(True))).all()
    for uid in ids:
        notify_user(db, uid, title, message, **kw)


def notify_department(db: Session, department_id: int, title: str, message: str, **kw) -> None:
    ids = db.scalars(
        select(User.id).join(Role).where(
            Role.code == "DEPARTMENT", User.department_id == department_id, User.is_active.is_(True)
        )
    ).all()
    for uid in ids:
        notify_user(db, uid, title, message, **kw)


def notify_learner(db: Session, learner_id: int, title: str, message: str, **kw) -> None:
    ids = db.scalars(select(User.id).where(User.learner_id == learner_id, User.is_active.is_(True))).all()
    for uid in ids:
        notify_user(db, uid, title, message, **kw)
