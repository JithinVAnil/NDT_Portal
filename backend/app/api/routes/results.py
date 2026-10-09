"""Assessment results and practical submissions (evaluation)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import bad_request, not_found, require_admin, require_admin_or_department
from app.models import Assessment, AssessmentResult, CourseEnrollment, Learner, Practical, PracticalSubmission, User
from app.models.base import utcnow
from app.repositories import serializers as ser
from app.repositories.scope import get_learner_checked, scope_by_learner_column
from app.schemas.requests import AssessmentResultIn, PracticalEvaluationIn
from app.services import audit, progress
from app.services.notifications import notify_department, notify_learner

router = APIRouter(tags=["Assessments & Practicals"])


@router.get("/assessment-results")
def list_results(course_id: int | None = None, assessment_id: int | None = None, learner_id: int | None = None,
                 batch_id: int | None = None, user: User = Depends(require_admin_or_department),
                 db: Session = Depends(get_db)):
    stmt = scope_by_learner_column(select(AssessmentResult), user, AssessmentResult.learner_id)
    if course_id:
        stmt = stmt.where(AssessmentResult.course_id == course_id)
    if assessment_id:
        stmt = stmt.where(AssessmentResult.assessment_id == assessment_id)
    if learner_id:
        stmt = stmt.where(AssessmentResult.learner_id == learner_id)
    if batch_id:
        stmt = stmt.where(AssessmentResult.learner_id.in_(
            select(CourseEnrollment.learner_id).where(CourseEnrollment.batch_id == batch_id)))
    return [ser.result(r) for r in db.scalars(stmt.order_by(AssessmentResult.evaluated_at.desc())).all()]


@router.get("/assessment-results/eligible-learners")
def learners_for_assessment(assessment_id: int, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    a = db.get(Assessment, assessment_id)
    if not a:
        raise not_found("Assessment")
    enrs = db.scalars(select(CourseEnrollment).where(CourseEnrollment.course_id == a.course_id,
                                                     CourseEnrollment.status.in_(("Onboarded", "Completed", "Not Completed")))
                      ).all()
    existing = {r.learner_id: r for r in db.scalars(select(AssessmentResult).where(AssessmentResult.assessment_id == a.id)).all()}
    return [{"learner_id": e.learner_id, "learner": e.learner.full_name, "learner_code": e.learner.learner_code,
             "batch": e.batch.code if e.batch else None,
             "existing": ser.result(existing[e.learner_id]) if e.learner_id in existing else None}
            for e in sorted(enrs, key=lambda x: x.learner.full_name)]


@router.post("/assessment-results")
def save_result(body: AssessmentResultIn, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    a = db.get(Assessment, body.assessment_id)
    if not a:
        raise not_found("Assessment")
    learner = db.get(Learner, body.learner_id)
    if not learner:
        raise not_found("Learner")
    enr = db.scalar(select(CourseEnrollment).where(CourseEnrollment.learner_id == learner.id,
                                                   CourseEnrollment.course_id == a.course_id))
    if not enr or enr.status not in ("Onboarded", "Completed", "Not Completed"):
        raise bad_request("Learner is not onboarded in this course")
    if body.score > a.max_score:
        raise bad_request(f"Score cannot exceed the maximum score ({a.max_score:g})")
    pct = round(100.0 * body.score / a.max_score, 1)
    passed = pct >= a.pass_percentage
    r = db.scalar(select(AssessmentResult).where(AssessmentResult.assessment_id == a.id,
                                                 AssessmentResult.learner_id == learner.id))
    old = None
    if r is None:
        r = AssessmentResult(assessment_id=a.id, learner_id=learner.id, course_id=a.course_id, module_id=a.module_id,
                             score=body.score, max_score=a.max_score, percentage=pct, passed=passed, attempts=1)
        db.add(r)
    else:
        old = f"{r.score:g}/{r.max_score:g}"
        r.attempts = (r.attempts or 1) + 1
    r.score, r.max_score, r.percentage, r.passed = body.score, a.max_score, pct, passed
    r.remarks = body.remarks
    r.evaluator_id, r.evaluator_name, r.evaluated_at = user.id, user.full_name, utcnow()
    db.flush()
    progress.touch_activity(db, learner.id, a.course_id)
    prev_risk = None
    from app.models import LearnerProgress

    lp = db.scalar(select(LearnerProgress).where(LearnerProgress.enrollment_id == enr.id))
    prev_risk = lp.risk_level if lp else None
    p = progress.recompute(db, enr)
    audit.record(db, user, "ASSESSMENT_RECORDED" if old is None else "ASSESSMENT_UPDATED", "AssessmentResult", r.id,
                 details=f"{learner.full_name} — {a.title}: {body.score:g}/{a.max_score:g} ({pct:.0f}%, "
                         f"{'PASS' if passed else 'FAIL'})" + (f"; previous {old}" if old else ""), request=request)
    notify_learner(db, learner.id, "Assessment result published",
                   f"{a.title}: {body.score:g}/{a.max_score:g} ({pct:.0f}%) — {'Pass' if passed else 'Not passed'}.",
                   category="assessment", severity="success" if passed else "warning", link="/learner/assessments")
    if p.risk_level in ("AT_RISK", "CRITICAL") and prev_risk not in ("AT_RISK", "CRITICAL"):
        notify_department(db, learner.department_id, "Learner at risk",
                          f"{learner.full_name} is now {p.risk_level.replace('_', ' ').title()}: {'; '.join(p.risk_reasons)}",
                          category="risk", severity="critical" if p.risk_level == "CRITICAL" else "warning",
                          link=f"/department/learners/{learner.id}")
    db.commit()
    data = ser.result(r)
    data["progress"] = ser.progress(p)
    return data


# ---------- Practical submissions ----------
@router.get("/practical-submissions")
def list_submissions(practical_id: int | None = None, learner_id: int | None = None,
                     user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    stmt = scope_by_learner_column(select(PracticalSubmission), user, PracticalSubmission.learner_id)
    if practical_id:
        stmt = stmt.where(PracticalSubmission.practical_id == practical_id)
    if learner_id:
        stmt = stmt.where(PracticalSubmission.learner_id == learner_id)
    return [ser.submission(s) for s in db.scalars(stmt.order_by(PracticalSubmission.updated_at.desc())).all()]


@router.get("/practicals/{practical_id}/roster")
def practical_roster(practical_id: int, user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    p = db.get(Practical, practical_id)
    if not p:
        raise not_found("Practical")
    stmt = select(CourseEnrollment).where(CourseEnrollment.course_id == p.course_id,
                                          CourseEnrollment.status.in_(("Onboarded", "Completed", "Not Completed")))
    stmt = scope_by_learner_column(stmt, user, CourseEnrollment.learner_id)
    subs = {s.learner_id: s for s in db.scalars(select(PracticalSubmission).where(PracticalSubmission.practical_id == p.id)).all()}
    return {
        "practical": ser.practical(p),
        "rows": [{"learner_id": e.learner_id, "learner": e.learner.full_name, "learner_code": e.learner.learner_code,
                  "batch": e.batch.code if e.batch else None,
                  "submission": ser.submission(subs[e.learner_id]) if e.learner_id in subs else None}
                 for e in sorted(db.scalars(stmt).all(), key=lambda x: x.learner.full_name)],
    }


@router.put("/practicals/{practical_id}/submissions/{learner_id}")
def evaluate_practical(practical_id: int, learner_id: int, body: PracticalEvaluationIn, request: Request,
                       user: User = Depends(require_admin), db: Session = Depends(get_db)):
    p = db.get(Practical, practical_id)
    if not p:
        raise not_found("Practical")
    learner = get_learner_checked(db, user, learner_id)
    enr = db.scalar(select(CourseEnrollment).where(CourseEnrollment.learner_id == learner.id,
                                                   CourseEnrollment.course_id == p.course_id))
    if not enr:
        raise bad_request("Learner is not enrolled in this course")
    score = body.score
    if body.rubric_scores and p.rubric:
        limits = {c["name"]: c["max_score"] for c in p.rubric.criteria}
        for k, v in body.rubric_scores.items():
            if k not in limits:
                raise bad_request(f"Unknown rubric criterion '{k}'")
            if v < 0 or v > limits[k]:
                raise bad_request(f"'{k}' must be between 0 and {limits[k]}")
        score = round(sum(body.rubric_scores.values()) * p.max_score / (p.rubric.total_score or 100), 1)
    if body.status == "Evaluated" and score is None:
        raise bad_request("Enter a score (or rubric scores) to mark the practical as evaluated")
    if score is not None and score > p.max_score:
        raise bad_request(f"Score cannot exceed {p.max_score}")
    s = db.scalar(select(PracticalSubmission).where(PracticalSubmission.practical_id == p.id,
                                                    PracticalSubmission.learner_id == learner.id))
    if s is None:
        s = PracticalSubmission(practical_id=p.id, learner_id=learner.id)
        db.add(s)
    s.status, s.score, s.rubric_scores, s.remarks = body.status, score, body.rubric_scores, body.remarks
    if body.status in ("Submitted", "Evaluated") and not s.submitted_at:
        s.submitted_at = utcnow()
    if body.status == "Evaluated":
        s.evaluated_by_id, s.evaluated_at = user.id, utcnow()
    db.flush()
    progress.touch_activity(db, learner.id, p.course_id)
    prog = progress.recompute(db, enr)
    audit.record(db, user, "PRACTICAL_EVALUATED" if body.status == "Evaluated" else "PRACTICAL_UPDATED", "Practical",
                 p.code, details=f"{learner.full_name}: {body.status}" + (f", score {score:g}/{p.max_score}" if score is not None else ""),
                 request=request)
    if body.status == "Evaluated":
        notify_learner(db, learner.id, "Practical evaluated", f"{p.title}: {score:g}/{p.max_score}.",
                       category="assessment", severity="success", link="/learner/practicals")
    db.commit()
    data = ser.submission(s)
    data["progress"] = ser.progress(prog)
    return data
