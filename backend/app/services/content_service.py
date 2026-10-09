"""Digital Content Library aggregates — content production & QC dashboards."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Assessment, ContentItem, Course, Exercise, Practical, Rubric
from app.models.base import PRODUCTION_STAGES
from app.repositories.serializers import content_status
from app.services.settings_service import get_setting


def production_summary(db: Session) -> dict:
    videos = db.scalars(select(ContentItem).where(ContentItem.content_type == "Video")).all()
    resources = db.scalar(select(func.count(ContentItem.id)).where(ContentItem.content_type != "Video")) or 0
    target = float(get_setting(db, "programme").get("content_target_hours", 25.5))
    total_minutes = sum(v.duration_minutes or 0 for v in videos)
    statuses = [content_status(v) for v in videos]
    ready_minutes = sum(v.duration_minutes or 0 for v, s in zip(videos, statuses) if s == "Ready")
    by_stage = {s: 0 for s in PRODUCTION_STAGES}
    for v in videos:
        by_stage[v.production_status] = by_stage.get(v.production_status, 0) + 1
    by_course = []
    for c in db.scalars(select(Course).order_by(Course.id)).all():
        cv = [v for v in videos if v.course_id == c.id]
        by_course.append({
            "course": c.short_title, "code": c.code, "videos": len(cv),
            "hours": round(sum(v.duration_minutes or 0 for v in cv) / 60, 2),
            "target_hours": c.target_video_hours,
        })
    return {
        "total_videos": len(videos),
        "total_resources": resources,
        "total_minutes": round(total_minutes, 1),
        "total_hours": round(total_minutes / 60, 2),
        "ready_hours": round(ready_minutes / 60, 2),
        "target_hours": target,
        "produced_pct": round(100 * total_minutes / 60 / target, 1) if target else 0,
        "videos_ready": statuses.count("Ready"),
        "videos_pending": len(videos) - statuses.count("Ready"),
        "videos_pending_qc": statuses.count("Pending QC"),
        "videos_pending_assets": statuses.count("Pending Assets"),
        "videos_needs_review": statuses.count("Needs Review"),
        "missing_captions": sum(1 for v in videos if not (v.qc_srt and v.qc_vtt)),
        "missing_transcripts": sum(1 for v in videos if not (v.qc_docx and v.qc_pdf)),
        "with_video_file": sum(1 for v in videos if v.video_file),
        "practicals": db.scalar(select(func.count(Practical.id))) or 0,
        "exercises": db.scalar(select(func.count(Exercise.id))) or 0,
        "assessments": db.scalar(select(func.count(Assessment.id))) or 0,
        "rubrics": db.scalar(select(func.count(Rubric.id))) or 0,
        "by_stage": [{"stage": k, "count": v} for k, v in by_stage.items()],
        "by_course": by_course,
        "by_status": [{"status": s, "count": statuses.count(s)} for s in ("Ready", "Pending QC", "Pending Assets", "Needs Review")],
    }
