"""Model → JSON-safe dict serializers used by API routes and reports."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from app.models import (
    AssessmentResult,
    AuditLog,
    Batch,
    ContentItem,
    CourseEnrollment,
    Department,
    Learner,
    LearnerProgress,
    Nomination,
    NduSyncLog,
    Notification,
    Practical,
    PracticalSubmission,
    Trainer,
    TrainingVenue,
    User,
)
from app.models.base import PRODUCTION_STAGES, QC_FIELDS, VIDEO_RESTRICTIONS


def iso(v: datetime | date | None) -> str | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.replace(microsecond=0).isoformat() + "Z"
    return v.isoformat()


def department(d: Department | None) -> dict | None:
    if d is None:
        return None
    return {
        "id": d.id, "code": d.code, "name": d.name, "ministry": d.ministry, "category": d.category,
        "location": d.location, "contact_name": d.contact_name, "contact_email": d.contact_email,
        "is_active": d.is_active,
    }


def user(u: User) -> dict:
    return {
        "id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role_code, "role_name": u.role.name,
        "department_id": u.department_id, "department": u.department.name if u.department else None,
        "department_code": u.department.code if u.department else None,
        "learner_id": u.learner_id, "designation": u.designation, "is_active": u.is_active,
        "last_login_at": iso(u.last_login_at),
    }


def learner(l: Learner) -> dict:
    return {
        "id": l.id, "learner_code": l.learner_code, "employee_id": l.employee_id, "full_name": l.full_name,
        "email": l.email, "mobile": l.mobile, "designation": l.designation, "qualification": l.qualification,
        "department_id": l.department_id, "department": l.department.name if l.department else None,
        "department_code": l.department.code if l.department else None, "location": l.location,
        "status": l.status, "last_activity_at": iso(l.last_activity_at), "created_at": iso(l.created_at),
    }


def nomination(n: Nomination) -> dict:
    return {
        "id": n.id, "nomination_no": n.nomination_no, "status": n.status, "training_mode": n.training_mode,
        "eligibility_result": n.eligibility_result, "justification": n.justification,
        "decision_remarks": n.decision_remarks,
        "learner": learner(n.learner),
        "department_id": n.department_id, "department": n.department.name, "department_code": n.department.code,
        "course_id": n.course_id, "course": n.course.title, "course_code": n.course.code,
        "allocated_course_id": n.allocated_course_id,
        "allocated_course": n.allocated_course.title if n.allocated_course else None,
        "allocated_batch_id": n.allocated_batch_id,
        "allocated_batch": n.allocated_batch.code if n.allocated_batch else None,
        "created_by": n.created_by.full_name if n.created_by else None,
        "reviewed_by": n.reviewed_by.full_name if n.reviewed_by else None,
        "created_at": iso(n.created_at), "submitted_at": iso(n.submitted_at), "reviewed_at": iso(n.reviewed_at),
        "onboarded_at": iso(n.onboarded_at), "updated_at": iso(n.updated_at),
    }


def batch(b: Batch, enrolled: int | None = None) -> dict:
    return {
        "id": b.id, "code": b.code, "name": b.name, "course_id": b.course_id, "course": b.course.title,
        "course_code": b.course.code, "department_id": b.department_id,
        "department": b.department.name if b.department else "Multi-department",
        "department_code": b.department.code if b.department else None,
        "mode": b.mode, "location": b.location, "start_date": iso(b.start_date), "end_date": iso(b.end_date),
        "capacity": b.capacity, "instructor": b.instructor, "status": b.status, "enrolled": enrolled,
        "venue_id": b.venue_id, "venue": b.venue.name if b.venue else None,
        "venue_city": b.venue.city if b.venue else None,
        "trainer_id": b.trainer_id, "trainer": b.trainer.full_name if b.trainer else None,
    }


def content_status(c: ContentItem) -> str:
    """Overall QC status: Ready / Pending Assets / Pending QC / Needs Review."""
    if c.qc_needs_review:
        return "Needs Review"
    assets_ok = c.qc_srt and c.qc_vtt and c.qc_docx and c.qc_pdf
    qc_ok = c.qc_original_content and c.qc_human_review and c.qc_audio and c.qc_technical and c.qc_ai_disclosure
    compliance_ok = all((c.compliance or {}).get(k, False) for k, _ in VIDEO_RESTRICTIONS)
    if assets_ok and qc_ok and compliance_ok:
        return "Ready"
    if not assets_ok:
        return "Pending Assets"
    return "Pending QC"


def content(c: ContentItem, detail: bool = False) -> dict:
    d: dict[str, Any] = {
        "id": c.id, "code": c.code, "content_type": c.content_type, "title": c.title, "description": c.description,
        "course_id": c.course_id, "course": c.course.title, "course_code": c.course.code,
        "module_id": c.module_id, "module": c.module.title if c.module else None,
        "module_sequence": c.module.sequence if c.module else None,
        "lesson_id": c.lesson_id, "lesson": c.lesson.title if c.lesson else None,
        "instructor": c.instructor, "duration_minutes": c.duration_minutes, "learning_objective": c.learning_objective,
        "is_deep_dive": c.is_deep_dive, "production_status": c.production_status,
        "production_stage_index": PRODUCTION_STAGES.index(c.production_status) if c.production_status in PRODUCTION_STAGES else 0,
        "practical_id": c.practical_id, "exercise_id": c.exercise_id, "assessment_id": c.assessment_id,
        "resolution": c.resolution, "aspect_ratio": c.aspect_ratio, "frame_rate": c.frame_rate,
        "file_format": c.file_format, "codec": c.codec, "audio_sample_rate": c.audio_sample_rate,
        "has_video": bool(c.video_file), "has_captions": bool(c.captions_file),
        "video_url": f"/media/{c.video_file}" if c.video_file else None,
        "captions_url": f"/media/{c.captions_file}" if c.captions_file else None,
        "qc": {f: bool(getattr(c, f)) for f, _ in QC_FIELDS},
        "qc_needs_review": c.qc_needs_review, "qc_notes": c.qc_notes, "qc_reviewed_by": c.qc_reviewed_by,
        "qc_reviewed_at": iso(c.qc_reviewed_at),
        "overall_status": content_status(c),
        "ai_used": c.ai_used, "ai_tool": c.ai_tool, "ai_purpose": c.ai_purpose,
        "ai_human_reviewer": c.ai_human_reviewer, "ai_disclosure_text": c.ai_disclosure_text,
        "compliance": {k: bool((c.compliance or {}).get(k, False)) for k, _ in VIDEO_RESTRICTIONS},
        "updated_at": iso(c.updated_at),
    }
    if detail:
        d["practical"] = {"id": c.practical.id, "code": c.practical.code, "title": c.practical.title} if c.practical else None
        d["exercise"] = {"id": c.exercise.id, "code": c.exercise.code, "title": c.exercise.title} if c.exercise else None
        d["assessment"] = (
            {"id": c.assessment.id, "code": c.assessment.code, "title": c.assessment.title,
             "type": c.assessment.assessment_type} if c.assessment else None
        )
        d["technical_compliance"] = technical_compliance(c)
    return d


def technical_compliance(c: ContentItem) -> list[dict]:
    fps_ok = (c.frame_rate or "").strip() in ("25", "30", "25 fps", "30 fps")
    try:
        sr = float((c.audio_sample_rate or "0").lower().replace("khz", "").strip())
    except ValueError:
        sr = 0
    dur = c.duration_minutes or 0
    dur_ok = (8 <= dur <= 12) or (c.is_deep_dive and dur <= 20)
    return [
        {"label": "Full HD 1920×1080", "met": (c.resolution or "").replace(" ", "") in ("1920x1080", "1920×1080")},
        {"label": "16:9 aspect ratio", "met": c.aspect_ratio == "16:9"},
        {"label": "25/30 FPS", "met": fps_ok},
        {"label": "MP4 container", "met": (c.file_format or "").upper() == "MP4"},
        {"label": "H.264 / H.265 codec", "met": (c.codec or "").upper() in ("H.264", "H.265", "H264", "H265")},
        {"label": "Audio ≥ 48 kHz", "met": sr >= 48},
        {"label": "Duration 8–12 min (deep dive ≤ 20 min)", "met": dur_ok},
    ]


def enrollment(e: CourseEnrollment) -> dict:
    return {
        "id": e.id, "learner_id": e.learner_id, "learner": e.learner.full_name, "learner_code": e.learner.learner_code,
        "course_id": e.course_id, "course": e.course.title, "course_code": e.course.code,
        "batch_id": e.batch_id, "batch": e.batch.code if e.batch else None, "status": e.status,
        "allocated_at": iso(e.allocated_at), "onboarded_at": iso(e.onboarded_at),
    }


def progress(p: LearnerProgress, batch_code: str | None = None) -> dict:
    return {
        "id": p.id, "enrollment_id": p.enrollment_id, "learner_id": p.learner_id,
        "learner": p.learner.full_name, "learner_code": p.learner.learner_code,
        "department_id": p.learner.department_id,
        "department_code": p.learner.department.code if p.learner.department else None,
        "course_id": p.course_id, "course": p.course.title, "course_code": p.course.code, "batch": batch_code,
        "overall_pct": p.overall_pct, "expected_pct": p.expected_pct, "schedule_pct": p.schedule_pct,
        "modules_completed": p.modules_completed, "modules_total": p.modules_total,
        "content_completed": p.content_completed, "content_total": p.content_total,
        "practicals_completed": p.practicals_completed, "practicals_total": p.practicals_total,
        "assessments_completed": p.assessments_completed, "assessments_passed": p.assessments_passed,
        "assessments_failed": p.assessments_failed, "assessments_total": p.assessments_total,
        "attendance_pct": p.attendance_pct, "sessions_attended": p.sessions_attended,
        "sessions_marked": p.sessions_marked, "average_score": p.average_score,
        "risk_level": p.risk_level, "risk_reasons": p.risk_reasons or [],
        "current_module_id": p.current_module_id, "last_activity_at": iso(p.last_activity_at),
        "last_source": p.last_source, "updated_at": iso(p.updated_at),
    }


def result(r: AssessmentResult) -> dict:
    return {
        "id": r.id, "assessment_id": r.assessment_id, "assessment": r.assessment.title,
        "assessment_code": r.assessment.code, "assessment_type": r.assessment.assessment_type,
        "learner_id": r.learner_id, "learner": r.learner.full_name, "learner_code": r.learner.learner_code,
        "department_code": r.learner.department.code if r.learner.department else None,
        "course_id": r.course_id, "course": r.assessment.course.title, "module_id": r.module_id,
        "module": r.assessment.module.title if r.assessment.module else None,
        "score": r.score, "max_score": r.max_score, "percentage": r.percentage, "passed": r.passed,
        "remarks": r.remarks, "evaluator": r.evaluator_name, "evaluated_at": iso(r.evaluated_at),
    }


def practical(p: Practical) -> dict:
    return {
        "id": p.id, "code": p.code, "title": p.title, "course_id": p.course_id, "course": p.course.title,
        "module_id": p.module_id, "module": p.module.title if p.module else None, "scenario": p.scenario,
        "objective": p.objective, "instructions": p.instructions or [], "tools": p.tools, "max_score": p.max_score,
        "estimated_minutes": p.estimated_minutes,
        "rubric": rubric(p.rubric) if p.rubric else None,
    }


def rubric(r) -> dict:
    return {"id": r.id, "title": r.title, "course_id": r.course_id, "description": r.description,
            "criteria": r.criteria or [], "total_score": r.total_score}


def submission(s: PracticalSubmission) -> dict:
    return {
        "id": s.id, "practical_id": s.practical_id, "practical": s.practical.title, "practical_code": s.practical.code,
        "learner_id": s.learner_id, "learner": s.learner.full_name, "learner_code": s.learner.learner_code,
        "status": s.status, "score": s.score, "max_score": s.practical.max_score, "rubric_scores": s.rubric_scores,
        "remarks": s.remarks, "submitted_at": iso(s.submitted_at), "evaluated_at": iso(s.evaluated_at),
        "completed": s.status == "Evaluated",
    }


def audit_log(a: AuditLog) -> dict:
    return {
        "id": a.id, "timestamp": iso(a.created_at), "user": a.user_name or a.user_email or "System",
        "user_email": a.user_email, "role": a.role, "action": a.action, "entity": a.entity,
        "entity_id": a.entity_id, "result": a.result, "details": a.details, "ip_address": a.ip_address,
    }


def notification(n: Notification) -> dict:
    return {
        "id": n.id, "title": n.title, "message": n.message, "category": n.category, "severity": n.severity,
        "link": n.link, "is_read": n.is_read, "created_at": iso(n.created_at),
    }


def sync_log(s: NduSyncLog) -> dict:
    return {
        "id": s.id, "timestamp": iso(s.created_at), "sync_type": s.sync_type, "direction": s.direction,
        "learner_id": s.learner_id, "learner": s.learner.full_name if s.learner else "All learners",
        "learner_code": s.learner.learner_code if s.learner else None,
        "course": s.course.title if s.course else "All courses", "field": s.field,
        "old_value": s.old_value, "new_value": s.new_value, "result": s.result, "message": s.message,
        "records_processed": s.records_processed, "triggered_by": s.triggered_by_name,
    }


def venue(v: TrainingVenue) -> dict:
    return {
        "id": v.id, "code": v.code, "name": v.name, "city": v.city, "address": v.address,
        "capacity": v.capacity, "facilities": v.facilities, "is_active": v.is_active,
        "created_at": iso(v.created_at),
    }


def trainer(t: Trainer) -> dict:
    return {
        "id": t.id, "code": t.code, "full_name": t.full_name, "email": t.email,
        "expertise": t.expertise, "organization": t.organization, "is_active": t.is_active,
        "created_at": iso(t.created_at),
    }
