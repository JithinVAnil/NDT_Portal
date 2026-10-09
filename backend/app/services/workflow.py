"""Nomination → Eligibility → Approval → Allocation → Onboarding workflow.

Each transition is persisted in nomination_history, written to the audit log
and triggers in-app notifications.
"""
from __future__ import annotations

from datetime import date

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import bad_request, forbid
from app.core.security import hash_password
from app.models import (
    Batch,
    BatchEnrollment,
    Course,
    CourseEnrollment,
    Department,
    EligibilityCheck,
    Learner,
    Nomination,
    NominationHistory,
    Role,
    User,
)
from app.models.base import EligibilityResult, NominationStatus as S, RoleCode, utcnow
from app.services import audit, eligibility, ndu_service, progress
from app.services.notifications import notify_department, notify_learner, notify_role


def next_code(db: Session, model, column, prefix: str, width: int = 4) -> str:
    year = date.today().year
    full_prefix = f"{prefix}-{year}-"
    last = db.scalar(select(func.max(column)).where(column.like(f"{full_prefix}%")))
    n = int(last.rsplit("-", 1)[1]) + 1 if last else 1
    return f"{full_prefix}{n:0{width}d}"


def _history(db: Session, nom: Nomination, user: User | None, to_status: str, action: str, remarks: str | None = None,
             from_status: str | None = None) -> None:
    db.add(NominationHistory(
        nomination_id=nom.id, from_status=from_status if from_status is not None else nom.status, to_status=to_status,
        action=action, remarks=remarks, user_id=user.id if user else None, user_name=user.full_name if user else "System",
    ))


def _set_status(db: Session, nom: Nomination, user: User, to_status: str, action: str, remarks: str | None = None) -> None:
    _history(db, nom, user, to_status, action, remarks)
    nom.status = to_status


def _require(nom: Nomination, allowed: tuple[str, ...], action: str) -> None:
    if nom.status not in allowed:
        raise bad_request(f"Cannot {action} a nomination in status '{nom.status}'. Allowed from: {', '.join(allowed)}")


def create_nomination(db: Session, user: User, learner: Learner, course: Course, training_mode: str,
                      justification: str | None, submit: bool, request: Request | None = None) -> Nomination:
    if user.role_code == RoleCode.DEPARTMENT and learner.department_id != user.department_id:
        raise forbid("You can only nominate learners from your own department")
    nom = Nomination(
        nomination_no=next_code(db, Nomination, Nomination.nomination_no, "NOM"),
        learner_id=learner.id, department_id=learner.department_id, course_id=course.id,
        training_mode=training_mode, justification=justification, status=S.DRAFT, created_by_id=user.id,
    )
    db.add(nom)
    db.flush()
    _history(db, nom, user, S.DRAFT, "Nomination created", from_status="")
    if learner.status == "Registered":
        learner.status = "Nominated"
    audit.record(db, user, "NOMINATION_CREATED", "Nomination", nom.nomination_no,
                 details=f"{learner.full_name} → {course.title} ({training_mode})", request=request)
    if submit:
        submit_nomination(db, user, nom, request)
    return nom


def submit_nomination(db: Session, user: User, nom: Nomination, request: Request | None = None) -> None:
    _require(nom, (S.DRAFT,), "submit")
    _set_status(db, nom, user, S.SUBMITTED, "Submitted to NIELIT")
    nom.submitted_at = utcnow()
    audit.record(db, user, "NOMINATION_SUBMITTED", "Nomination", nom.nomination_no,
                 details=f"{nom.learner.full_name} → {nom.course.short_title}", request=request)
    notify_role(db, RoleCode.ADMIN, "New nomination submitted",
                f"{nom.department.code} submitted {nom.nomination_no}: {nom.learner.full_name} for {nom.course.short_title}.",
                category="nomination", link=f"/admin/nominations/{nom.id}")


def review_nomination(db: Session, user: User, nom: Nomination, request: Request | None = None) -> None:
    _require(nom, (S.SUBMITTED,), "start review of")
    _set_status(db, nom, user, S.UNDER_REVIEW, "Review started")
    nom.reviewed_by_id = user.id
    nom.reviewed_at = utcnow()
    audit.record(db, user, "NOMINATION_REVIEW", "Nomination", nom.nomination_no, request=request)


def run_eligibility(db: Session, user: User, nom: Nomination, request: Request | None = None) -> EligibilityCheck:
    _require(nom, (S.SUBMITTED, S.UNDER_REVIEW, S.ELIGIBLE, S.INELIGIBLE), "run eligibility on")
    if nom.status == S.SUBMITTED:
        review_nomination(db, user, nom, request)
    result, rules = eligibility.evaluate(db, nom.learner, nom.course, nom.department, exclude_nomination_id=nom.id)
    check = EligibilityCheck(nomination_id=nom.id, result=result, rules=rules, checked_by_id=user.id,
                             checked_by_name=user.full_name)
    db.add(check)
    nom.eligibility_result = result
    target = {EligibilityResult.ELIGIBLE: S.ELIGIBLE, EligibilityResult.NOT_ELIGIBLE: S.INELIGIBLE}.get(result, S.UNDER_REVIEW)
    failed = [r["message"] for r in rules if r["outcome"] != "PASS"]
    _set_status(db, nom, user, target, f"Eligibility check: {result.replace('_', ' ').title()}",
                "; ".join(failed) if failed else "All demo rules passed")
    audit.record(db, user, "ELIGIBILITY_CHECK", "Nomination", nom.nomination_no,
                 result="SUCCESS", details=f"Result: {result}", request=request)
    if result == EligibilityResult.NOT_ELIGIBLE:
        notify_department(db, nom.department_id, "Nomination ineligible",
                          f"{nom.nomination_no} ({nom.learner.full_name}) did not meet eligibility: {'; '.join(failed)}",
                          category="nomination", severity="warning", link=f"/department/nominations/{nom.id}")
    return check


def approve(db: Session, user: User, nom: Nomination, remarks: str | None, request: Request | None = None) -> None:
    _require(nom, (S.ELIGIBLE, S.UNDER_REVIEW), "approve")
    if nom.eligibility_result is None:
        raise bad_request("Run the eligibility check before approving")
    if nom.eligibility_result == EligibilityResult.REVIEW and not (remarks and remarks.strip()):
        raise bad_request("Eligibility requires review — enter approval remarks to justify the approval")
    if nom.eligibility_result == EligibilityResult.NOT_ELIGIBLE:
        raise bad_request("Nomination is not eligible and cannot be approved")
    _set_status(db, nom, user, S.APPROVED, "Approved by NIELIT", remarks)
    nom.decision_remarks = remarks
    nom.reviewed_by_id = user.id
    nom.reviewed_at = utcnow()
    nom.learner.status = "Approved"
    audit.record(db, user, "NOMINATION_APPROVED", "Nomination", nom.nomination_no, details=remarks, request=request)
    notify_department(db, nom.department_id, "Nomination approved",
                      f"{nom.nomination_no}: {nom.learner.full_name} approved for {nom.course.short_title}.",
                      category="nomination", severity="success", link=f"/department/nominations/{nom.id}")


def reject(db: Session, user: User, nom: Nomination, remarks: str, request: Request | None = None) -> None:
    _require(nom, (S.SUBMITTED, S.UNDER_REVIEW, S.ELIGIBLE, S.INELIGIBLE), "reject")
    if not (remarks and remarks.strip()):
        raise bad_request("A rejection reason is required")
    _set_status(db, nom, user, S.REJECTED, "Rejected by NIELIT", remarks)
    nom.decision_remarks = remarks
    nom.reviewed_by_id = user.id
    nom.reviewed_at = utcnow()
    audit.record(db, user, "NOMINATION_REJECTED", "Nomination", nom.nomination_no, details=remarks, request=request)
    notify_department(db, nom.department_id, "Nomination rejected",
                      f"{nom.nomination_no}: {nom.learner.full_name} — {remarks}",
                      category="nomination", severity="warning", link=f"/department/nominations/{nom.id}")


def allocate_course(db: Session, user: User, nom: Nomination, course_id: int | None,
                    request: Request | None = None) -> CourseEnrollment:
    _require(nom, (S.APPROVED,), "allocate a course to")
    course = db.get(Course, course_id or nom.course_id)
    if not course:
        raise bad_request("Course not found")
    existing = db.scalar(select(CourseEnrollment).where(
        CourseEnrollment.learner_id == nom.learner_id, CourseEnrollment.course_id == course.id))
    if existing:
        raise bad_request("Learner is already enrolled in this course")
    enr = CourseEnrollment(learner_id=nom.learner_id, course_id=course.id, nomination_id=nom.id, status="Allocated")
    db.add(enr)
    db.flush()
    nom.allocated_course_id = course.id
    _set_status(db, nom, user, S.ALLOCATED, f"Course allocated: {course.title}")
    nom.learner.status = "Allocated"
    progress.recompute(db, enr)
    audit.record(db, user, "COURSE_ALLOCATED", "Nomination", nom.nomination_no,
                 details=f"{nom.learner.full_name} → {course.title}", request=request)
    return enr


def allocate_batch(db: Session, user: User, nom: Nomination, batch_id: int, request: Request | None = None) -> BatchEnrollment:
    _require(nom, (S.ALLOCATED,), "allocate a batch to")
    if nom.allocated_batch_id:
        raise bad_request("A batch is already allocated to this nomination")
    batch = db.get(Batch, batch_id)
    if not batch:
        raise bad_request("Batch not found")
    enr = db.scalar(select(CourseEnrollment).where(
        CourseEnrollment.learner_id == nom.learner_id, CourseEnrollment.course_id == nom.allocated_course_id))
    if enr is None:
        raise bad_request("Allocate a course before allocating a batch")
    if batch.course_id != enr.course_id:
        raise bad_request(f"Batch {batch.code} is for a different course")
    if batch.status in ("Completed", "Cancelled"):
        raise bad_request(f"Batch {batch.code} is {batch.status.lower()}")
    if batch.department_id and batch.department_id != nom.department_id:
        raise bad_request(f"Batch {batch.code} is reserved for another department")
    count = db.scalar(select(func.count(BatchEnrollment.id)).where(
        BatchEnrollment.batch_id == batch.id, BatchEnrollment.status != "Withdrawn")) or 0
    if count >= batch.capacity:
        raise bad_request(f"Batch {batch.code} is full ({count}/{batch.capacity})")
    be = BatchEnrollment(batch_id=batch.id, learner_id=nom.learner_id, enrollment_id=enr.id, status="Assigned")
    db.add(be)
    enr.batch_id = batch.id
    enr.status = "Batch Assigned"
    nom.allocated_batch_id = batch.id
    _history(db, nom, user, nom.status, f"Batch allocated: {batch.code}")
    db.flush()
    progress.recompute(db, enr)
    audit.record(db, user, "BATCH_ALLOCATED", "Nomination", nom.nomination_no,
                 details=f"{nom.learner.full_name} → {batch.code}", request=request)
    return be


def onboard(db: Session, user: User, nom: Nomination, request: Request | None = None) -> dict:
    _require(nom, (S.ALLOCATED,), "onboard")
    if not nom.allocated_batch_id:
        raise bad_request("Allocate a batch before onboarding")
    enr = db.scalar(select(CourseEnrollment).where(
        CourseEnrollment.learner_id == nom.learner_id, CourseEnrollment.course_id == nom.allocated_course_id))
    be = db.scalar(select(BatchEnrollment).where(
        BatchEnrollment.batch_id == nom.allocated_batch_id, BatchEnrollment.learner_id == nom.learner_id))
    now = utcnow()
    enr.status = "Onboarded"
    enr.onboarded_at = now
    be.status = "Onboarded"
    be.onboarded_at = now
    nom.onboarded_at = now
    learner = nom.learner
    learner.status = "Onboarded"
    _set_status(db, nom, user, S.ONBOARDED, "Learner onboarded")

    # Learner portal account (local auth)
    account_created = False
    account = db.scalar(select(User).where(User.learner_id == learner.id))
    if account is None and not db.scalar(select(User.id).where(User.email == learner.email)):
        role = db.scalar(select(Role).where(Role.code == RoleCode.LEARNER))
        account = User(email=learner.email, full_name=learner.full_name, password_hash=hash_password(settings.demo_password),
                       role_id=role.id, department_id=learner.department_id, learner_id=learner.id,
                       designation=learner.designation)
        db.add(account)
        db.flush()
        account_created = True

    ndu = ndu_service.ensure_ndu_enrollment(db, user, enr)
    progress.touch_activity(db, learner.id, enr.course_id, now)
    progress.recompute(db, enr)
    audit.record(db, user, "LEARNER_ONBOARDED", "Learner", learner.learner_code,
                 details=f"{learner.full_name} onboarded to {enr.batch.code}; NDU ref {ndu.ndu_learner_ref} (demo)",
                 request=request)
    notify_department(db, nom.department_id, "Learner onboarded",
                      f"{learner.full_name} has been onboarded to {enr.batch.code}.", category="onboarding",
                      severity="success", link=f"/department/learners/{learner.id}")
    notify_learner(db, learner.id, "Welcome to the programme",
                   f"You are onboarded to {enr.course.title}, batch {enr.batch.code}. Your NDU learning reference is "
                   f"{ndu.ndu_learner_ref} (demo).", category="onboarding", severity="success", link="/learner/dashboard")
    return {"account_created": account_created, "account_email": learner.email if account_created else None,
            "ndu_learner_ref": ndu.ndu_learner_ref, "batch": enr.batch.code}


def department_exists(db: Session, department_id: int) -> Department:
    dept = db.get(Department, department_id)
    if not dept:
        raise bad_request("Department not found")
    return dept
