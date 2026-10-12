"""Assembles the full learner record (used by admin/department detail and the learner portal)."""
from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Assessment,
    AssessmentResult,
    Attendance,
    AuditLog,
    CompletionRecord,
    ContentItem,
    CourseEnrollment,
    Learner,
    LearnerProgress,
    Module,
    Nomination,
    NduEnrollment,
    NduSyncLog,
    Practical,
    PracticalSubmission,
    TrainingSession,
)
from app.repositories import serializers as ser


def enrollments_bundle(db: Session, learner: Learner) -> list[dict]:
    out = []
    enrs = db.scalars(select(CourseEnrollment).where(CourseEnrollment.learner_id == learner.id)
                      .order_by(CourseEnrollment.allocated_at.desc())).all()
    for e in enrs:
        p = db.scalar(select(LearnerProgress).where(LearnerProgress.enrollment_id == e.id))
        c = db.scalar(select(CompletionRecord).where(CompletionRecord.enrollment_id == e.id))
        ndu = db.scalar(select(NduEnrollment).where(NduEnrollment.learner_id == learner.id,
                                                    NduEnrollment.course_id == e.course_id))
        current_module = db.get(Module, p.current_module_id) if p and p.current_module_id else None
        next_session = None
        if e.batch_id:
            s = db.scalar(select(TrainingSession).where(TrainingSession.batch_id == e.batch_id,
                                                        TrainingSession.session_date >= date.today())
                          .order_by(TrainingSession.session_date, TrainingSession.session_no))
            if s:
                next_session = {"date": ser.iso(s.session_date), "title": s.title, "start_time": s.start_time,
                                "end_time": s.end_time, "mode": s.mode or e.batch.mode,
                                "location": e.batch.location}
        item = ser.enrollment(e)
        item.update({
            "batch_detail": ser.batch(e.batch) if e.batch else None,
            "progress": ser.progress(p, e.batch.code if e.batch else None) if p else None,
            "current_module": {"id": current_module.id, "title": current_module.title,
                               "sequence": current_module.sequence} if current_module else None,
            "completion": {"status": c.status, "criteria": c.criteria, "certificate_no": c.certificate_no,
                           "completed_at": ser.iso(c.completed_at), "evaluated_at": ser.iso(c.evaluated_at)} if c else None,
            "ndu": {"ndu_learner_ref": ndu.ndu_learner_ref, "ndu_course_ref": ndu.ndu_course_ref,
                    "sync_status": ndu.sync_status, "last_synced_at": ser.iso(ndu.last_synced_at),
                    "ndu_progress_pct": ndu.ndu_progress_pct, "progress_synced": ndu.progress_synced,
                    "completion_synced": ndu.completion_synced} if ndu else None,
            "next_session": next_session,
        })
        out.append(item)
    return out


def attendance_records(db: Session, learner_id: int) -> list[dict]:
    rows = db.execute(
        select(Attendance, TrainingSession).join(TrainingSession, TrainingSession.id == Attendance.session_id)
        .where(Attendance.learner_id == learner_id).order_by(TrainingSession.session_date.desc())
    ).all()
    return [{"id": a.id, "date": ser.iso(s.session_date), "session_no": s.session_no, "title": s.title,
             "batch_id": s.batch_id, "status": a.status, "remarks": a.remarks} for a, s in rows]


def full_profile(db: Session, learner: Learner) -> dict:
    noms = db.scalars(select(Nomination).where(Nomination.learner_id == learner.id).order_by(Nomination.created_at.desc())).all()
    results = db.scalars(select(AssessmentResult).where(AssessmentResult.learner_id == learner.id)
                         .order_by(AssessmentResult.evaluated_at.desc())).all()
    subs = db.scalars(select(PracticalSubmission).where(PracticalSubmission.learner_id == learner.id)).all()
    sync = db.scalars(select(NduSyncLog).where(NduSyncLog.learner_id == learner.id)
                      .order_by(NduSyncLog.created_at.desc()).limit(10)).all()
    activity = db.scalars(select(AuditLog).where(AuditLog.entity_id.in_([learner.learner_code] + [n.nomination_no for n in noms]))
                          .order_by(AuditLog.created_at.desc()).limit(15)).all()
    return {
        "learner": ser.learner(learner),
        "enrollments": enrollments_bundle(db, learner),
        "nominations": [{"id": n.id, "nomination_no": n.nomination_no, "course": n.course.title, "status": n.status,
                         "training_mode": n.training_mode, "created_at": ser.iso(n.created_at)} for n in noms],
        "assessment_results": [ser.result(r) for r in results],
        "practical_submissions": [ser.submission(s) for s in subs],
        "attendance": attendance_records(db, learner.id),
        "ndu_sync_logs": [ser.sync_log(s) for s in sync],
        "activity": [ser.audit_log(a) for a in activity],
    }


def course_tree(db: Session, course_id: int, learner_id: int | None = None) -> dict:
    """Course → Module → Lesson → Content → Practical/Exercise → Assessment → Rubric, with learner status overlay."""
    from app.models import Course, Exercise

    course = db.get(Course, course_id)
    modules = db.scalars(select(Module).where(Module.course_id == course_id).order_by(Module.sequence)).all()
    contents = db.scalars(select(ContentItem).where(ContentItem.course_id == course_id)).all()
    practicals = db.scalars(select(Practical).where(Practical.course_id == course_id)).all()
    exercises = db.scalars(select(Exercise).where(Exercise.course_id == course_id)).all()
    assessments = db.scalars(select(Assessment).where(Assessment.course_id == course_id).order_by(Assessment.sequence)).all()

    prog = None
    results: dict[int, AssessmentResult] = {}
    subs: dict[int, PracticalSubmission] = {}
    if learner_id:
        prog = db.scalar(select(LearnerProgress).where(LearnerProgress.learner_id == learner_id,
                                                       LearnerProgress.course_id == course_id))
        results = {r.assessment_id: r for r in db.scalars(select(AssessmentResult).where(
            AssessmentResult.learner_id == learner_id, AssessmentResult.course_id == course_id)).all()}
        subs = {s.practical_id: s for s in db.scalars(select(PracticalSubmission).where(
            PracticalSubmission.learner_id == learner_id)).all()}

    def assessment_dict(a: Assessment) -> dict:
        d = {"id": a.id, "code": a.code, "title": a.title, "type": a.assessment_type, "max_score": a.max_score,
             "pass_percentage": a.pass_percentage, "module_id": a.module_id, "has_answer_key": a.has_answer_key,
             "rubric": ser.rubric(a.rubric) if a.rubric else None}
        if learner_id:
            r = results.get(a.id)
            d["result"] = {"score": r.score, "max_score": r.max_score, "percentage": r.percentage, "passed": r.passed,
                           "remarks": r.remarks, "evaluated_at": ser.iso(r.evaluated_at)} if r else None
        return d

    def practical_dict(p: Practical) -> dict:
        d = ser.practical(p)
        if learner_id:
            s = subs.get(p.id)
            d["submission"] = ser.submission(s) if s else None
        return d

    tree_modules = []
    for m in modules:
        mod_status = None
        if prog:
            mod_status = "Completed" if m.sequence <= prog.modules_completed else (
                "In Progress" if m.sequence == prog.modules_completed + 1 else "Not Started")
        lessons = []
        for l in m.lessons:
            lessons.append({
                "id": l.id, "sequence": l.sequence, "title": l.title, "objective": l.objective,
                "content": [ser.content(c) for c in contents if c.lesson_id == l.id],
                "exercises": [{"id": e.id, "code": e.code, "title": e.title, "type": e.exercise_type,
                               "description": e.description, "has_answer_key": e.has_answer_key, "max_score": e.max_score}
                              for e in exercises if e.lesson_id == l.id],
            })
        tree_modules.append({
            "id": m.id, "sequence": m.sequence, "title": m.title, "description": m.description,
            "duration_minutes": m.duration_minutes, "status": mod_status, "lessons": lessons,
            "content": [ser.content(c) for c in contents if c.module_id == m.id and c.lesson_id is None],
            "exercises": [{"id": e.id, "code": e.code, "title": e.title, "type": e.exercise_type,
                           "description": e.description, "has_answer_key": e.has_answer_key, "max_score": e.max_score}
                          for e in exercises if e.module_id == m.id and e.lesson_id is None],
            "practicals": [practical_dict(p) for p in practicals if p.module_id == m.id],
            "assessments": [assessment_dict(a) for a in assessments if a.module_id == m.id],
        })
    return {
        "course": {
            "id": course.id, "code": course.code, "title": course.title, "short_title": course.short_title,
            "description": course.description, "level": course.level, "version": course.version,
            "delivery_mode": course.delivery_mode, "planned_hours": course.planned_hours,
            "target_video_hours": course.target_video_hours, "min_qualification": course.min_qualification,
            "target_audience": course.target_audience, "ndu_course_ref": course.ndu_course_ref,
            "pass_percentage": course.pass_percentage, "min_attendance": course.min_attendance,
            "prerequisite": course.prerequisite.title if course.prerequisite else None,
        },
        "modules": tree_modules,
        "course_assessments": [assessment_dict(a) for a in assessments if a.module_id is None],
        "course_practicals": [practical_dict(p) for p in practicals if p.module_id is None],
        "counts": {
            "modules": len(modules), "lessons": sum(len(m.lessons) for m in modules),
            "videos": sum(1 for c in contents if c.content_type == "Video"),
            "resources": sum(1 for c in contents if c.content_type != "Video"),
            "video_minutes": round(sum(c.duration_minutes or 0 for c in contents if c.content_type == "Video"), 1),
            "practicals": len(practicals), "exercises": len(exercises), "assessments": len(assessments),
            "rubrics": len({a.rubric_id for a in assessments if a.rubric_id} | {p.rubric_id for p in practicals if p.rubric_id}),
        },
        "progress": ser.progress(prog) if prog else None,
    }
