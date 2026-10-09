"""Progress, at-risk and completion computation.

All dashboard figures derive from these stored, recomputed values.
Demo rules — labelled as prototype rules in the UI.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Assessment,
    AssessmentResult,
    Attendance,
    CompletionRecord,
    ContentItem,
    CourseEnrollment,
    LearnerProgress,
    Module,
    Practical,
    PracticalSubmission,
)
from app.models.base import CompletionStatus, RiskLevel, utcnow
from app.services.settings_service import get_setting

WEIGHTS = {"modules": 0.40, "content": 0.20, "practicals": 0.20, "assessments": 0.20}


def _pct(done: int, total: int) -> float:
    return round(100.0 * done / total, 1) if total else 0.0


def ensure_progress(db: Session, enrollment: CourseEnrollment) -> LearnerProgress:
    prog = db.scalar(select(LearnerProgress).where(LearnerProgress.enrollment_id == enrollment.id))
    if prog is None:
        prog = LearnerProgress(
            enrollment_id=enrollment.id,
            learner_id=enrollment.learner_id,
            course_id=enrollment.course_id,
            modules_completed=0,
            content_completed=0,
            risk_reasons=[],
        )
        db.add(prog)
        db.flush()
    return prog


def recompute(db: Session, enrollment: CourseEnrollment, now: datetime | None = None) -> LearnerProgress:
    """Recompute stored progress metrics, risk and completion for one enrolment."""
    now = now or utcnow()
    prog = ensure_progress(db, enrollment)
    cid, lid = enrollment.course_id, enrollment.learner_id

    prog.modules_total = db.scalar(select(func.count(Module.id)).where(Module.course_id == cid)) or 0
    prog.content_total = (
        db.scalar(select(func.count(ContentItem.id)).where(ContentItem.course_id == cid, ContentItem.content_type == "Video"))
        or 0
    )
    prog.modules_completed = min(prog.modules_completed or 0, prog.modules_total)
    prog.content_completed = min(prog.content_completed or 0, prog.content_total)

    # Practicals
    prog.practicals_total = db.scalar(select(func.count(Practical.id)).where(Practical.course_id == cid)) or 0
    prog.practicals_completed = (
        db.scalar(
            select(func.count(PracticalSubmission.id))
            .join(Practical, Practical.id == PracticalSubmission.practical_id)
            .where(
                Practical.course_id == cid,
                PracticalSubmission.learner_id == lid,
                PracticalSubmission.status == "Evaluated",
            )
        )
        or 0
    )

    # Assessments
    prog.assessments_total = db.scalar(select(func.count(Assessment.id)).where(Assessment.course_id == cid)) or 0
    results = db.scalars(
        select(AssessmentResult).where(AssessmentResult.learner_id == lid, AssessmentResult.course_id == cid)
    ).all()
    prog.assessments_completed = len(results)
    prog.assessments_passed = sum(1 for r in results if r.passed)
    prog.assessments_failed = sum(1 for r in results if not r.passed)
    prog.average_score = round(sum(r.percentage for r in results) / len(results), 1) if results else None

    # Attendance (Present + Late count as attended; Excused is excluded from the denominator)
    rows = db.execute(
        select(Attendance.status, func.count(Attendance.id))
        .where(Attendance.learner_id == lid, Attendance.batch_id == enrollment.batch_id)
        .group_by(Attendance.status)
    ).all() if enrollment.batch_id else []
    counts = {s: c for s, c in rows}
    attended = counts.get("Present", 0) + counts.get("Late", 0)
    marked = attended + counts.get("Absent", 0)
    prog.sessions_attended = attended
    prog.sessions_marked = marked
    prog.attendance_pct = round(100.0 * attended / marked, 1) if marked else None

    # Current module = first incomplete module
    modules = db.scalars(select(Module).where(Module.course_id == cid).order_by(Module.sequence)).all()
    if modules:
        idx = min(prog.modules_completed, len(modules) - 1)
        prog.current_module_id = modules[idx].id

    prog.overall_pct = round(
        WEIGHTS["modules"] * _pct(prog.modules_completed, prog.modules_total)
        + WEIGHTS["content"] * _pct(prog.content_completed, prog.content_total)
        + WEIGHTS["practicals"] * _pct(prog.practicals_completed, prog.practicals_total)
        + WEIGHTS["assessments"] * _pct(prog.assessments_passed, prog.assessments_total),
        1,
    )

    # Expected progress to date from the batch schedule (used so learners are not flagged merely for being mid-course)
    batch = enrollment.batch
    today = now.date()
    if batch is None or batch.start_date > today:
        prog.expected_pct = None
        prog.schedule_pct = None
    else:
        span = max((batch.end_date - batch.start_date).days, 1)
        elapsed = min(1.0, max(0.0, (today - batch.start_date).days / span))
        prog.expected_pct = round(max(5.0, 100.0 * elapsed), 1)
        prog.schedule_pct = round(min(150.0, 100.0 * prog.overall_pct / prog.expected_pct), 1)

    completion = evaluate_completion(db, enrollment, prog)
    prog.risk_level, prog.risk_reasons = compute_risk(db, enrollment, prog, completion, now)
    return prog


def compute_risk(
    db: Session, enrollment: CourseEnrollment, prog: LearnerProgress, completion: CompletionRecord, now: datetime
) -> tuple[str, list[str]]:
    """Demo at-risk rules.

    Progress is assessed *against the batch schedule* (progress ÷ expected progress to date), so a learner who
    is exactly on schedule half-way through a course scores 100%, not 50%.
    """
    t = get_setting(db, "risk_thresholds")
    if completion.status == CompletionStatus.COMPLETED:
        return RiskLevel.ON_TRACK, ["Course completed"]
    if completion.status == CompletionStatus.ELIGIBLE:
        return RiskLevel.ON_TRACK, ["All completion criteria met — eligible for completion"]
    batch = enrollment.batch
    if enrollment.status not in ("Onboarded", "Not Completed") or batch is None or batch.start_date > now.date():
        return RiskLevel.NOT_STARTED, ["Training has not started yet"]
    batch_ended = batch.end_date < now.date()

    critical: list[str] = []
    at_risk: list[str] = []
    att = prog.attendance_pct
    if att is not None and att < t["critical_attendance"]:
        critical.append(f"Attendance {att:.0f}% is below {t['critical_attendance']}%")
    if prog.assessments_failed >= t["critical_failed_assessments"]:
        critical.append(f"{prog.assessments_failed} failed assessments")

    sched = prog.schedule_pct if prog.schedule_pct is not None else prog.overall_pct
    if sched < t["at_risk_progress"]:
        at_risk.append(f"Progress {prog.overall_pct:.0f}% is only {sched:.0f}% of the {prog.expected_pct or 0:.0f}% "
                       f"expected by now (threshold {t['at_risk_progress']}%)")
    if att is not None and t["critical_attendance"] <= att < t["at_risk_attendance"]:
        at_risk.append(f"Attendance {att:.0f}% is below {t['at_risk_attendance']}%")
    if prog.average_score is not None and prog.average_score < t["at_risk_score"]:
        at_risk.append(f"Average assessment score {prog.average_score:.0f}% is below {t['at_risk_score']}%")
    if not batch_ended:
        last = prog.last_activity_at
        if last is None or (now - last) > timedelta(days=t["inactivity_days"]):
            days = (now - last).days if last else None
            at_risk.append(f"No learning activity for {days} days" if days is not None else "No learning activity recorded")
    else:
        unmet = [c["label"] for c in (completion.criteria or []) if not c["met"]]
        if unmet:
            at_risk.append("Batch ended with criteria unmet: " + "; ".join(unmet))

    if critical:
        return RiskLevel.CRITICAL, critical + at_risk
    if at_risk:
        return RiskLevel.AT_RISK, at_risk
    if sched >= t["on_track_progress"]:
        return RiskLevel.ON_TRACK, [f"Progress {prog.overall_pct:.0f}% vs {prog.expected_pct or 0:.0f}% expected "
                                    f"({sched:.0f}% of schedule); no risk flags"]
    return RiskLevel.ON_TRACK, [f"No risk flags; {sched:.0f}% of schedule (target {t['on_track_progress']}%) — monitoring"]


def evaluate_completion(db: Session, enrollment: CourseEnrollment, prog: LearnerProgress) -> CompletionRecord:
    rules = get_setting(db, "completion_rules")
    rec = db.scalar(select(CompletionRecord).where(CompletionRecord.enrollment_id == enrollment.id))
    if rec is None:
        rec = CompletionRecord(
            enrollment_id=enrollment.id, learner_id=enrollment.learner_id, course_id=enrollment.course_id,
            status=CompletionStatus.IN_PROGRESS, criteria=[],
        )
        db.add(rec)

    att = prog.attendance_pct
    criteria = [
        {
            "code": "MODULES",
            "label": "Required modules complete",
            "met": (not rules["require_all_modules"]) or (prog.modules_total > 0 and prog.modules_completed >= prog.modules_total),
            "detail": f"{prog.modules_completed}/{prog.modules_total} modules",
        },
        {
            "code": "ASSESSMENTS",
            "label": "Assessments passed",
            "met": (not rules["require_all_assessments_passed"])
            or (prog.assessments_total > 0 and prog.assessments_passed >= prog.assessments_total),
            "detail": f"{prog.assessments_passed}/{prog.assessments_total} passed",
        },
        {
            "code": "PRACTICALS",
            "label": "Practicals completed",
            "met": (not rules["require_all_practicals"])
            or (prog.practicals_total == 0 or prog.practicals_completed >= prog.practicals_total),
            "detail": f"{prog.practicals_completed}/{prog.practicals_total} evaluated",
        },
        {
            "code": "ATTENDANCE",
            "label": f"Attendance ≥ {rules['min_attendance']}%",
            "met": att is not None and att >= rules["min_attendance"],
            "detail": f"{att:.0f}%" if att is not None else "No sessions marked",
        },
    ]
    rec.criteria = criteria
    rec.evaluated_at = utcnow()
    if rec.status != CompletionStatus.COMPLETED:
        all_met = all(c["met"] for c in criteria)
        batch = enrollment.batch
        if all_met:
            rec.status = CompletionStatus.ELIGIBLE
        elif batch is not None and batch.end_date < date.today():
            rec.status = CompletionStatus.NOT_COMPLETED
        else:
            rec.status = CompletionStatus.IN_PROGRESS
    return rec


def recompute_for_learner(db: Session, learner_id: int) -> None:
    for enr in db.scalars(select(CourseEnrollment).where(CourseEnrollment.learner_id == learner_id)).all():
        recompute(db, enr)


def recompute_for_batch(db: Session, batch_id: int) -> None:
    for enr in db.scalars(select(CourseEnrollment).where(CourseEnrollment.batch_id == batch_id)).all():
        recompute(db, enr)


def recompute_all(db: Session) -> int:
    enrollments = db.scalars(select(CourseEnrollment)).all()
    for enr in enrollments:
        recompute(db, enr)
    return len(enrollments)


def touch_activity(db: Session, learner_id: int, course_id: int | None = None, when: datetime | None = None) -> None:
    when = when or utcnow()
    stmt = select(LearnerProgress).where(LearnerProgress.learner_id == learner_id)
    if course_id:
        stmt = stmt.where(LearnerProgress.course_id == course_id)
    for p in db.scalars(stmt).all():
        if p.last_activity_at is None or p.last_activity_at < when:
            p.last_activity_at = when
    from app.models import Learner  # local import to avoid cycle

    learner = db.get(Learner, learner_id)
    if learner and (learner.last_activity_at is None or learner.last_activity_at < when):
        learner.last_activity_at = when
