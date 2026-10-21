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
    """Bulk-load all department KPIs in 4 queries instead of N×10 queries."""
    depts = db.scalars(select(Department).where(Department.is_active.is_(True)).order_by(Department.code)).all()
    if not depts:
        return []
    dept_ids = [d.id for d in depts]

    # Learner counts per department
    learner_rows = db.execute(
        select(Learner.department_id, func.count(Learner.id)).group_by(Learner.department_id)
    ).all()
    learner_map = {did: cnt for did, cnt in learner_rows}

    # Progress + risk per department (via learner -> enrollment -> progress)
    prog_rows = db.execute(
        select(Learner.department_id, LearnerProgress.overall_pct, LearnerProgress.risk_level, LearnerProgress.learner_id)
        .join(CourseEnrollment, CourseEnrollment.id == LearnerProgress.enrollment_id)
        .join(Learner, Learner.id == LearnerProgress.learner_id)
        .where(CourseEnrollment.status.in_(STARTED), Learner.department_id.in_(dept_ids))
    ).all()
    prog_by_dept: dict[int, list] = defaultdict(list)
    for did, pct, risk, lid in prog_rows:
        prog_by_dept[did].append((pct, risk, lid))

    # Attendance per department
    att_rows = db.execute(
        select(Learner.department_id, Attendance.status, func.count(Attendance.id))
        .join(Learner, Learner.id == Attendance.learner_id)
        .where(Learner.department_id.in_(dept_ids))
        .group_by(Learner.department_id, Attendance.status)
    ).all()
    att_by_dept: dict[int, dict[str, int]] = defaultdict(dict)
    for did, st, cnt in att_rows:
        att_by_dept[did][st] = cnt

    # Assessment scores per department
    score_rows = db.execute(
        select(Learner.department_id, func.avg(AssessmentResult.percentage))
        .join(Learner, Learner.id == AssessmentResult.learner_id)
        .where(Learner.department_id.in_(dept_ids))
        .group_by(Learner.department_id)
    ).all()
    score_map = {did: (round(float(avg), 1) if avg is not None else 0) for did, avg in score_rows}

    # Completions per department
    comp_rows = db.execute(
        select(Learner.department_id, func.count(CompletionRecord.id))
        .join(Learner, Learner.id == CompletionRecord.learner_id)
        .where(CompletionRecord.status == CompletionStatus.COMPLETED, Learner.department_id.in_(dept_ids))
        .group_by(Learner.department_id)
    ).all()
    comp_map = {did: cnt for did, cnt in comp_rows}

    rows = []
    for d in depts:
        progs = prog_by_dept.get(d.id, [])
        att = att_by_dept.get(d.id, {})
        attended = att.get("Present", 0) + att.get("Late", 0)
        marked = attended + att.get("Absent", 0)
        att_rate = round(100 * attended / marked, 1) if marked else 0
        avg_prog = _avg([p[0] for p in progs]) or 0
        at_risk = len({p[2] for p in progs if p[1] in (RiskLevel.AT_RISK, RiskLevel.CRITICAL)})
        rows.append({
            "department_id": d.id, "department": d.code, "name": d.name,
            "learners": learner_map.get(d.id, 0),
            "average_progress": avg_prog, "attendance_rate": att_rate,
            "average_score": score_map.get(d.id, 0),
            "completed": comp_map.get(d.id, 0), "at_risk": at_risk,
        })
    return rows


def course_cards(db: Session, dept_id: int | None = None) -> list[dict]:
    """Bulk-load all course card data in ~4 queries instead of 7 per course."""
    lf = _learner_filter(dept_id)
    courses = db.scalars(select(Course).order_by(Course.id)).all()
    if not courses:
        return []
    course_ids = [c.id for c in courses]

    def scoped(stmt, col):
        return stmt.where(col.in_(lf)) if lf is not None else stmt

    # Enrollment counts (all statuses + started statuses)
    enr_all = db.execute(scoped(
        select(CourseEnrollment.course_id, func.count(CourseEnrollment.id))
        .where(CourseEnrollment.course_id.in_(course_ids))
        .group_by(CourseEnrollment.course_id), CourseEnrollment.learner_id
    )).all()
    enr_all_map = {cid: cnt for cid, cnt in enr_all}

    enr_started = db.execute(scoped(
        select(CourseEnrollment.course_id, func.count(CourseEnrollment.id))
        .where(CourseEnrollment.course_id.in_(course_ids), CourseEnrollment.status.in_(STARTED))
        .group_by(CourseEnrollment.course_id), CourseEnrollment.learner_id
    )).all()
    enr_started_map = {cid: cnt for cid, cnt in enr_started}

    # Completion counts
    comp_rows = db.execute(scoped(
        select(CompletionRecord.course_id, func.count(CompletionRecord.id))
        .where(CompletionRecord.course_id.in_(course_ids), CompletionRecord.status == CompletionStatus.COMPLETED)
        .group_by(CompletionRecord.course_id), CompletionRecord.learner_id
    )).all()
    comp_map = {cid: cnt for cid, cnt in comp_rows}

    # Average assessment score
    score_rows = db.execute(scoped(
        select(AssessmentResult.course_id, func.avg(AssessmentResult.percentage))
        .where(AssessmentResult.course_id.in_(course_ids))
        .group_by(AssessmentResult.course_id), AssessmentResult.learner_id
    )).all()
    score_map = {cid: (round(float(avg), 1) if avg is not None else None) for cid, avg in score_rows}

    # Content: video count + duration, non-video count
    video_rows = db.execute(
        select(ContentItem.course_id, func.count(ContentItem.id),
               func.coalesce(func.sum(ContentItem.duration_minutes), 0))
        .where(ContentItem.course_id.in_(course_ids), ContentItem.content_type == "Video")
        .group_by(ContentItem.course_id)
    ).all()
    video_map = {cid: (vc, vd) for cid, vc, vd in video_rows}

    resource_rows = db.execute(
        select(ContentItem.course_id, func.count(ContentItem.id))
        .where(ContentItem.course_id.in_(course_ids), ContentItem.content_type != "Video")
        .group_by(ContentItem.course_id)
    ).all()
    resource_map = {cid: cnt for cid, cnt in resource_rows}

    # Practical counts
    prac_rows = db.execute(
        select(Practical.course_id, func.count(Practical.id))
        .where(Practical.course_id.in_(course_ids))
        .group_by(Practical.course_id)
    ).all()
    prac_map = {cid: cnt for cid, cnt in prac_rows}

    cards = []
    for c in courses:
        started = enr_started_map.get(c.id, 0)
        completed = comp_map.get(c.id, 0)
        vc, vd = video_map.get(c.id, (0, 0))
        cards.append({
            "id": c.id, "code": c.code, "title": c.title, "short_title": c.short_title, "level": c.level,
            "version": c.version, "delivery_mode": c.delivery_mode,
            "learners": enr_all_map.get(c.id, 0), "active": started,
            "completion_pct": round(100 * completed / started, 1) if started else 0,
            "completed": completed,
            "average_score": score_map.get(c.id),
            "content_count": vc + resource_map.get(c.id, 0), "video_count": vc,
            "video_minutes": round(float(vd), 1), "practical_count": prac_map.get(c.id, 0),
        })
    return cards
