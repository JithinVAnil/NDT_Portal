"""Orchestrates mock NDU sync and stores every sync with old/new values."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.integrations.ndu import get_adapter
from app.models import CompletionRecord, CourseEnrollment, LearnerProgress, NduEnrollment, NduSyncLog, User
from app.models.base import utcnow
from app.services import progress as progress_svc
from app.services.notifications import notify_learner


def _log(db: Session, user: User | None, sync_type: str, *, learner_id=None, course_id=None, field=None,
         old=None, new=None, success=True, message="", direction="Portal → NDU", records=1) -> NduSyncLog:
    log = NduSyncLog(
        sync_type=sync_type, direction=direction, learner_id=learner_id, course_id=course_id, field=field,
        old_value=None if old is None else str(old), new_value=None if new is None else str(new),
        result="Success" if success else "Failure", message=message, records_processed=records,
        triggered_by_id=user.id if user else None, triggered_by_name=user.full_name if user else "System",
    )
    db.add(log)
    return log


def ensure_ndu_enrollment(db: Session, user: User | None, enrollment: CourseEnrollment) -> NduEnrollment:
    adapter = get_adapter()
    ne = db.scalar(
        select(NduEnrollment).where(
            NduEnrollment.learner_id == enrollment.learner_id, NduEnrollment.course_id == enrollment.course_id
        )
    )
    learner = enrollment.learner
    course = enrollment.course
    if ne is None:
        reg = adapter.register_learner(learner.learner_code, learner.email, learner.full_name)
        ne = NduEnrollment(
            learner_id=learner.id, course_id=course.id, enrollment_id=enrollment.id,
            ndu_learner_ref=reg.payload.get("ndu_learner_ref", f"NDU-L-{learner.learner_code}"),
            ndu_course_ref=course.ndu_course_ref or f"NDU-C-{course.code}",
            sync_status="Pending",
        )
        db.add(ne)
        db.flush()
        _log(db, user, "Learner Enrolment", learner_id=learner.id, course_id=course.id, field="ndu_enrollment",
             old="Not enrolled", new="Enrolled", success=reg.success, message=reg.message)
        if reg.success:
            enr = adapter.enroll(ne.ndu_learner_ref, ne.ndu_course_ref)
            ne.learner_synced = True
            ne.sync_status = "Synced" if enr.success else "Failed"
            ne.last_synced_at = utcnow()
    return ne


def sync_learners(db: Session, user: User, learner_id: int | None = None) -> dict:
    adapter = get_adapter()
    stmt = select(CourseEnrollment).where(CourseEnrollment.status.in_(("Onboarded", "Completed", "Not Completed")))
    if learner_id:
        stmt = stmt.where(CourseEnrollment.learner_id == learner_id)
    ok = fail = 0
    for enr in db.scalars(stmt).all():
        ne = ensure_ndu_enrollment(db, user, enr)
        res = adapter.register_learner(enr.learner.learner_code, enr.learner.email, enr.learner.full_name)
        ne.learner_synced = res.success
        ne.sync_status = "Synced" if res.success else "Failed"
        ne.last_synced_at = utcnow()
        ok += res.success
        fail += not res.success
    _log(db, user, "Learner Sync", learner_id=learner_id, field="learner_profile", success=fail == 0,
         message=f"{ok} learner profile(s) synchronised, {fail} failed (demo)", records=ok + fail)
    return {"synced": ok, "failed": fail}


def sync_progress(db: Session, user: User, learner_id: int | None = None) -> dict:
    adapter = get_adapter()
    stmt = select(NduEnrollment)
    if learner_id:
        stmt = stmt.where(NduEnrollment.learner_id == learner_id)
    ok = 0
    for ne in db.scalars(stmt).all():
        prog = db.scalar(select(LearnerProgress).where(
            LearnerProgress.learner_id == ne.learner_id, LearnerProgress.course_id == ne.course_id))
        if not prog:
            continue
        res = adapter.push_progress(ne.ndu_learner_ref, ne.ndu_course_ref, prog.overall_pct)
        old = ne.ndu_progress_pct
        ne.ndu_progress_pct = prog.overall_pct
        ne.progress_synced = res.success
        ne.last_synced_at = utcnow()
        ok += 1
        if learner_id:
            _log(db, user, "Progress Sync", learner_id=ne.learner_id, course_id=ne.course_id, field="progress_pct",
                 old=f"{old:.0f}%", new=f"{prog.overall_pct:.0f}%", success=res.success, message=res.message)
    if not learner_id:
        _log(db, user, "Progress Sync", field="progress_pct", success=True,
             message=f"Progress pushed for {ok} enrolment(s) (demo)", records=ok)
    return {"synced": ok, "failed": 0}


def sync_completion(db: Session, user: User, learner_id: int | None = None) -> dict:
    adapter = get_adapter()
    stmt = select(NduEnrollment)
    if learner_id:
        stmt = stmt.where(NduEnrollment.learner_id == learner_id)
    ok = 0
    for ne in db.scalars(stmt).all():
        rec = db.scalar(select(CompletionRecord).where(
            CompletionRecord.learner_id == ne.learner_id, CompletionRecord.course_id == ne.course_id))
        if not rec:
            continue
        res = adapter.push_completion(ne.ndu_learner_ref, ne.ndu_course_ref, rec.status)
        ne.completion_synced = res.success
        ne.last_synced_at = utcnow()
        ok += 1
    _log(db, user, "Completion Sync", learner_id=learner_id, field="completion_status", success=True,
         message=f"Completion status pushed for {ok} enrolment(s) (demo)", records=ok)
    return {"synced": ok, "failed": 0}


def simulate_update(db: Session, user: User, enrollment: CourseEnrollment) -> dict:
    """Simulate NDU reporting new learning activity → progress changes and is stored."""
    adapter = get_adapter()
    ne = ensure_ndu_enrollment(db, user, enrollment)
    prog = progress_svc.recompute(db, enrollment)
    old_pct = prog.overall_pct
    old_modules, old_content = prog.modules_completed, prog.content_completed
    res = adapter.fetch_learning_update(ne.ndu_learner_ref, ne.ndu_course_ref, prog.modules_completed,
                                        prog.modules_total, prog.content_completed, prog.content_total)
    prog.modules_completed = res.payload["modules_completed"]
    prog.content_completed = res.payload["content_completed"]
    prog.last_source = "NDU"
    progress_svc.touch_activity(db, enrollment.learner_id, enrollment.course_id)
    prog = progress_svc.recompute(db, enrollment)
    ne.ndu_progress_pct = prog.overall_pct
    ne.progress_synced = True
    ne.sync_status = "Synced"
    ne.last_synced_at = utcnow()
    log = _log(
        db, user, "NDU Learning Update", learner_id=enrollment.learner_id, course_id=enrollment.course_id,
        field="overall_progress", old=f"{old_pct:.0f}%", new=f"{prog.overall_pct:.0f}%", success=res.success,
        direction="NDU → Portal",
        message=(f"{res.message}. Modules {old_modules}→{prog.modules_completed}/{prog.modules_total}, "
                 f"videos {old_content}→{prog.content_completed}/{prog.content_total}"),
    )
    if prog.overall_pct != old_pct:
        notify_learner(db, enrollment.learner_id, "NDU sync completed",
                       f"Your progress in {enrollment.course.short_title} was updated from NDU: "
                       f"{old_pct:.0f}% → {prog.overall_pct:.0f}%.", category="ndu", severity="success",
                       link="/learner/progress")
    db.flush()
    return {
        "learner": enrollment.learner.full_name,
        "course": enrollment.course.title,
        "old_progress": old_pct,
        "new_progress": prog.overall_pct,
        "old_modules": old_modules,
        "new_modules": prog.modules_completed,
        "modules_total": prog.modules_total,
        "result": log.result,
        "message": log.message,
        "log_id": log.id,
    }
