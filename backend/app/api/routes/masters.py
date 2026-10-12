from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import bad_request, not_found, require_admin, require_admin_or_department
from app.models import Batch, BatchEnrollment, Trainer, TrainingVenue, User
from app.repositories import serializers as ser
from app.schemas.requests import TrainerIn, VenueIn
from app.services import audit

router = APIRouter(prefix="/masters", tags=["Masters"])


def _venue_counts(db: Session, venue_id: int) -> int:
    return db.scalar(select(func.count(Batch.id)).where(Batch.venue_id == venue_id)) or 0


def _trainer_counts(db: Session, trainer_id: int) -> int:
    return db.scalar(select(func.count(Batch.id)).where(Batch.trainer_id == trainer_id)) or 0


# ---------------- venues ----------------
@router.get("/venues")
def list_venues(user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    rows = []
    for v in db.scalars(select(TrainingVenue).order_by(TrainingVenue.code)).all():
        item = ser.venue(v)
        item["batches"] = _venue_counts(db, v.id)
        rows.append(item)
    return rows


@router.get("/venues/options")
def venue_options(user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    return [{"id": v.id, "code": v.code, "name": v.name, "city": v.city}
            for v in db.scalars(select(TrainingVenue).where(TrainingVenue.is_active.is_(True)).order_by(TrainingVenue.name)).all()]


@router.post("/venues")
def create_venue(body: VenueIn, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.scalar(select(TrainingVenue.id).where(TrainingVenue.code == body.code)):
        raise bad_request(f"Venue code {body.code} already exists")
    v = TrainingVenue(**body.model_dump())
    db.add(v)
    db.flush()
    audit.record(db, user, "VENUE_CREATED", "TrainingVenue", v.code, details=v.name, request=request)
    db.commit()
    return ser.venue(v)


@router.put("/venues/{venue_id}")
def update_venue(venue_id: int, body: VenueIn, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    v = db.get(TrainingVenue, venue_id)
    if not v:
        raise not_found("Venue")
    clash = db.scalar(select(TrainingVenue.id).where(TrainingVenue.code == body.code, TrainingVenue.id != v.id))
    if clash:
        raise bad_request(f"Venue code {body.code} already exists")
    for k, val in body.model_dump().items():
        setattr(v, k, val)
    audit.record(db, user, "VENUE_UPDATED", "TrainingVenue", v.code, request=request)
    db.commit()
    return ser.venue(v)


# ---------------- trainers ----------------
@router.get("/trainers")
def list_trainers(user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    rows = []
    for t in db.scalars(select(Trainer).order_by(Trainer.code)).all():
        item = ser.trainer(t)
        item["batches"] = _trainer_counts(db, t.id)
        rows.append(item)
    return rows


@router.get("/trainers/options")
def trainer_options(user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    return [{"id": t.id, "code": t.code, "name": t.full_name}
            for t in db.scalars(select(Trainer).where(Trainer.is_active.is_(True)).order_by(Trainer.full_name)).all()]


@router.post("/trainers")
def create_trainer(body: TrainerIn, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.scalar(select(Trainer.id).where(Trainer.code == body.code)):
        raise bad_request(f"Trainer code {body.code} already exists")
    t = Trainer(**body.model_dump())
    db.add(t)
    db.flush()
    audit.record(db, user, "TRAINER_CREATED", "Trainer", t.code, details=t.full_name, request=request)
    db.commit()
    return ser.trainer(t)


@router.put("/trainers/{trainer_id}")
def update_trainer(trainer_id: int, body: TrainerIn, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    t = db.get(Trainer, trainer_id)
    if not t:
        raise not_found("Trainer")
    clash = db.scalar(select(Trainer.id).where(Trainer.code == body.code, Trainer.id != t.id))
    if clash:
        raise bad_request(f"Trainer code {body.code} already exists")
    for k, val in body.model_dump().items():
        setattr(t, k, val)
    audit.record(db, user, "TRAINER_UPDATED", "Trainer", t.code, request=request)
    db.commit()
    return ser.trainer(t)


# ---------------- training calendar ----------------
@router.get("/calendar")
def training_calendar(month: str | None = None, user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    """Batches overlapping the given YYYY-MM month (default: all batches)."""
    stmt = select(Batch).order_by(Batch.start_date)
    if month:
        try:
            y, m = (int(p) for p in month.split("-"))
            start = date(y, m, 1)
            end = date(y + (1 if m == 12 else 0), 1 if m == 12 else m + 1, 1)
        except Exception:
            raise bad_request("month must be in YYYY-MM format")
        stmt = stmt.where(Batch.start_date < end, Batch.end_date >= start)
    rows = []
    for b in db.scalars(stmt).all():
        enrolled = db.scalar(select(func.count(BatchEnrollment.id)).where(BatchEnrollment.batch_id == b.id)) or 0
        rows.append({
            "id": b.id, "code": b.code, "name": b.name, "course": b.course.title, "course_code": b.course.code,
            "mode": b.mode, "status": b.status, "start_date": ser.iso(b.start_date), "end_date": ser.iso(b.end_date),
            "location": b.location, "venue": b.venue.name if b.venue else None,
            "venue_city": b.venue.city if b.venue else None, "trainer": b.trainer.full_name if b.trainer else None,
            "instructor": b.instructor, "capacity": b.capacity, "enrolled": enrolled,
            "department": b.department.name if b.department else "Multi-department",
        })
    return rows
