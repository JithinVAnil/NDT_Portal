from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import bad_request, not_found, require_admin, require_admin_or_department
from app.models import Assessment, Course, Exercise, Lesson, Module, Practical, Rubric, User
from app.repositories import serializers as ser
from app.schemas.requests import (
    AssessmentIn,
    CourseUpdate,
    ExerciseIn,
    LessonIn,
    ModuleIn,
    PracticalIn,
    RubricIn,
)
from app.services import audit
from app.services import dashboard as dash
from app.services.learner_profile import course_tree

router = APIRouter(tags=["Courses & Curriculum"])


def _course(db: Session, course_id: int) -> Course:
    c = db.get(Course, course_id)
    if not c:
        raise not_found("Course")
    return c


@router.get("/courses")
def list_courses(user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    return dash.course_cards(db, user.department_id if user.role_code == "DEPARTMENT" else None)


@router.get("/courses/options")
def course_options(user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    return [{"id": c.id, "code": c.code, "title": c.title, "short_title": c.short_title}
            for c in db.scalars(select(Course).where(Course.is_active.is_(True)).order_by(Course.id)).all()]


@router.get("/courses/{course_id}")
def get_course(course_id: int, user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    _course(db, course_id)
    return course_tree(db, course_id)


@router.put("/courses/{course_id}")
def update_course(course_id: int, body: CourseUpdate, request: Request, user: User = Depends(require_admin),
                  db: Session = Depends(get_db)):
    c = _course(db, course_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    audit.record(db, user, "COURSE_UPDATED", "Course", c.code, request=request)
    db.commit()
    return course_tree(db, course_id)["course"]


@router.post("/courses/{course_id}/modules")
def add_module(course_id: int, body: ModuleIn, request: Request, user: User = Depends(require_admin),
               db: Session = Depends(get_db)):
    c = _course(db, course_id)
    seq = (db.scalar(select(func.max(Module.sequence)).where(Module.course_id == c.id)) or 0) + 1
    m = Module(course_id=c.id, sequence=seq, **body.model_dump())
    db.add(m)
    db.flush()
    audit.record(db, user, "MODULE_CREATED", "Module", m.id, details=f"{c.code}: {m.title}", request=request)
    db.commit()
    return {"id": m.id, "sequence": m.sequence, "title": m.title}


@router.put("/modules/{module_id}")
def update_module(module_id: int, body: ModuleIn, request: Request, user: User = Depends(require_admin),
                  db: Session = Depends(get_db)):
    m = db.get(Module, module_id)
    if not m:
        raise not_found("Module")
    for k, v in body.model_dump().items():
        setattr(m, k, v)
    audit.record(db, user, "MODULE_UPDATED", "Module", m.id, request=request)
    db.commit()
    return {"id": m.id, "sequence": m.sequence, "title": m.title}


@router.post("/modules/{module_id}/lessons")
def add_lesson(module_id: int, body: LessonIn, request: Request, user: User = Depends(require_admin),
               db: Session = Depends(get_db)):
    m = db.get(Module, module_id)
    if not m:
        raise not_found("Module")
    seq = (db.scalar(select(func.max(Lesson.sequence)).where(Lesson.module_id == m.id)) or 0) + 1
    l = Lesson(module_id=m.id, sequence=seq, **body.model_dump())
    db.add(l)
    db.flush()
    audit.record(db, user, "LESSON_CREATED", "Lesson", l.id, details=l.title, request=request)
    db.commit()
    return {"id": l.id, "sequence": l.sequence, "title": l.title}


# ---------- Practicals ----------
@router.get("/practicals")
def list_practicals(course_id: int | None = None, user: User = Depends(require_admin_or_department),
                    db: Session = Depends(get_db)):
    stmt = select(Practical).order_by(Practical.course_id, Practical.code)
    if course_id:
        stmt = stmt.where(Practical.course_id == course_id)
    return [ser.practical(p) for p in db.scalars(stmt).all()]


@router.post("/practicals")
def create_practical(body: PracticalIn, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = _course(db, body.course_id)
    n = (db.scalar(select(func.count(Practical.id)).where(Practical.course_id == c.id)) or 0) + 1
    p = Practical(code=f"PR-{c.code}-{n:02d}", **body.model_dump())
    db.add(p)
    db.flush()
    audit.record(db, user, "PRACTICAL_CREATED", "Practical", p.code, details=p.title, request=request)
    db.commit()
    return ser.practical(p)


@router.put("/practicals/{practical_id}")
def update_practical(practical_id: int, body: PracticalIn, request: Request, user: User = Depends(require_admin),
                     db: Session = Depends(get_db)):
    p = db.get(Practical, practical_id)
    if not p:
        raise not_found("Practical")
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    audit.record(db, user, "PRACTICAL_UPDATED", "Practical", p.code, request=request)
    db.commit()
    return ser.practical(p)


# ---------- Exercises ----------
@router.get("/exercises")
def list_exercises(course_id: int | None = None, user: User = Depends(require_admin_or_department),
                   db: Session = Depends(get_db)):
    stmt = select(Exercise).order_by(Exercise.course_id, Exercise.code)
    if course_id:
        stmt = stmt.where(Exercise.course_id == course_id)
    return [{"id": e.id, "code": e.code, "title": e.title, "course_id": e.course_id, "module_id": e.module_id,
             "module": e.module.title if e.module else None, "description": e.description, "type": e.exercise_type,
             "has_answer_key": e.has_answer_key, "max_score": e.max_score} for e in db.scalars(stmt).all()]


@router.post("/exercises")
def create_exercise(body: ExerciseIn, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = _course(db, body.course_id)
    n = (db.scalar(select(func.count(Exercise.id)).where(Exercise.course_id == c.id)) or 0) + 1
    e = Exercise(code=f"EX-{c.code}-{n:02d}", **body.model_dump())
    db.add(e)
    db.flush()
    audit.record(db, user, "EXERCISE_CREATED", "Exercise", e.code, details=e.title, request=request)
    db.commit()
    return {"id": e.id, "code": e.code, "title": e.title}


# ---------- Rubrics ----------
@router.get("/rubrics")
def list_rubrics(user: User = Depends(require_admin_or_department), db: Session = Depends(get_db)):
    return [ser.rubric(r) for r in db.scalars(select(Rubric).order_by(Rubric.id)).all()]


@router.post("/rubrics")
def create_rubric(body: RubricIn, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    criteria = [c.model_dump() for c in body.criteria]
    r = Rubric(title=body.title, course_id=body.course_id, description=body.description, criteria=criteria,
               total_score=sum(c["max_score"] for c in criteria))
    db.add(r)
    db.flush()
    audit.record(db, user, "RUBRIC_CREATED", "Rubric", r.id, details=r.title, request=request)
    db.commit()
    return ser.rubric(r)


@router.put("/rubrics/{rubric_id}")
def update_rubric(rubric_id: int, body: RubricIn, request: Request, user: User = Depends(require_admin),
                  db: Session = Depends(get_db)):
    r = db.get(Rubric, rubric_id)
    if not r:
        raise not_found("Rubric")
    criteria = [c.model_dump() for c in body.criteria]
    r.title, r.course_id, r.description, r.criteria = body.title, body.course_id, body.description, criteria
    r.total_score = sum(c["max_score"] for c in criteria)
    audit.record(db, user, "RUBRIC_UPDATED", "Rubric", r.id, request=request)
    db.commit()
    return ser.rubric(r)


# ---------- Assessment definitions ----------
@router.get("/assessments")
def list_assessments(course_id: int | None = None, user: User = Depends(require_admin_or_department),
                     db: Session = Depends(get_db)):
    stmt = select(Assessment).order_by(Assessment.course_id, Assessment.sequence)
    if course_id:
        stmt = stmt.where(Assessment.course_id == course_id)
    return [{"id": a.id, "code": a.code, "title": a.title, "type": a.assessment_type, "course_id": a.course_id,
             "course": a.course.short_title, "module_id": a.module_id, "module": a.module.title if a.module else None,
             "max_score": a.max_score, "pass_percentage": a.pass_percentage, "has_answer_key": a.has_answer_key,
             "rubric": ser.rubric(a.rubric) if a.rubric else None, "practical_id": a.practical_id}
            for a in db.scalars(stmt).all()]


@router.post("/assessments")
def create_assessment(body: AssessmentIn, request: Request, user: User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    c = _course(db, body.course_id)
    if body.module_id:
        m = db.get(Module, body.module_id)
        if not m or m.course_id != c.id:
            raise bad_request("Module does not belong to this course")
    n = (db.scalar(select(func.count(Assessment.id)).where(Assessment.course_id == c.id)) or 0) + 1
    a = Assessment(code=f"AS-{c.code}-{n:02d}", sequence=n, **body.model_dump())
    db.add(a)
    db.flush()
    audit.record(db, user, "ASSESSMENT_CREATED", "Assessment", a.code, details=a.title, request=request)
    db.commit()
    return {"id": a.id, "code": a.code, "title": a.title}
