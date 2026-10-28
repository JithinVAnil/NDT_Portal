# NIELIT Digital Training Portal — Prototype

**Digital Training, Nomination, Monitoring & Reporting Portal**
for the *Digital Training & Forensics Capacity Building Programme*.

> **DEMONSTRATION ENVIRONMENT — SAMPLE DATA.** This is a prototype built for a live evaluation demo. It is **not** an
> official NIELIT production system. All people, departments, scores and content records are fictional.
> NIELIT Digital University (NDU) integration is a **Prototype / Demo integration** — no real NDU API is called.

---

## 1. Quick start (Windows)

### Option A — Docker Desktop (recommended)
1. Install Docker Desktop (free) and start it.
2. Double-click **`scripts\start-docker.bat`**, or run:
   ```bat
   copy .env.example .env
   docker compose up --build
   ```
3. Open **http://localhost:3000**. The database is created and demo data is loaded automatically on first start.

### Option B — No Docker
Requires **Python 3.11+** and **Node.js 20+** (both free).
1. Database — choose one:
   * **PostgreSQL 16** (free installer from postgresql.org), then run `psql -U postgres -f scripts\setup-local-postgres.sql`
   * **Emergency fallback:** no database server — set `DATABASE_URL=sqlite:///./nielit_demo.db` in `backend\.env`
     (fully functional for a demo; PostgreSQL remains the target database).
2. Run **`scripts\setup-local.bat`** (creates a Python virtual environment, installs packages, runs `npm install`).
3. Run **`scripts\start-local.bat`** — opens the API (port 8000) and the portal (port 3000).

Manual equivalent:
```bat
cd backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --port 8000

cd ..\frontend
npm install
npm run dev
```

| Service | URL |
|---|---|
| Portal (frontend) | http://localhost:3000 |
| API | http://localhost:8000 |
| API docs (Swagger / OpenAPI) | http://localhost:8000/docs |
| Database | PostgreSQL on localhost:5432 · db `nielit_portal` · user `nielit` |

## 2. Demo accounts

All demo accounts use the password **`Demo@12345`** (configurable via `DEMO_PASSWORD`). Passwords are intentionally
not shown in the portal UI.

| Role | Email | Notes |
|---|---|---|
| Administrator | `admin@nielit-demo.local` | Full programme administration |
| Administrator | `coordinator@nielit-demo.local` | Training coordinator |
| Department In-Charge | `department@nielit-demo.local` | State Cyber Investigation Bureau (SCIB) |
| Department In-Charge | `department2@nielit-demo.local` | Directorate of Digital Governance (DDG) |
| Department In-Charge | `department3@nielit-demo.local` | Department of Health Informatics (DHI) |
| Learner | `learner@nielit-demo.local` | Arjun Mehta — Cloud Forensics, on track (~65%) |
| Learner | `learner2@nielit-demo.local` | Priya Nair — Cyber Security Awareness |
| Learner | `learner3@nielit-demo.local` | Rahul Verma — Enterprise DFIR, **at risk** (attendance) |

Five further in-charge accounts (`incharge.<dept>@nielit-demo.local`) and accounts for every onboarded learner exist.
Learners onboarded during a demo get a portal account automatically (their email + the demo password).

## 3. Live demo walkthrough (≈15 minutes)

The same steps are available inside the portal: **Administrator → Demo Guide** (with a tick-off checklist).
Before presenting: **Settings → Reset Demo Data** (or `scripts\reset-demo-data.bat`).

1. **Department In-Charge logs in** — `department@nielit-demo.local`; department-scoped dashboard.
2. **Creates a learner nomination** — Nominations → *New nomination* → new learner, qualification
   *Graduate (Engineering/IT)*, course **Cloud Forensics**.
3. **Submits** — *Create & submit*. Admins receive an in-app notification.
4. **Administrator logs in** — `admin@nielit-demo.local`; *Pending Nominations* KPI has increased.
5. **Reviews** — Nominations → *Pending review* → open it → *Start review*.
6. **Eligibility check** — *Run eligibility check*; each demo rule shows ✓ / ⚠ / ✕ with its reason.
7. **Approve** — remarks optional when fully eligible (mandatory when "Review Required").
8. **Allocate Cloud Forensics** — creates the course enrolment, progress and completion records.
9. **Assign batch** — `CLOUD-FORENSICS-2026-01` (active) so attendance can be recorded today.
10. **Onboard learner** — creates the learner's portal account + demo NDU enrolment reference.
11. **Open learner / course** — Courses → Cloud Forensics.
12. **Instructional content** — expand *AWS CloudTrail* → lesson → **VID-007** video record (metadata, QC, player
    placeholder "DEMO CONTENT RECORD — VIDEO ASSET TO BE INSERTED").
13. **Practical** — PR-CLF-01 *CloudTrail Investigation* with its rubric (20/25/25/20/10).
14. **Assessment** — course assessments, pass marks, rubrics.
15. **Record attendance** — Attendance → batch → today → *Mark All Present* → *Save Attendance*.
16. **Update assessment** — Assessments → *Record score* → Cloud Forensics → Practical Assessment → learner →
    **86 / 100** → *Save score* (persists; progress, average score and risk recalculate).
17. **Show progress** — Progress page / learner record (modules, videos, practicals, assessments, attendance,
    expected-vs-actual progress).
18. **Show at-risk learner** — Progress → *At-risk learners* (each flag lists its reason); or sign in as
    `learner3@…` to see the learner view.
19. **Simulate NDU sync** — NDU Integration → *Arjun Mehta* → *Simulate NDU Update* (e.g. 65% → 74%); the sync log
    stores old value, new value, timestamp, learner, course and result.
20. **Generate report** — Reports → *Progress Report* → *Generate Report* → *Export Excel / PDF / CSV*.
21. **Open audit trail** — every step above is recorded with timestamp, user, role, action, entity, entity ID, result.

## 4. Technology stack (100% free / open source, runs locally)

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui-style components (Radix UI primitives, class-variance-authority) · Lucide icons · Recharts · TanStack Table · React Hook Form · Zod |
| Backend | Python · FastAPI · Pydantic v2 · SQLAlchemy 2 |
| Database | PostgreSQL 16 (Docker or local install); SQLite supported as an emergency fallback |
| Auth | Local JWT (PyJWT, HS256) · bcrypt password hashing · role-based access control enforced on the server |
| Reports | `csv` (CSV) · openpyxl (Excel) · ReportLab (PDF) |
| Deployment | Docker + Docker Compose (no paid hosting or cloud services) |

No paid APIs, SaaS, auth providers, cloud services, email/SMS gateways, or API keys are required.

## 5. Project structure

```
NIELIT Prototype/
├── docker-compose.yml          # db + backend + frontend
├── scripts/                    # Windows helpers: start-docker, setup-local, start-local, reset-demo-data
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI app, CORS, error handling, router registration
│   │   ├── core/               # config (env), database, security (bcrypt/JWT), deps (auth + RBAC)
│   │   ├── models/             # SQLAlchemy models: org, course, training, system
│   │   ├── schemas/            # Pydantic request validation
│   │   ├── repositories/       # row-level scoping (department/learner isolation), serializers
│   │   ├── services/           # workflow, eligibility, progress/risk/completion, dashboard, NDU, audit, notifications
│   │   ├── integrations/       # ndu.py — NduAdapter interface + MockNduAdapter (Prototype / Demo)
│   │   ├── reports/            # 14 report definitions + CSV/Excel/PDF exporters
│   │   ├── api/routes/         # REST endpoints (≈90 operations)
│   │   └── seed/               # curriculum + fictional demo data generator
│   ├── tests/e2e_api_test.py   # 84-check end-to-end workflow + RBAC test (stdlib only)
│   └── requirements.txt
└── frontend/
    └── src/
        ├── app/                # routes: /login, /admin/*, /department/*, /learner/*
        ├── components/         # ui (button, card, badge, dialog, tabs, form, states, toast), layout, charts, data-table
        ├── features/           # dashboards, nominations, learners, courses, content, batches, attendance,
        │                       # assessments, progress, reports, ndu, admin (audit/settings/coverage/demo guide), learner
        ├── hooks/ lib/ types/  # API client, auth context, navigation, formatting, typed API models
```

## 6. Database

Tables (all with foreign keys and indexes): `users`, `roles`, `departments`, `learners`, `nominations`,
`nomination_history`, `eligibility_checks`, `courses`, `modules`, `lessons`, `content_items`, `practicals`,
`practical_submissions`, `exercises`, `assessments`, `assessment_results`, `rubrics`, `batches`,
`course_enrollments`, `batch_enrollments`, `training_sessions`, `attendance`, `learner_progress`,
`completion_records`, `ndu_enrollments`, `ndu_sync_logs`, `notifications`, `audit_logs`, `reports`, `app_settings`.

Tables are created automatically at startup. **Seed / reset:**
* automatic on first start when the database is empty (`AUTO_SEED=true`)
* portal: **Settings → Reset Demo Data** (Administrator only)
* command line: `cd backend && python -m app.seed.seed` (drops and recreates all tables, then seeds)

Seeded demo data (dates are relative to *today*, so batches are always active and sessions current):
8 fictional departments · 2 administrators · 8 department in-charges · 60 learners (+ learner accounts) ·
4 courses · 34 modules · 68 lessons · 12 instructional-video records + 8 resources · 8 practicals · 11 exercises ·
3 rubrics · 20 assessments · 9 batches · 63 nominations across every workflow status · ~100 sessions ·
~470 attendance records · ~100 assessment results · practical submissions · progress & completion records ·
41 NDU enrolments + sync logs (incl. simulated failures) · notifications · ~630 audit events.

## 7. Key rules (all labelled as demo rules in the UI and configurable under Settings)

* **Eligibility:** valid ID, valid department, valid email, designation, minimum qualification, course prerequisite
  (Cyber Security Awareness, or equivalent technical qualification), duplicate check → ✓ Eligible / ⚠ Review Required / ✕ Not Eligible, with reasons.
* **Progress:** modules 40% + videos 20% (both reported by NDU) + practicals 20% + assessments passed 20%.
  Expected progress is derived from the batch schedule.
* **At risk:** ON TRACK ≥ 70% of schedule · AT RISK if progress < 50% of expected, attendance < 75%, assessment
  average < 50% or 7 days without activity · CRITICAL if attendance < 60% or 2+ failed assessments. Reasons always shown.
  *Progress is assessed against the schedule (actual ÷ expected-to-date) so that learners mid-course are not
  flagged merely for not having finished.*
* **Completion:** all modules, all assessments passed, all practicals evaluated, attendance ≥ 75% → Eligible for
  Completion → Administrator marks Completed (demo reference number).

## 8. Content library & 25.5-hour tracking

12 demo instructional-video records (8–12 min normal, up to 20 min deep technical demonstrations) with
instructional, technical (1920×1080, 16:9, 25/30 fps, MP4, H.264/H.265, 48 kHz), accessibility (SRT, VTT, DOCX,
accessible PDF), quality (original content, human review, AI disclosure, QC) and restriction-compliance metadata.
*Content Produced X.X / 25.5 hours* is computed from stored durations. Real MP4 files and VTT captions can be
uploaded from each video's page; the HTML5 player then supports play/pause/seek/volume/fullscreen/speed/captions.
Sample records are **not** final NIELIT deliverables.

## 9. Security (prototype level)

bcrypt password hashing · JWT sessions with expiry · server-side RBAC on every endpoint · department and learner
row-level isolation enforced in the API · Pydantic input validation · SQLAlchemy parameterised queries (no SQL
string building) · React output escaping (no `dangerouslySetInnerHTML`) · generic error messages for unexpected
errors · secrets from environment variables (`.env`) · upload type/size checks · security headers.
Not included (production items): HTTPS/TLS termination, rate limiting, SSO, account lockout, secret vault, WAF.

## 10. Testing status

| Area | Status |
|---|---|
| Backend API — full 21-step workflow, RBAC and isolation | **Tested**: `tests/e2e_api_test.py` — 84/84 checks pass on PostgreSQL 16 and on SQLite |
| Bulk import (CSV) preview/validation/confirm | Tested via API (valid / invalid / duplicate / eligibility outcomes) |
| Demo reset endpoint | Tested |
| Report exports (CSV, XLSX, PDF) | Tested — valid files generated for all formats |
| Frontend — every admin, department and learner page | **Rendered in Chromium against the live API** with zero console/runtime errors; role redirects verified |
| Frontend — full 21-step live-demo flow driven through the UI | **Tested** (Playwright): nomination form + validation, review, eligibility, approve, allocate, batch, onboard, course tree, content QC, attendance, 86/100 score, progress/risk, NDU simulation, report + CSV/XLSX/PDF downloads, audit trail, bulk import, new learner login, demo reset |
| Mobile width (390 px) | Checked — no horizontal page overflow on any page; tables scroll inside their cards |
| `next build` with the real npm packages | **Not yet run in the build environment** (package registries were blocked there). The UI was exercised with the real React 19, Zod, clsx, tailwind-merge and class-variance-authority, plus local stand-ins for Next.js routing, Recharts, TanStack Table, React Hook Form and Radix; Tailwind v4 CSS was compiled with the real compiler. All Lucide icon names were verified against lucide v0.544.0. Run `npm run build` (or `docker compose up --build`) on first setup. |

Run the API test yourself against a running backend (it creates records — reset demo data afterwards):
```bat
cd backend
python tests\e2e_api_test.py http://localhost:8000
```

## 11. Known limitations

* NDU integration is simulated (`MockNduAdapter`); no real NDU API calls are made.
* Email/SMS are not sent — in-app notifications only.
* Instructional videos are demo records; no actual video files are bundled.
* Eligibility, risk and completion rules are demo rules pending official programme requirements.
* Single-node prototype — no high availability, backups, or horizontal scaling.
* JWT is stored in browser localStorage (acceptable for a local demo; production should use HttpOnly cookies).
* Report on-screen search/sort/pagination is client-side (dataset sizes are small).

## 12. Future production integration points

* **NDU:** implement `NduAdapter` (`backend/app/integrations/ndu.py`) against official NDU APIs/credentials;
  replace the mock in `get_adapter()`.
* **Identity:** plug in government SSO (e.g. Parichay/LDAP) behind `core/security.py` + `core/deps.py`.
* **Notifications:** add email/SMS adapters behind `services/notifications.py`.
* **Media:** move `MEDIA_DIR` to managed object storage / streaming; add transcoding and caption validation.
* **Data:** Alembic migrations, backups, read replicas; HRMS integration for employee verification in eligibility.
* **Ops:** HTTPS reverse proxy (Nginx), rate limiting, centralised logging/monitoring, security audit (CERT-In empanelled).
