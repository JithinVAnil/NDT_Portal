"""Dashboard aggregates — every number is computed from database rows."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AssessmentResult,
    Attendance,
    Batch,
    BatchEnrollment,
    CompletionRecord,
    ContentItem,
    Course,
    CourseEnrollment,
    Department,
    Learner,
    LearnerProgress,
    Nomination,
    Practical,
    TrainingSession,
)
from app.models.base import CompletionStatus, NominationStatus as S, RiskLevel

STARTED = ("Onboarded", "Completed", "Not Completed")


def _learner_filter(dept_id: int | None):
    return select(Learner.id).where(Learner.department_id == dept_id) if dept_id else None


def _avg(values: list[float]) -> float | None:
    vals = [v for v in values if v is not None]
    return round(sum(vals) / len(vals), 1) if vals else None


def kpis(db: Session, dept_id: int | None = None) -> dict:
    lf = _learner_filter(dept_id)

    def scoped(stmt, col):
        return stmt.where(col.in_(lf)) if lf is not None else stmt

    learners = db.scalar(scoped(select(func.count(Learner.id)), Learner.id)) or 0
    departments = db.scalar(select(func.count(Department.id)).where(Department.is_active.is_(True))) or 0
    nom_q = select(Nomination.status, func.count(Nomination.id)).group_by(Nomination.status)
    if dept_id:
        nom_q = nom_q.where(Nomination.department_id == dept_id)
    nom_counts = {s: c for s, c in db.execute(nom_q).all()}
    pending_admin = sum(nom_counts.get(s, 0) for s in (S.SUBMITTED, S.UNDER_REVIEW, S.ELIGIBLE))
    pending_dept = pending_admin + nom_counts.get(S.DRAFT, 0)
    approved = sum(nom_counts.get(s, 0) for s in (S.APPROVED, S.ALLOCATED, S.ONBOARDED))

    # Batches
    if dept_id:
        batch_ids = select(BatchEnrollment.batch_id).where(BatchEnrollment.learner_id.in_(lf))
        active_batches = db.scalar(select(func.count(Batch.id)).where(
            Batch.status == "Active", (Batch.id.in_(batch_ids)) | (Batch.department_id == dept_id))) or 0
    else:
        active_batches = db.scalar(select(func.count(Batch.id)).where(Batch.status == "Active")) or 0

    enrolments = db.scalar(scoped(select(func.count(CourseEnrollment.id)), CourseEnrollment.learner_id)) or 0

    att_rows = db.execute(scoped(select(Attendance.status, func.count(Attendance.id)).group_by(Attendance.status),
                                 Attendance.learner_id)).all()
    ac = {s: c for s, c in att_rows}
    attended = ac.get("Present", 0) + ac.get("Late", 0)
    marked = attended + ac.get("Absent", 0)
    attendance_rate = round(100 * attended / marked, 1) if marked else None

    prog_rows = db.execute(scoped(
        select(LearnerProgress.overall_pct, LearnerProgress.risk_level, LearnerProgress.learner_id)
        .join(CourseEnrollment, CourseEnrollment.id == LearnerProgress.enrollment_id)
        .where(CourseEnrollment.status.in_(STARTED)), LearnerProgress.learner_id)).all()
    avg_progress = _avg([r[0] for r in prog_rows])
    at_risk_learners = len({r[2] for r in prog_rows if r[1] in (RiskLevel.AT_RISK, RiskLevel.CRITICAL)})
    critical_learners = len({r[2] for r in prog_rows if r[1] == RiskLevel.CRITICAL})

    avg_score = db.scalar(scoped(select(func.avg(AssessmentResult.percentage)), AssessmentResult.learner_id))
    avg_score = round(float(avg_score), 1) if avg_score is not None else None

    comp_rows = db.execute(scoped(select(CompletionRecord.status, func.count(CompletionRecord.id))
                                  .group_by(CompletionRecord.status), CompletionRecord.learner_id)).all()
    cc = {s: c for s, c in comp_rows}
    completed = cc.get(CompletionStatus.COMPLETED, 0)
    started = len(prog_rows)
    completion_rate = round(100 * completed / started, 1) if started else None

    return {
        "departments": departments,
        "learners": learners,
        "pending_nominations": pending_dept if dept_id else pending_admin,
        "approved_nominations": approved,
        "total_nominations": sum(nom_counts.values()),
        "nomination_status": nom_counts,
        "active_batches": active_batches,
        "enrolments": enrolments,
        "attendance_rate": attendance_rate,
        "average_progress": avg_progress,
        "average_score": avg_score,
        "completed": completed,
        "completion_rate": completion_rate,
        "eligible_for_completion": cc.get(CompletionStatus.ELIGIBLE, 0),
        "at_risk_learners": at_risk_learners,
        "critical_learners": critical_learners,
        "active_learners": started,
    }


def charts(db: Session, dept_id: int | None = None) -> dict:
    lf = _learner_filter(dept_id)
    courses = db.scalars(select(Course).order_by(Course.id)).all()

    def scoped(stmt, col):
        return stmt.where(col.in_(lf)) if lf is not None else stmt

    # Learners by course & completion by course
    enr = db.execute(scoped(select(CourseEnrollment.course_id, func.count(CourseEnrollment.id))
                            .group_by(CourseEnrollment.course_id), CourseEnrollment.learner_id)).all()
    enr_map = dict(enr)
    comp = db.execute(scoped(select(CompletionRecord.course_id, CompletionRecord.status, func.count(CompletionRecord.id))
                             .group_by(CompletionRecord.course_id, CompletionRecord.status), CompletionRecord.learner_id)).all()
    comp_map: dict[int, dict[str, int]] = defaultdict(dict)
    for cid, st, c in comp:
        comp_map[cid][st] = c

    score_rows = db.execute(scoped(select(AssessmentResult.course_id, AssessmentResult.percentage, AssessmentResult.passed),
                                   AssessmentResult.learner_id)).all()
    score_map: dict[int, list] = defaultdict(list)
    for cid, pct, passed in score_rows:
        score_map[cid].append((pct, passed))

    learners_by_course, completion_by_course, assessment_perf = [], [], []
    for c in courses:
        learners_by_course.append({"course": c.short_title, "code": c.code, "learners": enr_map.get(c.id, 0)})
        cm = comp_map.get(c.id, {})
        completion_by_course.append({
            "course": c.short_title, "code": c.code,
            "Completed": cm.get(CompletionStatus.COMPLETED, 0),
            "Eligible": cm.get(CompletionStatus.ELIGIBLE, 0),
            "In Progress": cm.get(CompletionStatus.IN_PROGRESS, 0),
            "Not Completed": cm.get(CompletionStatus.NOT_COMPLETED, 0),
        })
        sm = score_map.get(c.id, [])
        assessment_perf.append({
            "course": c.short_title, "code": c.code,
            "average_score": round(sum(p for p, _ in sm) / len(sm), 1) if sm else 0,
            "pass_rate": round(100 * sum(1 for _, ok in sm if ok) / len(sm), 1) if sm else 0,
            "results": len(sm),
        })

    # Attendance trend — weekly over the last 8 weeks
    today = date.today()
    start = today - timedelta(weeks=8)
    att = db.execute(scoped(select(TrainingSession.session_date, Attendance.status)
                            .join(TrainingSession, TrainingSession.id == Attendance.session_id)
                            .where(TrainingSession.session_date >= start), Attendance.learner_id)).all()
    weeks: dict[date, list[int]] = {}
    for d, st in att:
        wk = d - timedelta(days=d.weekday())
        bucket = weeks.setdefault(wk, [0, 0])
        if st in ("Present", "Late"):
            bucket[0] += 1
            bucket[1] += 1
        elif st == "Absent":
            bucket[1] += 1
    attendance_trend = [
        {"week": wk.strftime("%d %b"), "rate": round(100 * a / m, 1) if m else None, "marked": m}
        for wk, (a, m) in sorted(weeks.items())
    ]

    # Risk distribution
    risk = db.execute(scoped(select(LearnerProgress.risk_level, func.count(LearnerProgress.id))
                             .join(CourseEnrollment, CourseEnrollment.id == LearnerProgress.enrollment_id)
                             .where(CourseEnrollment.status.in_(STARTED))
                             .group_by(LearnerProgress.risk_level), LearnerProgress.learner_id)).all()
    rmap = dict(risk)
    risk_distribution = [
        {"level": "On Track", "key": RiskLevel.ON_TRACK, "count": rmap.get(RiskLevel.ON_TRACK, 0)},
        {"level": "At Risk", "key": RiskLevel.AT_RISK, "count": rmap.get(RiskLevel.AT_RISK, 0)},
        {"level": "Critical", "key": RiskLevel.CRITICAL, "count": rmap.get(RiskLevel.CRITICAL, 0)},
        {"level": "Not Started", "key": RiskLevel.NOT_STARTED, "count": rmap.get(RiskLevel.NOT_STARTED, 0)},
    ]

    # Progress distribution buckets
    progs = db.execute(scoped(select(LearnerProgress.overall_pct)
                              .join(CourseEnrollment, CourseEnrollment.id == LearnerProgress.enrollment_id)
                              .where(CourseEnrollment.status.in_(STARTED)), LearnerProgress.learner_id)).scalars().all()
    buckets = [("0–24%", 0, 25), ("25–49%", 25, 50), ("50–69%", 50, 70), ("70–89%", 70, 90), ("90–100%", 90, 101)]
    progress_distribution = [{"range": n, "learners": sum(1 for p in progs if lo <= p < hi)} for n, lo, hi in buckets]

    out = {
        "learners_by_course": learners_by_course,
        "completion_by_course": completion_by_course,
        "assessment_performance": assessment_perf,
        "attendance_trend": attendance_trend,
        "risk_distribution": risk_distribution,
        "progress_distribution": progress_distribution,
    }
    if not dept_id:
        out["department_performance"] = department_performance(db)
    return out


def department_performance(db: Session) -> list[dict]:
    rows = []
    for d in db.scalars(select(Department).where(Department.is_active.is_(True)).order_by(Department.code)).all():
        k = kpis(db, d.id)
        rows.append({
            "department_id": d.id, "department": d.code, "name": d.name, "learners": k["learners"],
            "average_progress": k["average_progress"] or 0, "attendance_rate": k["attendance_rate"] or 0,
            "average_score": k["average_score"] or 0, "completed": k["completed"], "at_risk": k["at_risk_learners"],
        })
    return rows


def course_cards(db: Session, dept_id: int | None = None) -> list[dict]:
    lf = _learner_filter(dept_id)
    cards = []
    for c in db.scalars(select(Course).order_by(Course.id)).all():
        def q(stmt, col):
            return stmt.where(col.in_(lf)) if lf is not None else stmt
        learners = db.scalar(q(select(func.count(CourseEnrollment.id)).where(CourseEnrollment.course_id == c.id),
                               CourseEnrollment.learner_id)) or 0
        started = db.scalar(q(select(func.count(CourseEnrollment.id)).where(
            CourseEnrollment.course_id == c.id, CourseEnrollment.status.in_(STARTED)), CourseEnrollment.learner_id)) or 0
        completed = db.scalar(q(select(func.count(CompletionRecord.id)).where(
            CompletionRecord.course_id == c.id, CompletionRecord.status == CompletionStatus.COMPLETED),
            CompletionRecord.learner_id)) or 0
        avg = db.scalar(q(select(func.avg(AssessmentResult.percentage)).where(AssessmentResult.course_id == c.id),
                          AssessmentResult.learner_id))
        videos = db.execute(select(func.count(ContentItem.id), func.coalesce(func.sum(ContentItem.duration_minutes), 0))
                            .where(ContentItem.course_id == c.id, ContentItem.content_type == "Video")).one()
        resources = db.scalar(select(func.count(ContentItem.id)).where(
            ContentItem.course_id == c.id, ContentItem.content_type != "Video")) or 0
        practicals = db.scalar(select(func.count(Practical.id)).where(Practical.course_id == c.id)) or 0
        cards.append({
            "id": c.id, "code": c.code, "title": c.title, "short_title": c.short_title, "level": c.level,
            "version": c.version, "delivery_mode": c.delivery_mode,
            "learners": learners, "active": started,
            "completion_pct": round(100 * completed / started, 1) if started else 0, "completed": completed,
            "average_score": round(float(avg), 1) if avg is not None else None,
            "content_count": videos[0] + resources, "video_count": videos[0],
            "video_minutes": round(float(videos[1]), 1), "practical_count": practicals,
        })
    return cards
