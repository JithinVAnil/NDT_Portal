from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, verify_password
from app.models import Notification, User
from app.models.base import RoleCode, utcnow
from app.repositories import serializers as ser
from app.schemas.requests import LoginRequest
from app.services import audit

router = APIRouter(prefix="/auth", tags=["Authentication"])

HOME = {RoleCode.ADMIN: "/admin/dashboard", RoleCode.DEPARTMENT: "/department/dashboard", RoleCode.LEARNER: "/learner/dashboard"}


@router.post("/login")
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == body.email))
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        audit.record(db, user if user else None, "LOGIN", "User", user.id if user else None, result="FAILURE",
                     details="Invalid credentials", request=request, email_override=body.email)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    user.last_login_at = utcnow()
    audit.record(db, user, "LOGIN", "User", user.id, request=request)
    db.commit()
    return {
        "access_token": create_access_token(user.id, user.role_code),
        "token_type": "bearer",
        "user": ser.user(user),
        "home": HOME[user.role_code],
    }


@router.post("/logout")
def logout(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    audit.record(db, user, "LOGOUT", "User", user.id, request=request)
    db.commit()
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    unread = db.scalar(select(func.count(Notification.id)).where(Notification.user_id == user.id,
                                                                 Notification.is_read.is_(False))) or 0
    data = ser.user(user)
    data["unread_notifications"] = unread
    data["home"] = HOME[user.role_code]
    if user.learner:
        data["learner_code"] = user.learner.learner_code
    return data
