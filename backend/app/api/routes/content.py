from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import bad_request, not_found, require_admin
from app.models import ContentItem, Course, Lesson, Module, User
from app.models.base import PRODUCTION_STAGES, QC_FIELDS, VIDEO_RESTRICTIONS, RoleCode, utcnow
from app.repositories import serializers as ser
from app.schemas.requests import ContentCreate, ContentUpdate, ProductionStatusUpdate, QcUpdate
from app.services import audit
from app.services.content_service import production_summary
from app.services.notifications import notify_role

router = APIRouter(prefix="/content", tags=["Content Library"])

VIDEO_EXT = {".mp4": "video/mp4", ".webm": "video/webm", ".m4v": "video/mp4"}
CAPTION_EXT = {".vtt": "text/vtt"}


def _get(db: Session, content_id: int) -> ContentItem:
    c = db.get(ContentItem, content_id)
    if not c:
        raise not_found("Content item")
    return c


@router.get("/meta")
def content_meta(user: User = Depends(require_admin)):
    return {
        "production_stages": list(PRODUCTION_STAGES),
        "qc_fields": [{"key": k, "label": v} for k, v in QC_FIELDS],
        "restrictions": [{"key": k, "label": v} for k, v in VIDEO_RESTRICTIONS],
        "overall_statuses": ["Ready", "Pending QC", "Pending Assets", "Needs Review"],
    }


@router.get("/summary")
def summary(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return production_summary(db)


@router.get("")
def list_content(course_id: int | None = None, content_type: str | None = None, production_status: str | None = None,
                 overall_status: str | None = None, q: str | None = None,
                 user: User = Depends(require_admin), db: Session = Depends(get_db)):
    stmt = select(ContentItem).order_by(ContentItem.course_id, ContentItem.code)
    if course_id:
        stmt = stmt.where(ContentItem.course_id == course_id)
    if content_type:
        stmt = stmt.where(ContentItem.content_type == content_type)
    if production_status:
        stmt = stmt.where(ContentItem.production_status == production_status)
    if q:
        stmt = stmt.where(ContentItem.title.ilike(f"%{q.strip()}%"))
    rows = [ser.content(c) for c in db.scalars(stmt).all()]
    if overall_status:
        rows = [r for r in rows if r["overall_status"] == overall_status]
    return rows


@router.get("/{content_id}")
def get_content(content_id: int, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return ser.content(_get(db, content_id), detail=True)


@router.post("")
def create_content(body: ContentCreate, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    course = db.get(Course, body.course_id)
    if not course:
        raise bad_request("Course not found")
    prefix = "VID" if body.content_type == "Video" else "RES"
    n = (db.scalar(select(func.count(ContentItem.id)).where(ContentItem.code.like(f"{prefix}-%"))) or 0) + 1
    code = f"{prefix}-{n:03d}"
    while db.scalar(select(ContentItem.id).where(ContentItem.code == code)):
        n += 1
        code = f"{prefix}-{n:03d}"
    c = ContentItem(code=code, production_status="Idea", compliance={}, **body.model_dump())
    db.add(c)
    db.flush()
    audit.record(db, user, "CONTENT_CREATED", "Content", c.code, details=c.title, request=request)
    db.commit()
    return ser.content(c, detail=True)


@router.put("/{content_id}")
def update_content(content_id: int, body: ContentUpdate, request: Request, user: User = Depends(require_admin),
                   db: Session = Depends(get_db)):
    c = _get(db, content_id)
    data = body.model_dump(exclude_unset=True)
    if "module_id" in data and data["module_id"]:
        m = db.get(Module, data["module_id"])
        if not m or m.course_id != c.course_id:
            raise bad_request("Module does not belong to this course")
    if "lesson_id" in data and data["lesson_id"]:
        l = db.get(Lesson, data["lesson_id"])
        if not l:
            raise bad_request("Lesson not found")
    for k, v in data.items():
        setattr(c, k, v)
    audit.record(db, user, "CONTENT_METADATA_UPDATED", "Content", c.code, details=", ".join(sorted(data)), request=request)
    db.commit()
    return ser.content(c, detail=True)


@router.patch("/{content_id}/qc")
def update_qc(content_id: int, body: QcUpdate, request: Request, user: User = Depends(require_admin),
              db: Session = Depends(get_db)):
    c = _get(db, content_id)
    before = ser.content_status(c)
    data = body.model_dump(exclude_unset=True)
    compliance = data.pop("compliance", None)
    for k, v in data.items():
        setattr(c, k, v)
    if compliance is not None:
        merged = dict(c.compliance or {})
        merged.update({k: bool(v) for k, v in compliance.items() if k in dict(VIDEO_RESTRICTIONS)})
        c.compliance = merged
    c.qc_reviewed_by = user.full_name
    c.qc_reviewed_at = utcnow()
    after = ser.content_status(c)
    audit.record(db, user, "CONTENT_QC", "Content", c.code, details=f"QC status: {before} → {after}", request=request)
    if after == "Ready" and before != "Ready":
        notify_role(db, RoleCode.ADMIN, "Content QC completed", f"{c.code} '{c.title}' passed all QC checks and is Ready.",
                    category="content", severity="success", link=f"/admin/content/{c.id}")
    db.commit()
    return ser.content(c, detail=True)


@router.patch("/{content_id}/production-status")
def update_production(content_id: int, body: ProductionStatusUpdate, request: Request, user: User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    if body.production_status not in PRODUCTION_STAGES:
        raise bad_request("Unknown production status")
    c = _get(db, content_id)
    old = c.production_status
    c.production_status = body.production_status
    audit.record(db, user, "CONTENT_PRODUCTION_STATUS", "Content", c.code, details=f"{old} → {c.production_status}",
                 request=request)
    db.commit()
    return ser.content(c, detail=True)


def _safe_name(code: str, filename: str, allowed: dict[str, str]) -> tuple[str, str]:
    m = re.search(r"(\.[A-Za-z0-9]+)$", filename or "")
    ext = (m.group(1) if m else "").lower()
    if ext not in allowed:
        raise bad_request(f"Unsupported file type. Allowed: {', '.join(allowed)}")
    return f"{code.lower()}-{uuid.uuid4().hex[:8]}{ext}", ext


async def _store(upload: UploadFile, name: str) -> None:
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    limit = settings.max_upload_mb * 1024 * 1024
    size = 0
    path = settings.media_dir / name
    with path.open("wb") as fh:
        while chunk := await upload.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                fh.close()
                path.unlink(missing_ok=True)
                raise bad_request(f"File exceeds {settings.max_upload_mb} MB limit")
            fh.write(chunk)


@router.post("/{content_id}/video")
async def upload_video(content_id: int, request: Request, file: UploadFile = File(...), user: User = Depends(require_admin),
                       db: Session = Depends(get_db)):
    c = _get(db, content_id)
    name, _ = _safe_name(c.code, file.filename or "", VIDEO_EXT)
    await _store(file, name)
    c.video_file = name
    audit.record(db, user, "CONTENT_VIDEO_UPLOADED", "Content", c.code, details=file.filename, request=request)
    db.commit()
    return ser.content(c, detail=True)


@router.post("/{content_id}/captions")
async def upload_captions(content_id: int, request: Request, file: UploadFile = File(...),
                          user: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = _get(db, content_id)
    name, _ = _safe_name(c.code, file.filename or "", CAPTION_EXT)
    await _store(file, name)
    c.captions_file = name
    c.qc_vtt = True
    audit.record(db, user, "CONTENT_CAPTIONS_UPLOADED", "Content", c.code, details=file.filename, request=request)
    db.commit()
    return ser.content(c, detail=True)
