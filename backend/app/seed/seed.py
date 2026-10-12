"""Demo seed generator — realistic, entirely FICTIONAL data.

Dates are generated relative to *today* so the demonstration always shows
active batches, recent attendance and upcoming sessions.

Run:  python -m app.seed.seed          (reset + seed)
"""
from __future__ import annotations

import hashlib
import logging
import math
import random
from datetime import date, datetime, time, timedelta

from sqlalchemy import select

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import (
    Assessment,
    AssessmentResult,
    Attendance,
    AuditLog,
    Batch,
    BatchEnrollment,
    CompletionRecord,
    ContentItem,
    Course,
    CourseEnrollment,
    Department,
    EligibilityCheck,
    Exercise,
    Learner,
    LearnerProgress,
    Lesson,
    Module,
    Nomination,
    NominationHistory,
    Notification,
    NduEnrollment,
    NduSyncLog,
    Practical,
    PracticalSubmission,
    ReportLog,
    Role,
    Rubric,
    TrainingSession,
    TrainingVenue,
    Trainer,
    User,
)
from app.models.base import VIDEO_RESTRICTIONS, CompletionStatus, NominationStatus as S, RoleCode, utcnow
from app.seed import curriculum as cur
from app.services import eligibility, progress
from app.services.settings_service import seed_defaults

log = logging.getLogger("nielit.seed")

DEPARTMENTS = [
    ("SCIB", "State Cyber Investigation Bureau", "Home Affairs (Fictional)", "Law Enforcement", "Bengaluru", "Insp. Gen. R. Sharma"),
    ("DDG", "Directorate of Digital Governance", "Electronics & IT (Fictional)", "e-Governance", "New Delhi", "Smt. A. Kapoor"),
    ("DPFT", "Directorate of Public Finance & Treasury", "Finance (Fictional)", "Finance", "Lucknow", "Shri V. Tripathi"),
    ("DHI", "Department of Health Informatics", "Health (Fictional)", "Health", "Bhubaneswar", "Dr. S. Mohanty"),
    ("USCA", "Urban Smart City Authority", "Urban Development (Fictional)", "Urban", "Pune", "Shri K. Deshpande"),
    ("DRES", "Directorate of Rural e-Services", "Rural Development (Fictional)", "Rural", "Jaipur", "Smt. P. Rathore"),
    ("TLD", "Transport & Logistics Directorate", "Transport (Fictional)", "Transport", "Chennai", "Shri M. Subramanian"),
    ("PUD", "Power & Utilities Directorate", "Power (Fictional)", "Energy", "Guwahati", "Shri D. Baruah"),
]

# Department In-Charge accounts (first three are the documented demo logins)
DEPT_USERS = [
    ("department@nielit-demo.local", "Rakesh Sharma", "SCIB", "Deputy Superintendent (Training)"),
    ("department2@nielit-demo.local", "Anjali Kapoor", "DDG", "Joint Director (IT)"),
    ("department3@nielit-demo.local", "Sudipta Mohanty", "DHI", "Deputy Director (Informatics)"),
    ("incharge.dpft@nielit-demo.local", "Vivek Tripathi", "DPFT", "Under Secretary (Training)"),
    ("incharge.usca@nielit-demo.local", "Kiran Deshpande", "USCA", "Chief Technology Officer"),
    ("incharge.dres@nielit-demo.local", "Pooja Rathore", "DRES", "Deputy Director (e-Services)"),
    ("incharge.tld@nielit-demo.local", "Murali Subramanian", "TLD", "Assistant Director (IT)"),
    ("incharge.pud@nielit-demo.local", "Dipankar Baruah", "PUD", "Executive Engineer (IT)"),
]

FIRST = ["Aarav", "Vihaan", "Ishaan", "Kabir", "Reyansh", "Aditya", "Siddharth", "Karthik", "Nikhil", "Pranav", "Rohan",
         "Varun", "Harsh", "Manish", "Deepak", "Suresh", "Gaurav", "Amit", "Tarun", "Yash", "Ananya", "Diya", "Ishita",
         "Kavya", "Meera", "Nandini", "Pooja", "Riya", "Sneha", "Tanvi", "Aishwarya", "Bhavna", "Divya", "Gayatri",
         "Jyoti", "Lakshmi", "Neha", "Payal", "Radhika", "Shruti", "Swati", "Vandana", "Zoya", "Imran", "Farhan",
         "Gurpreet", "Harpreet", "Joseph", "Lalit", "Mohit", "Naveen", "Om", "Prakash", "Rahul", "Sandeep", "Tushar"]
LAST = ["Agarwal", "Bhat", "Chatterjee", "Das", "Fernandes", "Ghosh", "Gupta", "Hegde", "Iyer", "Jain", "Kapoor",
        "Khan", "Kulkarni", "Malhotra", "Mishra", "Nair", "Pandey", "Patel", "Pillai", "Rao", "Reddy", "Saxena",
        "Sen", "Shetty", "Singh", "Sinha", "Srinivasan", "Thakur", "Varma", "Yadav", "Bora", "Dutta", "Menon", "Naidu"]

DESIGNATIONS = {
    "SCIB": ["Sub-Inspector (Cyber Cell)", "Inspector (Cyber Crime)", "Forensic Analyst", "Head Constable (Technical)"],
    "DDG": ["Assistant Programmer", "System Analyst", "Section Officer (IT)", "Technical Officer"],
    "DPFT": ["Accounts Officer", "Treasury Officer", "Assistant Section Officer", "IT Coordinator"],
    "DHI": ["Data Manager", "Health Informatics Officer", "System Administrator", "Assistant Programmer"],
    "USCA": ["Network Engineer", "Command Centre Operator", "IT Manager", "Project Engineer"],
    "DRES": ["Block e-Services Officer", "Data Entry Supervisor", "Assistant Programmer", "District IT Manager"],
    "TLD": ["Systems Officer", "Assistant Engineer (IT)", "Data Analyst", "Section Officer"],
    "PUD": ["SCADA Engineer", "Assistant Engineer", "IT Officer", "Network Administrator"],
}

ARCH = {  # attendance share, score mean, module pace factor, activity days range
    "strong": (0.95, 86, 1.25, (0, 2)),
    "avg": (0.86, 71, 1.05, (0, 3)),
    "weak": (0.80, 47, 0.45, (2, 5)),
    "poor_att": (0.68, 64, 0.85, (1, 4)),
    "critical": (0.45, 38, 0.40, (4, 6)),
    "inactive": (0.78, 60, 0.60, (9, 14)),
}

TODAY = date.today()


def _dt(d: date, hour: int = 10, minute: int = 0) -> datetime:
    """Local (IST) wall-clock on day d, stored as naive UTC."""
    return datetime.combine(d, time(hour, minute)) - timedelta(hours=5, minutes=30)


class Seeder:
    def __init__(self, db):
        self.db = db
        self.rng = random.Random(2026)
        self.now = utcnow()
        self.used_names: set[str] = set()
        self.seq = {"NL": 0, "NOM": 0}
        self.audit_rows: list[AuditLog] = []

    # ---------------- helpers ----------------
    def add(self, obj):
        self.db.add(obj)
        return obj

    def code(self, prefix: str) -> str:
        self.seq[prefix] += 1
        return f"{prefix}-{TODAY.year}-{self.seq[prefix]:04d}"

    def name(self) -> tuple[str, str]:
        while True:
            f, l = self.rng.choice(FIRST), self.rng.choice(LAST)
            if f"{f} {l}" not in self.used_names:
                self.used_names.add(f"{f} {l}")
                return f, l

    def audit(self, when: datetime, user: User | None, action: str, entity: str, entity_id, details: str = "",
              result: str = "SUCCESS"):
        self.add(AuditLog(created_at=when, user_id=user.id if user else None, user_email=user.email if user else None,
                          user_name=user.full_name if user else "System", role=user.role.code if user else None,
                          department_id=user.department_id if user else None, action=action, entity=entity,
                          entity_id=str(entity_id) if entity_id is not None else None, result=result, details=details,
                          ip_address="127.0.0.1"))

    def notify(self, user: User, when: datetime, title: str, msg: str, category: str, severity: str = "info",
               link: str | None = None, read: bool = False):
        self.add(Notification(user_id=user.id, title=title, message=msg, category=category, severity=severity, link=link,
                              is_read=read, created_at=when))

    # ---------------- reference data ----------------
    def roles(self):
        self.role = {}
        for code, name, desc in [
            (RoleCode.ADMIN, "NIELIT Administrator", "Programme-wide administration, approvals and reporting"),
            (RoleCode.DEPARTMENT, "Department In-Charge", "Nominates and monitors learners of one department"),
            (RoleCode.LEARNER, "Learner", "Accesses own training, progress and results"),
        ]:
            self.role[code] = self.add(Role(code=code, name=name, description=desc))
        seed_defaults(self.db)
        self.db.flush()

    def departments(self):
        self.dept = {}
        for code, name, ministry, cat, loc, contact in DEPARTMENTS:
            self.dept[code] = self.add(Department(
                code=code, name=name, ministry=ministry, category=cat, location=loc, contact_name=contact,
                contact_email=f"training.{code.lower()}@demo-gov.local", is_active=True,
                created_at=self.now - timedelta(days=150)))
        self.db.flush()

    def users(self):
        pwd = hash_password(settings.demo_password)
        self.pwd_hash = pwd
        self.admin = self.add(User(email="admin@nielit-demo.local", full_name="Dr. Kavita Raman", password_hash=pwd,
                                   role_id=self.role[RoleCode.ADMIN].id, designation="Programme Administrator, NIELIT (Demo)",
                                   created_at=self.now - timedelta(days=150)))
        self.admin2 = self.add(User(email="coordinator@nielit-demo.local", full_name="Sanjay Verma", password_hash=pwd,
                                    role_id=self.role[RoleCode.ADMIN].id, designation="Training Coordinator, NIELIT (Demo)",
                                    created_at=self.now - timedelta(days=150)))
        self.dept_user = {}
        for email, nm, dcode, desig in DEPT_USERS:
            self.dept_user[dcode] = self.add(User(email=email, full_name=nm, password_hash=pwd,
                                                  role_id=self.role[RoleCode.DEPARTMENT].id,
                                                  department_id=self.dept[dcode].id, designation=desig,
                                                  created_at=self.now - timedelta(days=140)))
        self.db.flush()

    # ---------------- curriculum ----------------
    def curriculum(self):
        self.course = {}
        self.modules: dict[str, list[Module]] = {}
        for c in cur.COURSES:
            course = self.add(Course(code=c["code"], title=c["title"], short_title=c["short_title"],
                                     description=c["description"], level=c["level"], version=c.get("version", "1.0"),
                                     delivery_mode=c.get("delivery_mode", "Blended"),
                                     planned_hours=c["planned_hours"],
                                     target_video_hours=c["target_video_hours"], min_qualification=c["min_qualification"],
                                     target_audience=c["target_audience"], ndu_course_ref=f"NDU-DEMO-{c['code']}-2026",
                                     pass_percentage=50, min_attendance=75))
            self.db.flush()
            self.course[c["code"]] = course
            mods = []
            for i, (title, desc, lessons) in enumerate(c["modules"], start=1):
                m = self.add(Module(course_id=course.id, sequence=i, title=title, description=desc,
                                    duration_minutes=self.rng.choice([180, 210, 240, 270])))
                self.db.flush()
                for j, lt in enumerate(lessons, start=1):
                    self.add(Lesson(module_id=m.id, sequence=j, title=lt,
                                    objective=f"By the end of this lesson the learner can explain and apply: {lt.lower()}."))
                mods.append(m)
            self.modules[c["code"]] = mods
        for c in cur.COURSES:
            if c["prerequisite"]:
                self.course[c["code"]].prerequisite_course_id = self.course[c["prerequisite"]].id
        self.db.flush()

        self.rubric = {}
        for title, ccode, desc, crit in cur.RUBRICS:
            criteria = [{"name": n, "max_score": m, "descriptor": d} for n, m, d in crit]
            self.rubric[title] = self.add(Rubric(title=title, course_id=self.course[ccode].id if ccode else None,
                                                 description=desc, criteria=criteria, total_score=sum(m for _, m, _ in crit)))
        self.db.flush()

        self.practical = {}
        for code, ccode, mseq, title, scen, obj, steps, tools, rub, mins in cur.PRACTICALS:
            self.practical[code] = self.add(Practical(
                code=code, course_id=self.course[ccode].id, module_id=self.modules[ccode][mseq - 1].id, title=title,
                scenario=scen, objective=obj, instructions=steps, tools=tools, max_score=100,
                rubric_id=self.rubric[rub].id, estimated_minutes=mins))
        self.db.flush()

        self.exercise = {}
        for code, ccode, mseq, lseq, title, etype, desc in cur.EXERCISES:
            m = self.modules[ccode][mseq - 1]
            lesson = self.db.scalar(select(Lesson).where(Lesson.module_id == m.id, Lesson.sequence == lseq))
            self.exercise[code] = self.add(Exercise(code=code, course_id=self.course[ccode].id, module_id=m.id,
                                                    lesson_id=lesson.id if lesson else None, title=title, description=desc,
                                                    exercise_type=etype, has_answer_key=True, max_score=10))
        self.db.flush()

        self.assessments: dict[str, list[Assessment]] = {}
        for ccode, course in self.course.items():
            mods = self.modules[ccode]
            lst = []
            for i, (suffix, title, atype, mseq, mx, pp, rub, prc) in enumerate(cur.assessments_for(ccode, len(mods)), start=1):
                module = mods[mseq - 1] if mseq else None
                t = title if atype != "Quiz" else (f"Quiz: {mods[0].title} & {mods[1].title}" if suffix == "01"
                                                   else f"Quiz: {module.title}")
                a = self.add(Assessment(code=f"AS-{ccode}-{suffix}", course_id=course.id,
                                        module_id=module.id if module else None, title=t, assessment_type=atype,
                                        max_score=mx, pass_percentage=pp, sequence=i, has_answer_key=atype in ("Quiz", "Final Assessment"),
                                        rubric_id=self.rubric[rub].id if rub else None,
                                        practical_id=self.practical[prc].id if prc else None))
                lst.append(a)
            self.assessments[ccode] = lst
        self.db.flush()

        # Content records (demo)
        all_restr = {k: True for k, _ in VIDEO_RESTRICTIONS}
        profiles = {
            "ready": dict(qc_original_content=True, qc_human_review=True, qc_srt=True, qc_vtt=True, qc_docx=True,
                          qc_pdf=True, qc_audio=True, qc_technical=True, qc_ai_disclosure=True),
            "pending_qc": dict(qc_original_content=True, qc_human_review=False, qc_srt=True, qc_vtt=True, qc_docx=True,
                               qc_pdf=True, qc_audio=False, qc_technical=True, qc_ai_disclosure=True),
            "pending_transcripts": dict(qc_original_content=True, qc_human_review=True, qc_srt=True, qc_vtt=True,
                                        qc_docx=False, qc_pdf=False, qc_audio=True, qc_technical=True, qc_ai_disclosure=True),
            "pending_captions": dict(qc_original_content=True, qc_human_review=True, qc_srt=False, qc_vtt=False,
                                     qc_docx=False, qc_pdf=False, qc_audio=True, qc_technical=True, qc_ai_disclosure=True),
            "needs_review": dict(qc_original_content=True, qc_human_review=False, qc_srt=True, qc_vtt=True, qc_docx=True,
                                 qc_pdf=False, qc_audio=False, qc_technical=True, qc_ai_disclosure=False, qc_needs_review=True,
                                 qc_notes="Audio clean-up tool applied; qualified reviewer must confirm narration integrity "
                                          "and complete the AI-usage disclosure before approval."),
            "early": dict(qc_original_content=True),
        }
        practical_for = {"CSA": "PR-CSA-01", "IOT": "PR-IOT-01", "CLF": "PR-CLF-01", "EDF": "PR-EDF-01"}
        exercise_for = {"CSA": "EX-CSA-01", "IOT": "EX-IOT-02", "CLF": "EX-CLF-02", "EDF": "EX-EDF-01"}
        for (code, title, ccode, mseq, lseq, mins, deep, instr, stage, qc, ai, desc, obj) in cur.VIDEOS:
            m = self.modules[ccode][mseq - 1]
            lesson = self.db.scalar(select(Lesson).where(Lesson.module_id == m.id, Lesson.sequence == lseq))
            prof = dict(profiles[qc])
            compliance = dict(all_restr) if qc in ("ready", "pending_qc", "pending_transcripts", "pending_captions") else \
                {k: (i < 7) for i, (k, _) in enumerate(VIDEO_RESTRICTIONS)}
            item = ContentItem(
                code=code, content_type="Video", title=title, description=desc, course_id=self.course[ccode].id,
                module_id=m.id, lesson_id=lesson.id if lesson else None, instructor=instr, duration_minutes=mins,
                learning_objective=obj, is_deep_dive=deep, production_status=stage,
                practical_id=self.practical[practical_for[ccode]].id, exercise_id=self.exercise[exercise_for[ccode]].id,
                assessment_id=self.assessments[ccode][1].id, resolution="1920x1080", aspect_ratio="16:9",
                frame_rate="25" if int(code[-3:]) % 2 else "30", file_format="MP4",
                codec="H.264" if int(code[-3:]) % 3 else "H.265", audio_sample_rate="48 kHz",
                compliance=compliance, ai_used=ai is not None,
                ai_tool=ai[0] if ai else None, ai_purpose=ai[1] if ai else None,
                ai_human_reviewer=ai[2] if ai and ai[2] != "Pending reviewer" else None,
                ai_disclosure_text=(f"{ai[0]} used for: {ai[1]}. All instructional content is original and was reviewed "
                                    f"by a qualified subject expert.") if ai else
                "No AI tools were used in the production of this instructional video.",
                qc_reviewed_by="Sanjay Verma" if qc != "early" else None,
                qc_reviewed_at=self.now - timedelta(days=self.rng.randint(1, 12)) if qc != "early" else None,
                created_at=self.now - timedelta(days=60), **prof,
            )
            if qc == "early":
                item.compliance = {}
            self.add(item)
        for code, title, ccode, mseq, desc in cur.RESOURCES:
            m = self.modules[ccode][mseq - 1]
            self.add(ContentItem(code=code, content_type="Resource", title=title, description=desc,
                                 course_id=self.course[ccode].id, module_id=m.id, duration_minutes=0,
                                 production_status="Approved", resolution=None, aspect_ratio=None, frame_rate=None,
                                 file_format=title.split("(")[-1].rstrip(")"), codec=None, audio_sample_rate=None,
                                 qc_original_content=True, qc_human_review=True, compliance={},
                                 created_at=self.now - timedelta(days=45)))
        self.db.flush()

    # ---------------- venues & trainers ----------------
    def venues_trainers(self):
        self.venue = {}
        for code, name, city, addr, cap, fac in [
            ("VEN-DEL", "NIELIT Demo Centre, New Delhi", "New Delhi", "Plot 3, CGO Complex, Lodhi Road, New Delhi - 110003", 60, "Projector, Lab, Internet, Recording"),
            ("VEN-LKO", "NIELIT Demo Centre, Lucknow", "Lucknow", "Sector-B, Aliganj, Lucknow - 226024", 40, "Projector, Internet"),
            ("VEN-BLR", "NIELIT Demo Lab, Bengaluru", "Bengaluru", "STPI Campus, Electronic City, Bengaluru - 560100", 30, "IoT Lab, Projector, Internet"),
            ("VEN-PUN", "NIELIT Demo Lab, Pune", "Pune", "Rajiv Gandhi Infotech Park, Hinjawadi, Pune - 411057", 30, "IoT Lab, Projector"),
            ("VEN-HYD", "NIELIT Demo Centre, Hyderabad", "Hyderabad", "Hitec City, Madhapur, Hyderabad - 500081", 40, "Projector, Lab, Internet"),
            ("VEN-CHN", "NIELIT Demo Centre, Chennai", "Chennai", "Tidel Park, Taramani, Chennai - 600113", 40, "Projector, Lab, Internet"),
        ]:
            self.venue[code] = self.add(TrainingVenue(code=code, name=name, city=city, address=addr, capacity=cap, facilities=fac))
        self.trainer = {}
        for code, name, email, exp, org in [
            ("TRN-MEERA", "Dr. Meera Krishnan", "meera.krishnan@nielit-demo.local", "Cyber security awareness, security culture", "NIELIT (Demo)"),
            ("TRN-ROHIT", "Rohit Bansal", "rohit.bansal@nielit-demo.local", "Phishing analysis, email security", "NIELIT (Demo)"),
            ("TRN-KAVYA", "Kavya Iyer", "kavya.iyer@nielit-demo.local", "IoT forensics, hardware interfacing", "NIELIT (Demo)"),
            ("TRN-ARVIND", "Arvind Menon", "arvind.menon@nielit-demo.local", "Embedded systems, device acquisition", "NIELIT (Demo)"),
            ("TRN-NEHA", "Neha Kulkarni", "neha.kulkarni@nielit-demo.local", "Cloud forensics, AWS/GCP investigations", "NIELIT (Demo)"),
            ("TRN-VIKRAM", "Vikram Rathore", "vikram.rathore@nielit-demo.local", "Enterprise DFIR, incident response", "NIELIT (Demo)"),
            ("TRN-FARAH", "Farah Siddiqui", "farah.siddiqui@nielit-demo.local", "Microsoft 365 investigations, KQL", "NIELIT (Demo)"),
            ("TRN-SAMEER", "Dr. Sameer Joshi", "sameer.joshi@nielit-demo.local", "Digital evidence, chain of custody", "NIELIT (Demo)"),
        ]:
            self.trainer[code] = self.add(Trainer(code=code, full_name=name, email=email, expertise=exp, organization=org))
        self.db.flush()

    # ---------------- batches ----------------
    def batches(self):
        T = TODAY
        spec = [
            # code, name, course, mode, location, venue, trainer, start, end, cap, instructor, status
            ("CYBER-AWARENESS-2026-01", "Cyber Security Awareness — Cohort 1", "CSA", "Physical", "NIELIT Demo Centre, New Delhi", "VEN-DEL", "TRN-MEERA", -100, -50, 30, "Dr. Meera Krishnan", "Completed"),
            ("CYBER-AWARENESS-2026-02", "Cyber Security Awareness — Cohort 2", "CSA", "Digital", "Online via NDU (Demo)", None, "TRN-ROHIT", -28, 21, 40, "Rohit Bansal", "Active"),
            ("CYBER-AWARENESS-2026-03", "Cyber Security Awareness — Cohort 3", "CSA", "Hybrid", "NIELIT Demo Centre, Lucknow", "VEN-LKO", "TRN-ROHIT", 30, 75, 40, "Rohit Bansal", "Planned"),
            ("IOT-FORENSICS-2026-01", "IoT Forensics — Cohort 1", "IOT", "Hybrid", "NIELIT Demo Lab, Bengaluru", "VEN-BLR", "TRN-KAVYA", -35, 35, 20, "Kavya Iyer", "Active"),
            ("IOT-FORENSICS-2026-02", "IoT Forensics — Cohort 2", "IOT", "Physical", "NIELIT Demo Lab, Pune", "VEN-PUN", "TRN-ARVIND", 40, 100, 20, "Arvind Menon", "Planned"),
            ("CLOUD-FORENSICS-2026-01", "Cloud Forensics — Cohort 1", "CLF", "Digital", "Online via NDU (Demo)", None, "TRN-NEHA", -30, 30, 30, "Neha Kulkarni", "Active"),
            ("CLOUD-FORENSICS-2026-02", "Cloud Forensics — Cohort 2", "CLF", "Hybrid", "NIELIT Demo Centre, New Delhi", "VEN-DEL", "TRN-NEHA", 14, 70, 30, "Neha Kulkarni", "Planned"),
            ("ENTERPRISE-DFIR-2026-01", "Enterprise DFIR — Cohort 1", "EDF", "Physical", "NIELIT Demo Centre, Hyderabad", "VEN-HYD", "TRN-VIKRAM", -21, 42, 20, "Vikram Rathore", "Active"),
            ("ENTERPRISE-DFIR-2026-02", "Enterprise DFIR — Cohort 2", "EDF", "Hybrid", "NIELIT Demo Centre, Chennai", "VEN-CHN", "TRN-FARAH", 45, 105, 20, "Farah Siddiqui", "Planned"),
        ]
        self.batch = {}
        for code, name, ccode, mode, loc, vcode, tcode, s, e, cap, instr, status in spec:
            self.batch[code] = self.add(Batch(code=code, name=name, course_id=self.course[ccode].id, mode=mode, location=loc,
                                              venue_id=self.venue[vcode].id if vcode else None,
                                              trainer_id=self.trainer[tcode].id if tcode else None,
                                              start_date=T + timedelta(days=s), end_date=T + timedelta(days=e), capacity=cap,
                                              instructor=f"{instr} (Demo Instructor)", status=status,
                                              created_at=self.now - timedelta(days=max(20, 20 - s))))
        self.db.flush()
        self.audit(self.now - timedelta(days=110), self.admin, "BATCH_CREATED", "Batch", "CYBER-AWARENESS-2026-01")

    def sessions(self):
        self.batch_sessions: dict[str, list[TrainingSession]] = {}
        for code, b in self.batch.items():
            if b.status not in ("Active", "Completed"):
                self.batch_sessions[code] = []
                continue
            days = (0, 2, 4) if b.mode == "Digital" else (1, 3)
            mods = self.modules[[c for c, x in self.course.items() if x.id == b.course_id][0]]
            span = (b.end_date - b.start_date).days or 1
            out = []
            d = b.start_date
            n = 0
            while d <= b.end_date:
                if d.weekday() in days:
                    n += 1
                    frac = (d - b.start_date).days / span
                    m = mods[min(int(frac * len(mods)), len(mods) - 1)]
                    out.append(self.add(TrainingSession(batch_id=b.id, session_date=d, session_no=1,
                                                        title=f"M{m.sequence}: {m.title}", module_id=m.id,
                                                        start_time="10:00" if b.mode != "Digital" else "15:00",
                                                        end_time="13:00" if b.mode != "Digital" else "17:00",
                                                        mode=b.mode, attendance_marked=d < TODAY)))
                d += timedelta(days=1)
            self.batch_sessions[code] = out
        self.db.flush()

    # ---------------- learners & workflow ----------------
    def make_learner(self, dcode: str, qual: str, *, email: str | None = None, full: tuple[str, str] | None = None,
                     designation: str | None = "auto", created: datetime | None = None, emp_ok: bool = True) -> Learner:
        f, l = full or self.name()
        if full:
            self.used_names.add(f"{f} {l}")
        n = self.seq["NL"] + 1
        desig = self.rng.choice(DESIGNATIONS[dcode]) if designation == "auto" else designation
        learner = self.add(Learner(
            learner_code=self.code("NL"), employee_id=f"{dcode}-EMP-{1000 + n * 7}" if emp_ok else "TEMP",
            full_name=f"{f} {l}", email=email or f"{f.lower()}.{l.lower()}{n}@{dcode.lower()}.demo-gov.local",
            mobile=f"9{self.rng.randint(100000000, 999999999)}", designation=desig, qualification=qual,
            department_id=self.dept[dcode].id, location=self.dept[dcode].location, status="Registered",
            created_by_id=self.dept_user[dcode].id, created_at=created or self.now - timedelta(days=60)))
        self.db.flush()
        return learner

    def history(self, nom: Nomination, when: datetime, user: User, frm: str, to: str, action: str, remarks: str | None = None,
                audit_action: str | None = None, details: str | None = None):
        self.add(NominationHistory(nomination_id=nom.id, from_status=frm, to_status=to, action=action, remarks=remarks,
                                   user_id=user.id, user_name=user.full_name, created_at=when))
        if audit_action:
            self.audit(when, user, audit_action, "Nomination" if audit_action not in ("LEARNER_ONBOARDED",) else "Learner",
                       nom.nomination_no if audit_action != "LEARNER_ONBOARDED" else nom.learner.learner_code,
                       details or f"{nom.learner.full_name} → {nom.course.short_title}")

    def nominate(self, learner: Learner, ccode: str, target: str, t0: datetime, mode: str = "Digital",
                 batch_code: str | None = None, remarks: str | None = None) -> Nomination:
        course = self.course[ccode]
        dept_code = [c for c, d in self.dept.items() if d.id == learner.department_id][0]
        du = self.dept_user[dept_code]
        nom = self.add(Nomination(nomination_no=self.code("NOM"), learner_id=learner.id, department_id=learner.department_id,
                                  course_id=course.id, training_mode=mode, status=S.DRAFT, created_by_id=du.id,
                                  justification=self.rng.choice([
                                      "Officer handles digital evidence in ongoing investigations.",
                                      "Required for departmental cyber-resilience plan.",
                                      "Nominated as departmental cyber security nodal officer.",
                                      "Role involves administering cloud-hosted citizen services.",
                                      "Capacity building under departmental training calendar 2026."]),
                                  created_at=t0, updated_at=t0))
        self.db.flush()
        nom.learner = learner
        nom.course = course
        learner.status = "Nominated"
        self.history(nom, t0, du, "", S.DRAFT, "Nomination created", audit_action="NOMINATION_CREATED")
        if target == S.DRAFT:
            return nom
        t = t0 + timedelta(hours=20)
        self.history(nom, t, du, S.DRAFT, S.SUBMITTED, "Submitted to NIELIT", audit_action="NOMINATION_SUBMITTED")
        nom.status, nom.submitted_at, nom.updated_at = S.SUBMITTED, t, t
        if target == S.SUBMITTED:
            return nom
        t += timedelta(days=1, hours=2)
        admin = self.admin if self.rng.random() < 0.7 else self.admin2
        self.history(nom, t, admin, S.SUBMITTED, S.UNDER_REVIEW, "Review started", audit_action="NOMINATION_REVIEW")
        nom.status, nom.reviewed_by_id, nom.reviewed_at, nom.updated_at = S.UNDER_REVIEW, admin.id, t, t
        # Eligibility (real engine)
        result, rules = eligibility.evaluate(self.db, learner, course, self.dept[dept_code], exclude_nomination_id=nom.id)
        t += timedelta(minutes=12)
        self.add(EligibilityCheck(nomination_id=nom.id, result=result, rules=rules, checked_by_id=admin.id,
                                  checked_by_name=admin.full_name, created_at=t))
        nom.eligibility_result = result
        to = {"ELIGIBLE": S.ELIGIBLE, "NOT_ELIGIBLE": S.INELIGIBLE}.get(result, S.UNDER_REVIEW)
        failed = [r["message"] for r in rules if r["outcome"] != "PASS"]
        self.history(nom, t, admin, S.UNDER_REVIEW, to, f"Eligibility check: {result.replace('_', ' ').title()}",
                     "; ".join(failed) or "All demo rules passed", audit_action="ELIGIBILITY_CHECK", details=f"Result: {result}")
        nom.status, nom.updated_at = to, t
        if target in (S.UNDER_REVIEW, S.ELIGIBLE, S.INELIGIBLE):
            assert nom.status == target, f"{nom.nomination_no} expected {target} got {nom.status} {failed}"
            return nom
        if target == S.REJECTED:
            t += timedelta(hours=3)
            r = remarks or "Nomination quota for this cohort is exhausted; please re-nominate for the next cohort."
            self.history(nom, t, admin, nom.status, S.REJECTED, "Rejected by NIELIT", r, audit_action="NOMINATION_REJECTED",
                         details=r)
            nom.status, nom.decision_remarks, nom.updated_at = S.REJECTED, r, t
            return nom
        assert result != "NOT_ELIGIBLE", f"{learner.full_name} unexpectedly ineligible: {failed}"
        t += timedelta(hours=3)
        r = remarks or ("Approved — meets programme criteria." if result == "ELIGIBLE" else
                        "Approved on review — department confirmed equivalent experience.")
        self.history(nom, t, admin, nom.status, S.APPROVED, "Approved by NIELIT", r, audit_action="NOMINATION_APPROVED",
                     details=r)
        nom.status, nom.decision_remarks, nom.updated_at = S.APPROVED, r, t
        learner.status = "Approved"
        if target == S.APPROVED:
            return nom
        t += timedelta(hours=1)
        enr = self.add(CourseEnrollment(learner_id=learner.id, course_id=course.id, nomination_id=nom.id,
                                        status="Allocated", allocated_at=t, created_at=t))
        self.db.flush()
        nom.allocated_course_id = course.id
        self.history(nom, t, admin, S.APPROVED, S.ALLOCATED, f"Course allocated: {course.title}",
                     audit_action="COURSE_ALLOCATED")
        nom.status, nom.updated_at = S.ALLOCATED, t
        learner.status = "Allocated"
        nom._enr = enr  # type: ignore[attr-defined]
        if not batch_code:
            return nom
        b = self.batch[batch_code]
        t += timedelta(days=1)
        be = self.add(BatchEnrollment(batch_id=b.id, learner_id=learner.id, enrollment_id=enr.id, status="Assigned",
                                      created_at=t))
        enr.batch_id, enr.status = b.id, "Batch Assigned"
        nom.allocated_batch_id = b.id
        self.history(nom, t, admin, S.ALLOCATED, S.ALLOCATED, f"Batch allocated: {b.code}", audit_action="BATCH_ALLOCATED",
                     details=f"{learner.full_name} → {b.code}")
        nom.updated_at = t
        if target == S.ALLOCATED:
            return nom
        t_on = min(_dt(b.start_date - timedelta(days=2), 11), self.now - timedelta(hours=2))
        t_on = max(t_on, t + timedelta(hours=2))
        enr.status, enr.onboarded_at = "Onboarded", t_on
        be.status, be.onboarded_at = "Onboarded", t_on
        nom.onboarded_at = t_on
        self.history(nom, t_on, admin, S.ALLOCATED, S.ONBOARDED, "Learner onboarded", audit_action="LEARNER_ONBOARDED",
                     details=f"{learner.full_name} onboarded to {b.code}")
        nom.status, nom.updated_at = S.ONBOARDED, t_on
        learner.status = "Onboarded"
        return nom

    def onboarded_cohorts(self):
        """Onboarded learners per batch with performance archetypes."""
        plan = {
            "CYBER-AWARENESS-2026-01": [("DDG", "strong"), ("DPFT", "avg"), ("DHI", "strong"), ("USCA", "avg"),
                                        ("DRES", "avg"), ("TLD", "strong"), ("PUD", "avg"), ("SCIB", "strong"),
                                        ("DPFT", "poor_att"), ("DRES", "avg")],
            "CYBER-AWARENESS-2026-02": [("DDG", "avg"), ("DPFT", "strong"), ("DRES", "weak"), ("TLD", "poor_att"),
                                        ("PUD", "avg"), ("DHI", "strong"), ("USCA", "inactive"), ("DPFT", "avg"),
                                        ("SCIB", "avg")],
            "IOT-FORENSICS-2026-01": [("SCIB", "strong"), ("USCA", "avg"), ("SCIB", "critical"), ("PUD", "avg"),
                                      ("TLD", "weak"), ("DDG", "strong"), ("SCIB", "avg")],
            "CLOUD-FORENSICS-2026-01": [("SCIB", "demo"), ("DDG", "strong"), ("SCIB", "avg"), ("DHI", "poor_att"),
                                        ("DPFT", "avg"), ("SCIB", "inactive"), ("USCA", "strong"), ("SCIB", "weak")],
            "ENTERPRISE-DFIR-2026-01": [("DHI", "demo3"), ("SCIB", "strong"), ("DDG", "avg"), ("SCIB", "critical"),
                                        ("PUD", "avg"), ("TLD", "strong"), ("DHI", "avg")],
        }
        self.cohort: list[tuple[Learner, Nomination, str, str]] = []
        self.demo_learners = {}
        for bcode, members in plan.items():
            b = self.batch[bcode]
            ccode = [c for c, x in self.course.items() if x.id == b.course_id][0]
            t0 = _dt(b.start_date - timedelta(days=21), 11)
            for i, (dcode, arch) in enumerate(members):
                tech = ccode != "CSA"
                if arch == "demo":
                    learner = self.make_learner(dcode, "Graduate (Engineering/IT)", email="learner@nielit-demo.local",
                                                full=("Arjun", "Mehta"), designation="Sub-Inspector (Cyber Cell)",
                                                created=t0 - timedelta(days=3))
                    self.demo_learners["learner"] = learner
                    arch = "demo"
                elif arch == "demo3":
                    learner = self.make_learner(dcode, "Post Graduate", email="learner3@nielit-demo.local",
                                                full=("Rahul", "Verma"), designation="System Administrator",
                                                created=t0 - timedelta(days=3))
                    self.demo_learners["learner3"] = learner
                    arch = "poor_att"
                elif bcode == "CYBER-AWARENESS-2026-02" and i == 0:
                    learner = self.make_learner(dcode, "Graduate", email="learner2@nielit-demo.local",
                                                full=("Priya", "Nair"), designation="Section Officer (IT)",
                                                created=t0 - timedelta(days=3))
                    self.demo_learners["learner2"] = learner
                else:
                    qual = self.rng.choice(["Graduate (Engineering/IT)", "Post Graduate"]) if tech else \
                        self.rng.choice(["Higher Secondary (12th)", "Diploma", "Graduate", "Graduate", "Post Graduate"])
                    learner = self.make_learner(dcode, qual, created=t0 - timedelta(days=3))
                nom = self.nominate(learner, ccode, S.ONBOARDED, t0 + timedelta(hours=i * 5), mode=b.mode, batch_code=bcode)
                self.cohort.append((learner, nom, bcode, arch))

    def pipeline(self):
        """Nominations at every other workflow stage."""
        base = self.now - timedelta(days=9)
        items = [
            # (dept, course, target, qualification, designation, batch, remarks, days_ago)
            ("DDG", "CLF", S.APPROVED, "Graduate (Engineering/IT)", "auto", None, None, 6),
            ("PUD", "IOT", S.ALLOCATED, "Post Graduate", "auto", None, None, 7),
            ("USCA", "EDF", S.ALLOCATED, "Graduate (Engineering/IT)", "auto", "ENTERPRISE-DFIR-2026-02", None, 8),
            ("TLD", "CSA", S.ELIGIBLE, "Graduate", "auto", None, None, 4),
            ("SCIB", "IOT", S.ELIGIBLE, "Graduate (Engineering/IT)", "auto", None, None, 3),
            ("DRES", "CLF", S.UNDER_REVIEW, "Graduate", "auto", None, None, 4),
            ("DPFT", "EDF", S.UNDER_REVIEW, "Graduate (Engineering/IT)", None, None, None, 3),
            ("SCIB", "CLF", S.SUBMITTED, "Graduate (Engineering/IT)", "auto", None, None, 1),
            ("DDG", "CSA", S.SUBMITTED, "Diploma", "auto", None, None, 2),
            ("DHI", "EDF", S.SUBMITTED, "Post Graduate", "auto", None, None, 1),
            ("DPFT", "CSA", S.SUBMITTED, "Graduate", "auto", None, None, 3),
            ("USCA", "IOT", S.SUBMITTED, "Graduate (Engineering/IT)", "auto", None, None, 2),
            ("DRES", "IOT", S.INELIGIBLE, "Higher Secondary (12th)", "auto", None, None, 5),
            ("TLD", "CLF", S.INELIGIBLE, "Diploma", "auto", None, None, 6),
            ("PUD", "CSA", S.REJECTED, "Graduate", "auto", None,
             "Officer already nominated under a parallel state awareness programme this quarter.", 12),
            ("DHI", "IOT", S.REJECTED, "Graduate (Engineering/IT)", "auto", None,
             "Department requested withdrawal — officer transferred to a non-technical post.", 15),
            ("SCIB", "EDF", S.DRAFT, "Graduate (Engineering/IT)", "auto", None, None, 1),
            ("DDG", "CLF", S.DRAFT, "Post Graduate", "auto", None, None, 1),
            ("DHI", "CSA", S.DRAFT, "Higher Secondary (12th)", "auto", None, None, 2),
        ]
        self.pipeline_noms = []
        for dcode, ccode, target, qual, desig, bcode, remarks, ago in items:
            t0 = self.now - timedelta(days=ago, hours=self.rng.randint(1, 6))
            learner = self.make_learner(dcode, qual, designation=desig, created=t0 - timedelta(hours=2))
            nom = self.nominate(learner, ccode, target, t0, mode=self.rng.choice(["Digital", "Hybrid", "Physical"]),
                                batch_code=bcode, remarks=remarks)
            self.pipeline_noms.append(nom)
        _ = base

    # ---------------- learning activity ----------------
    def activity(self):
        """Attendance, assessments, practicals, NDU-reported progress for onboarded learners."""
        self.enrollments: list[tuple[CourseEnrollment, str]] = []
        for learner, nom, bcode, arch in self.cohort:
            b = self.batch[bcode]
            ccode = [c for c, x in self.course.items() if x.id == b.course_id][0]
            enr = nom._enr  # type: ignore[attr-defined]
            self.enrollments.append((enr, arch))
            att_share, score_mean, pace, act = ARCH.get(arch, ARCH["avg"])
            pace *= self.rng.uniform(0.85, 1.2)
            span = max((b.end_date - b.start_date).days, 1)
            frac = 1.0 if b.status == "Completed" else max(0.0, min(1.0, (TODAY - b.start_date).days / span))
            completed_batch = b.status == "Completed"

            # Attendance — exact share for predictable demo outcomes
            past = [s for s in self.batch_sessions[bcode] if s.session_date < TODAY]
            if arch == "demo":
                statuses = ["Present"] * len(past)
                if len(past) >= 3:
                    statuses[-3] = "Late"
                if len(past) >= 6:
                    statuses[2] = "Absent"
            else:
                share = att_share if not (completed_batch and arch != "poor_att") else max(att_share, 0.88)
                n_att = round(len(past) * share)
                statuses = ["Present"] * n_att + ["Absent"] * (len(past) - n_att)
                self.rng.shuffle(statuses)
                for k in range(len(statuses)):
                    if statuses[k] == "Present" and self.rng.random() < 0.07:
                        statuses[k] = "Late"
                    elif statuses[k] == "Absent" and self.rng.random() < 0.15 and arch not in ("critical", "poor_att"):
                        statuses[k] = "Excused"
            for s, st in zip(past, statuses):
                self.add(Attendance(session_id=s.id, batch_id=b.id, learner_id=learner.id, status=st,
                                    marked_by_id=self.admin2.id, created_at=_dt(s.session_date, 18)))

            # NDU-reported learning progress (modules & videos)
            mods = self.modules[ccode]
            n_videos = sum(1 for v in cur.VIDEOS if v[2] == ccode)
            if arch == "demo":
                m_done, c_done = 6, n_videos
            elif completed_batch:
                m_done, c_done = len(mods), n_videos
            else:
                m_done = min(len(mods), int(math.floor(len(mods) * min(1.0, frac * pace))))
                c_done = min(n_videos, int(math.floor(n_videos * min(1.0, frac * pace + 0.1))))
            prog = progress.ensure_progress(self.db, enr)
            prog.modules_completed, prog.content_completed, prog.last_source = m_done, c_done, "NDU"
            lo, hi = act
            last = self.now - timedelta(days=self.rng.randint(lo, hi), hours=self.rng.randint(1, 8))
            if completed_batch:
                last = _dt(b.end_date, 16)
            if arch == "demo":
                last = self.now - timedelta(hours=26)
            prog.last_activity_at = last
            learner.last_activity_at = last

            # Assessments
            dues = [0.2, 0.45, 0.7, 0.8, 1.0]
            for a, due in zip(self.assessments[ccode], dues):
                if arch == "demo":
                    preset = {0: 16, 1: 15}
                    idx = self.assessments[ccode].index(a)
                    if idx not in preset:
                        continue
                    score = preset[idx]
                else:
                    if due > frac + 1e-9:
                        continue
                    if arch == "inactive" and due > frac - 0.15 and not completed_batch:
                        continue
                    pct = self.rng.gauss(score_mean, 7)
                    if completed_batch and arch != "poor_att":
                        pct = max(pct, 58)
                    pct = max(18.0, min(98.0, pct))
                    score = round(pct * a.max_score / 100 * 2) / 2
                when = _dt(b.start_date + timedelta(days=int(span * min(due, 1.0))), 15) if not completed_batch else \
                    _dt(b.start_date + timedelta(days=int(span * due) - 1), 15)
                when = min(when, self.now - timedelta(hours=5))
                pct_v = round(100 * score / a.max_score, 1)
                evaluator = self.admin2
                self.add(AssessmentResult(assessment_id=a.id, learner_id=learner.id, course_id=a.course_id,
                                          module_id=a.module_id, score=score, max_score=a.max_score, percentage=pct_v,
                                          passed=pct_v >= a.pass_percentage, remarks=self._remark(pct_v),
                                          evaluator_id=evaluator.id, evaluator_name=evaluator.full_name, evaluated_at=when,
                                          created_at=when))
                self.audit(when, evaluator, "ASSESSMENT_RECORDED", "AssessmentResult", None,
                           f"{learner.full_name} — {a.title}: {score:g}/{a.max_score:g} ({pct_v:.0f}%)")

            # Practicals
            prs = [p for p in self.practical.values() if p.course_id == b.course_id]
            prs.sort(key=lambda p: p.code)
            for p, due in zip(prs, [0.6, 0.9]):
                if arch == "demo":
                    status, score = ("Evaluated", 78.0) if p.code.endswith("01") else ("In Progress", None)
                elif due <= frac:
                    if arch in ("weak", "inactive") and self.rng.random() < 0.5:
                        status, score = "Submitted", None
                    elif arch == "critical":
                        status, score = "In Progress", None
                    else:
                        status, score = "Evaluated", float(round(max(45, min(97, self.rng.gauss(score_mean + 4, 7)))))
                elif due <= frac + 0.25 and arch in ("strong", "avg"):
                    status, score = "In Progress", None
                else:
                    continue
                if completed_batch and arch != "poor_att":
                    status, score = "Evaluated", float(round(max(60, min(97, self.rng.gauss(score_mean + 4, 6)))))
                crit = p.rubric.criteria if p.rubric else []
                rubric_scores = None
                if status == "Evaluated" and crit:
                    rubric_scores = {c["name"]: round(c["max_score"] * score / 100) for c in crit}
                when = min(_dt(b.start_date + timedelta(days=int(span * min(due, 1.0))), 17), self.now - timedelta(hours=6))
                self.add(PracticalSubmission(practical_id=p.id, learner_id=learner.id, status=status, score=score,
                                             rubric_scores=rubric_scores,
                                             remarks="Well-structured methodology; strengthen evidence correlation."
                                             if status == "Evaluated" else None,
                                             submitted_at=when if status in ("Submitted", "Evaluated") else None,
                                             evaluated_by_id=self.admin2.id if status == "Evaluated" else None,
                                             evaluated_at=when + timedelta(days=1) if status == "Evaluated" else None,
                                             created_at=when))
        self.db.flush()

    @staticmethod
    def _remark(pct: float) -> str:
        if pct >= 85:
            return "Excellent understanding."
        if pct >= 70:
            return "Good grasp of concepts."
        if pct >= 50:
            return "Satisfactory; revise weaker topics."
        return "Below pass mark — remedial session recommended."

    def finalise(self):
        for enr, arch in self.enrollments:
            progress.recompute(self.db, enr, self.now)
        self.db.flush()
        # Completed cohort — mark eligible learners completed (leave one Eligible for the demo)
        b = self.batch["CYBER-AWARENESS-2026-01"]
        recs = self.db.scalars(select(CompletionRecord).join(CourseEnrollment, CourseEnrollment.id == CompletionRecord.enrollment_id)
                               .where(CourseEnrollment.batch_id == b.id).order_by(CompletionRecord.id)).all()
        eligible = [r for r in recs if r.status == CompletionStatus.ELIGIBLE]
        for r in eligible[:-1]:
            enr = self.db.get(CourseEnrollment, r.enrollment_id)
            r.status = CompletionStatus.COMPLETED
            r.completed_at = _dt(b.end_date + timedelta(days=4), 12)
            r.completed_by_id = self.admin.id
            r.certificate_no = f"DEMO-CERT-CSA-{enr.learner.learner_code[-4:]}-{enr.id:04d}"
            enr.status = "Completed"
            enr.learner.status = "Completed"
            self.audit(r.completed_at, self.admin, "COURSE_COMPLETED", "Enrolment", enr.id,
                       f"{enr.learner.full_name} completed {enr.course.title}; {r.certificate_no}")
        for enr in self.db.scalars(select(CourseEnrollment)).all():
            progress.recompute(self.db, enr, self.now)
        self.db.flush()

    # ---------------- accounts, NDU, notifications, audit ----------------
    def learner_accounts(self):
        for learner, nom, bcode, arch in self.cohort:
            self.add(User(email=learner.email, full_name=learner.full_name, password_hash=self.pwd_hash,
                          role_id=self.role[RoleCode.LEARNER].id, department_id=learner.department_id,
                          learner_id=learner.id, designation=learner.designation, created_at=nom.onboarded_at))
        self.db.flush()
        self.learner_user = {k: self.db.scalar(select(User).where(User.learner_id == v.id))
                             for k, v in self.demo_learners.items()}

    def ndu(self):
        for enr, arch in self.enrollments:
            learner, course = enr.learner, enr.course
            p = self.db.scalar(select(LearnerProgress).where(LearnerProgress.enrollment_id == enr.id))
            ref = "NDU-L-" + hashlib.sha1(learner.learner_code.encode()).hexdigest()[:8].upper()
            synced_at = self.now - timedelta(hours=self.rng.randint(2, 30))
            comp = self.db.scalar(select(CompletionRecord).where(CompletionRecord.enrollment_id == enr.id))
            self.add(NduEnrollment(learner_id=learner.id, course_id=course.id, enrollment_id=enr.id, ndu_learner_ref=ref,
                                   ndu_course_ref=course.ndu_course_ref, sync_status="Synced", learner_synced=True,
                                   progress_synced=True, completion_synced=comp.status == CompletionStatus.COMPLETED,
                                   ndu_progress_pct=p.overall_pct, last_synced_at=synced_at, created_at=enr.onboarded_at))
            self.add(NduSyncLog(sync_type="Learner Enrolment", learner_id=learner.id, course_id=course.id,
                                field="ndu_enrollment", old_value="Not enrolled", new_value="Enrolled", result="Success",
                                message=f"Learner profile registered in demo NDU; enrolled in {course.ndu_course_ref}",
                                triggered_by_id=self.admin.id, triggered_by_name=self.admin.full_name,
                                created_at=enr.onboarded_at + timedelta(minutes=2)))
        # Periodic batch syncs over the last week (with two simulated failures)
        for d in range(7, 0, -1):
            when = self.now - timedelta(days=d, hours=-2)
            fail = d in (5,)
            self.add(NduSyncLog(sync_type="Progress Sync", field="progress_pct", result="Failure" if fail else "Success",
                                message="Demo NDU endpoint timeout (simulated) — will retry on next schedule" if fail else
                                f"Progress pushed for {len(self.enrollments) - 10} enrolment(s) (demo)",
                                records_processed=0 if fail else len(self.enrollments) - 10, triggered_by_name="Scheduled (Demo)",
                                created_at=when))
            if fail:
                self.add(NduSyncLog(sync_type="Progress Sync", field="progress_pct", result="Success",
                                    message="Retry succeeded (demo)", records_processed=len(self.enrollments) - 10,
                                    triggered_by_name="Scheduled (Demo)", created_at=when + timedelta(minutes=30)))
        self.add(NduSyncLog(sync_type="Learner Sync", field="learner_profile", result="Failure",
                            message="1 learner profile rejected by demo NDU: mobile number format (simulated)",
                            records_processed=1, triggered_by_id=self.admin2.id, triggered_by_name=self.admin2.full_name,
                            created_at=self.now - timedelta(days=3, hours=4)))
        # Some NDU → Portal learning updates
        for enr, arch in self.enrollments[10:22:3]:
            p = self.db.scalar(select(LearnerProgress).where(LearnerProgress.enrollment_id == enr.id))
            self.add(NduSyncLog(sync_type="NDU Learning Update", direction="NDU → Portal", learner_id=enr.learner_id,
                                course_id=enr.course_id, field="overall_progress",
                                old_value=f"{max(p.overall_pct - 6, 0):.0f}%", new_value=f"{p.overall_pct:.0f}%",
                                result="Success", message="Demo NDU reported new module completion",
                                triggered_by_name="Scheduled (Demo)",
                                created_at=self.now - timedelta(days=self.rng.randint(1, 4), hours=3)))
        self.db.flush()

    def notifications(self):
        n = self.now
        a = self.admin
        for nom in [x for x in self.pipeline_noms if x.status == S.SUBMITTED]:
            self.notify(a, nom.submitted_at, "New nomination submitted",
                        f"{nom.department.code} submitted {nom.nomination_no}: {nom.learner.full_name} for {nom.course.short_title}.",
                        "nomination", link=f"/admin/nominations/{nom.id}")
        risky = self.db.scalars(select(LearnerProgress).where(LearnerProgress.risk_level.in_(("AT_RISK", "CRITICAL")))).all()
        for p in risky[:4]:
            self.notify(a, n - timedelta(hours=self.rng.randint(3, 40)), "Learner at risk",
                        f"{p.learner.full_name} ({p.course.short_title}) is {p.risk_level.replace('_', ' ').title()}: "
                        f"{'; '.join(p.risk_reasons[:2])}", "risk",
                        "critical" if p.risk_level == "CRITICAL" else "warning", f"/admin/learners/{p.learner_id}")
        self.notify(a, n - timedelta(days=1, hours=2), "NDU sync completed",
                    "Scheduled demo NDU progress sync completed successfully.", "ndu", "success", "/admin/ndu", read=True)
        self.notify(a, n - timedelta(days=2), "Content QC completed",
                    "VID-007 'AWS CloudTrail Investigation' passed all QC checks and is Ready.", "content", "success",
                    "/admin/content-qc", read=True)
        self.notify(a, n - timedelta(days=5), "Assessment pending",
                    "Practical Assessment results are pending for IOT-FORENSICS-2026-01.", "assessment", "info",
                    "/admin/assessments", read=True)
        # Department in-charges
        for code, du in self.dept_user.items():
            dept_noms = [x for x in self.pipeline_noms if x.department_id == du.department_id]
            for nom in dept_noms:
                if nom.status == S.REJECTED:
                    self.notify(du, nom.updated_at, "Nomination rejected", f"{nom.nomination_no}: {nom.learner.full_name} — "
                                f"{nom.decision_remarks}", "nomination", "warning", f"/department/nominations/{nom.id}")
                elif nom.status in (S.APPROVED, S.ALLOCATED):
                    self.notify(du, nom.updated_at, "Nomination approved",
                                f"{nom.nomination_no}: {nom.learner.full_name} approved for {nom.course.short_title}.",
                                "nomination", "success", f"/department/nominations/{nom.id}", read=True)
                elif nom.status == S.INELIGIBLE:
                    self.notify(du, nom.updated_at, "Nomination ineligible",
                                f"{nom.nomination_no}: {nom.learner.full_name} did not meet eligibility rules.",
                                "nomination", "warning", f"/department/nominations/{nom.id}")
            for p in [r for r in risky if r.learner.department_id == du.department_id][:3]:
                self.notify(du, n - timedelta(hours=self.rng.randint(4, 50)), "Learner at risk",
                            f"{p.learner.full_name} ({p.course.short_title}): {'; '.join(p.risk_reasons[:2])}", "risk",
                            "critical" if p.risk_level == "CRITICAL" else "warning", f"/department/learners/{p.learner_id}")
            onboarded = [c for c in self.cohort if c[0].department_id == du.department_id]
            for learner, nom, bcode, arch in onboarded[:2]:
                self.notify(du, nom.onboarded_at, "Learner onboarded", f"{learner.full_name} has been onboarded to {bcode}.",
                            "onboarding", "success", f"/department/learners/{learner.id}", read=True)
        # Learners
        for key, u in self.learner_user.items():
            learner = self.demo_learners[key]
            enr = next(e for e, _ in self.enrollments if e.learner_id == learner.id)
            self.notify(u, enr.onboarded_at, "Welcome to the programme",
                        f"You are onboarded to {enr.course.title}, batch {enr.batch.code}.", "onboarding", "success",
                        "/learner/dashboard", read=True)
            last_res = self.db.scalars(select(AssessmentResult).where(AssessmentResult.learner_id == learner.id)
                                       .order_by(AssessmentResult.evaluated_at.desc())).first()
            if last_res:
                self.notify(u, last_res.evaluated_at, "Assessment result published",
                            f"{last_res.assessment.title}: {last_res.score:g}/{last_res.max_score:g} ({last_res.percentage:.0f}%).",
                            "assessment", "success" if last_res.passed else "warning", "/learner/assessments")
            self.notify(u, n - timedelta(days=1, hours=5), "NDU sync completed",
                        "Your learning progress was synchronised with NDU (demo).", "ndu", "info", "/learner/progress")
            p = self.db.scalar(select(LearnerProgress).where(LearnerProgress.enrollment_id == enr.id))
            if p.attendance_pct is not None and p.attendance_pct < 75:
                self.notify(u, n - timedelta(hours=20), "Attendance warning",
                            f"Your attendance is {p.attendance_pct:.0f}% (minimum 75%).", "attendance", "warning",
                            "/learner/attendance")
            self.notify(u, n - timedelta(hours=3), "Upcoming session",
                        f"Next {enr.batch.code} session is scheduled — check your dashboard for details.", "session", "info",
                        "/learner/dashboard")

    def misc_audit(self):
        people = [self.admin, self.admin2] + list(self.dept_user.values())[:3] + list(self.learner_user.values())
        for d in range(12, 0, -1):
            for u in people:
                if self.rng.random() < 0.55:
                    t = self.now - timedelta(days=d, hours=self.rng.randint(1, 9))
                    self.audit(t, u, "LOGIN", "User", u.id)
                    if self.rng.random() < 0.4:
                        self.audit(t + timedelta(minutes=self.rng.randint(15, 90)), u, "LOGOUT", "User", u.id)
        self.audit(self.now - timedelta(days=13, hours=5), self.admin, "LOGIN", "User", self.admin.id, result="FAILURE",
                   details="Invalid credentials")
        for code, s_list in self.batch_sessions.items():
            for s in [x for x in s_list if x.session_date < TODAY][-4:]:
                self.audit(_dt(s.session_date, 18), self.admin2, "ATTENDANCE_SAVED", "Batch", code,
                           f"{s.session_date} session 1")
        for key, title in [("programme-summary", "Programme Summary"), ("at-risk", "At-Risk Report"),
                           ("nominations", "Nomination Report")]:
            t = self.now - timedelta(days=self.rng.randint(1, 6), hours=2)
            self.audit(t, self.admin, "REPORT_GENERATED", "Report", key, f"{title}")
            self.add(ReportLog(report_type=key, title=title, output_format="VIEW", filters={}, row_count=0,
                               generated_by_id=self.admin.id, generated_by_name=self.admin.full_name, role="ADMIN",
                               created_at=t))
        t = self.now - timedelta(days=2, hours=1)
        self.audit(t, self.admin, "REPORT_EXPORTED", "Report", "programme-summary", "Programme Summary as PDF")
        self.add(ReportLog(report_type="programme-summary", title="Programme Summary", output_format="PDF", filters={},
                           row_count=19, generated_by_id=self.admin.id, generated_by_name=self.admin.full_name,
                           role="ADMIN", created_at=t))
        for c in self.db.scalars(select(ContentItem).where(ContentItem.qc_reviewed_at.is_not(None))).all():
            self.audit(c.qc_reviewed_at, self.admin2, "CONTENT_QC", "Content", c.code, "QC checklist updated")
        for when in (self.now - timedelta(days=4), self.now - timedelta(days=1, hours=6)):
            self.audit(when, self.admin, "NDU_SYNC_PROGRESS", "NDU", None, "Demo progress sync")

    # ---------------- run ----------------
    def run(self) -> dict:
        self.roles()
        self.departments()
        self.users()
        self.curriculum()
        self.venues_trainers()
        self.batches()
        self.sessions()
        self.onboarded_cohorts()
        self.pipeline()
        self.activity()
        self.finalise()
        self.graduate_nominations()
        self.learner_accounts()
        self.ndu()
        self.notifications()
        self.misc_audit()
        self.db.flush()
        self.clamp_future()
        return self.summary()

    def clamp_future(self):
        """Safety net: no seeded event may be dated in the future."""
        from sqlalchemy import update

        cap = self.now - timedelta(minutes=10)
        for model, col in ((AuditLog, AuditLog.created_at), (NominationHistory, NominationHistory.created_at),
                           (Notification, Notification.created_at), (NduSyncLog, NduSyncLog.created_at),
                           (EligibilityCheck, EligibilityCheck.created_at), (Nomination, Nomination.updated_at),
                           (AssessmentResult, AssessmentResult.evaluated_at)):
            self.db.execute(update(model).where(col > cap).values({col.key: cap}))

    def graduate_nominations(self):
        """Completed CSA graduates nominated onward (prerequisite satisfied by completion)."""
        grads = [c for c in self.cohort if c[2] == "CYBER-AWARENESS-2026-01" and c[0].status == "Completed"]
        for (learner, _, _, _), (ccode, target) in zip(grads[:3], [("CLF", S.SUBMITTED), ("IOT", S.ELIGIBLE),
                                                                    ("EDF", S.SUBMITTED)]):
            t0 = self.now - timedelta(days=self.rng.randint(4, 7), hours=3)
            nom = self.nominate(learner, ccode, target, t0, mode="Hybrid")
            learner.status = "Completed"
            self.pipeline_noms.append(nom)

    def summary(self) -> dict:
        from sqlalchemy import func

        def c(m):
            return self.db.scalar(select(func.count()).select_from(m)) or 0
        return {
            "departments": c(Department), "users": c(User), "learners": c(Learner), "courses": c(Course),
            "modules": c(Module), "lessons": c(Lesson), "content_items": c(ContentItem), "practicals": c(Practical),
            "exercises": c(Exercise), "rubrics": c(Rubric), "assessments": c(Assessment), "batches": c(Batch),
            "nominations": c(Nomination), "enrolments": c(CourseEnrollment), "sessions": c(TrainingSession),
            "attendance": c(Attendance), "assessment_results": c(AssessmentResult),
            "practical_submissions": c(PracticalSubmission), "progress": c(LearnerProgress),
            "completion": c(CompletionRecord), "ndu_enrollments": c(NduEnrollment), "ndu_sync_logs": c(NduSyncLog),
            "notifications": c(Notification), "audit_logs": c(AuditLog),
        }


def seed() -> dict:
    import app.models  # noqa: F401

    with SessionLocal() as db:
        summary = Seeder(db).run()
        db.commit()
    log.info("Demo seed complete: %s", summary)
    return summary


def reset_and_seed() -> dict:
    import app.models  # noqa: F401

    engine.dispose()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    return seed()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(reset_and_seed())
