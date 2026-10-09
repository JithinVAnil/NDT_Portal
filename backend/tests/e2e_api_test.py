"""End-to-end API test of the full live-demo workflow + RBAC isolation.

Runs against a live backend (stdlib only, no extra packages):
    python tests/e2e_api_test.py [http://localhost:8000]

WARNING: it creates records. Run "Reset Demo Data" (or `python -m app.seed.seed`) afterwards.
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/") + "/api"
PWD = "Demo@12345"
passed = failed = 0


def call(method, path, token=None, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as r:
            content = r.read()
            return r.status, (content if raw else json.loads(content or b"null")), dict(r.headers)
    except urllib.error.HTTPError as e:
        content = e.read()
        try:
            return e.code, json.loads(content), dict(e.headers)
        except Exception:
            return e.code, content, dict(e.headers)


def check(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name}  {extra}")


def login(email):
    s, d, _ = call("POST", "/auth/login", body={"email": email, "password": PWD})
    assert s == 200, (email, s, d)
    return d["access_token"], d


print("== Authentication & RBAC")
s, d, _ = call("POST", "/auth/login", body={"email": "admin@nielit-demo.local", "password": "wrong"})
check("wrong password rejected (401)", s == 401)
admin, a = login("admin@nielit-demo.local")
check("admin home route", a["home"] == "/admin/dashboard")
dept, dd = login("department@nielit-demo.local")
check("department home route", dd["home"] == "/department/dashboard")
learner, ll = login("learner@nielit-demo.local")
check("learner home route", ll["home"] == "/learner/dashboard")
check("no token -> 401", call("GET", "/dashboard/admin")[0] == 401)
check("department cannot open admin dashboard (403)", call("GET", "/dashboard/admin", dept)[0] == 403)
check("learner cannot list learners (403)", call("GET", "/learners", learner)[0] == 403)
check("learner cannot view audit (403)", call("GET", "/audit", learner)[0] == 403)
check("department cannot view audit (403)", call("GET", "/audit", dept)[0] == 403)
check("department cannot approve (403)", call("POST", "/nominations/1/approve", dept, {"remarks": "x"})[0] in (403,))
check("department cannot reset demo (403)", call("POST", "/admin/reset-demo", dept)[0] == 403)

s, dept_learners, _ = call("GET", "/learners", dept)
my_dept = dd["user"]["department_id"]
check("department sees only own learners", s == 200 and dept_learners and all(l["department_id"] == my_dept for l in dept_learners))
s, all_learners, _ = call("GET", "/learners", admin)
other = next(l for l in all_learners if l["department_id"] != my_dept)
check("department blocked from another dept learner (403)", call("GET", f"/learners/{other['id']}", dept)[0] == 403)
s, noms, _ = call("GET", "/nominations", admin)
other_nom = next(n for n in noms if n["department_id"] != my_dept)
check("department blocked from another dept nomination (403)", call("GET", f"/nominations/{other_nom['id']}", dept)[0] == 403)
s, dnoms, _ = call("GET", "/nominations", dept)
check("department nominations scoped", all(n["department_id"] == my_dept for n in dnoms))
s, rep, _ = call("GET", "/reports/learners", dept)
check("department report scoped", s == 200 and all(r["department"] == dd["user"]["department_code"] for r in rep["rows"]))
check("department blocked from audit report (403)", call("GET", "/reports/audit", dept)[0] == 403)
s, me, _ = call("GET", "/learner/me", learner)
check("learner sees own profile", s == 200 and me["learner"]["email"] == "learner@nielit-demo.local")

print("== Dashboards")
s, dash0, _ = call("GET", "/dashboard/admin", admin)
k0 = dash0["kpis"]
check("admin dashboard KPIs", s == 200 and k0["learners"] >= 50 and k0["departments"] == 8)
check("content hours computed", dash0["content"]["target_hours"] == 25.5 and dash0["content"]["total_hours"] > 0)
s, ddash, _ = call("GET", "/dashboard/department", dept)
check("department dashboard", s == 200 and ddash["kpis"]["learners"] == len(dept_learners))

print("== Live demo workflow")
courses = {c["code"]: c for c in call("GET", "/courses/options", dept)[1]}
uniq = date.today().strftime("%m%d") + str(len(all_learners))
s, nom, _ = call("POST", "/nominations", dept, {
    "new_learner": {"employee_id": f"SCIB-EMP-9{uniq}", "full_name": "Test Officer Demo", "email": f"test.officer{uniq}@scib.demo-gov.local",
                    "mobile": "9876543210", "designation": "Sub-Inspector (Cyber Cell)", "qualification": "Graduate (Engineering/IT)",
                    "location": "Bengaluru"},
    "course_id": courses["CLF"]["id"], "training_mode": "Digital", "justification": "Handles cloud evidence"})
check("department creates nomination (Draft)", s == 200 and nom["status"] == "Draft", nom)
nid = nom["id"]
s, nom, _ = call("POST", f"/nominations/{nid}/submit", dept)
check("department submits nomination", s == 200 and nom["status"] == "Submitted")
check("department cannot run eligibility (403)", call("POST", f"/nominations/{nid}/eligibility", dept)[0] == 403)
s, nom, _ = call("POST", f"/nominations/{nid}/review", admin)
check("admin starts review", nom["status"] == "Under Review")
s, nom, _ = call("POST", f"/nominations/{nid}/eligibility", admin)
check("eligibility -> Eligible", nom["status"] == "Eligible" and nom["eligibility_checks"][0]["result"] == "ELIGIBLE", nom.get("eligibility_checks"))
s, nom, _ = call("POST", f"/nominations/{nid}/approve", admin, {"remarks": "Approved for demo"})
check("approve", nom["status"] == "Approved")
s, nom, _ = call("POST", f"/nominations/{nid}/allocate-course", admin, {"course_id": courses["CLF"]["id"]})
check("allocate Cloud Forensics", nom["status"] == "Allocated")
batch = next(b for b in nom["available_batches"] if b["code"] == "CLOUD-FORENSICS-2026-01")
s, nom, _ = call("POST", f"/nominations/{nid}/allocate-batch", admin, {"batch_id": batch["id"]})
check("assign batch", s == 200 and nom["allocated_batch"] == "CLOUD-FORENSICS-2026-01")
s, nom, _ = call("POST", f"/nominations/{nid}/onboard", admin)
check("onboard learner (+ portal account)", nom["status"] == "Onboarded" and nom["onboarding"]["account_created"])
s, _, _ = call("POST", f"/nominations/{nid}/approve", admin, {"remarks": "again"})
check("invalid transition rejected (400)", s == 400)
lid = nom["learner"]["id"]
s, dash1, _ = call("GET", "/dashboard/admin", admin)
check("enrolments KPI increased", dash1["kpis"]["enrolments"] == k0["enrolments"] + 1)
check("pending nominations unchanged after full cycle", dash1["kpis"]["pending_nominations"] == k0["pending_nominations"])
new_learner_tok, _ = login(nom["learner"]["email"])
s, nme, _ = call("GET", "/learner/me", new_learner_tok)
check("new learner can log in and sees own course", s == 200 and nme["enrollments"][0]["course_code"] == "CLF")

print("== Course structure")
s, tree, _ = call("GET", f"/courses/{courses['CLF']['id']}", admin)
check("course tree has modules, lessons, content, practicals, assessments",
      tree["counts"]["modules"] == 9 and tree["counts"]["lessons"] > 0 and tree["counts"]["practicals"] >= 1 and tree["counts"]["assessments"] >= 1)

print("== Attendance")
today = date.today()
s, sheet, _ = call("GET", f"/attendance/sheet?batch_id={batch['id']}&session_date={today}&session_no=2", admin)
check("attendance sheet includes new learner", any(r["learner_id"] == lid for r in sheet["rows"]))
records = [{"learner_id": r["learner_id"], "status": "Present"} for r in sheet["rows"]]
s, res, _ = call("POST", "/attendance/sheet", admin, {"batch_id": batch["id"], "session_date": str(today), "session_no": 2, "records": records})
check("save attendance", s == 200 and res["saved"] == len(records), res)
check("department cannot save attendance (403)",
      call("POST", "/attendance/sheet", dept, {"batch_id": batch["id"], "session_date": str(today), "session_no": 2, "records": records})[0] == 403)

print("== Assessment")
s, assess, _ = call("GET", f"/assessments?course_id={courses['CLF']['id']}", admin)
pa = next(x for x in assess if x["type"] == "Practical")
s, r, _ = call("POST", "/assessment-results", admin, {"learner_id": lid, "assessment_id": pa["id"], "score": 86, "remarks": "Strong timeline"})
check("record 86/100", s == 200 and r["percentage"] == 86 and r["passed"], r)
s, rr, _ = call("GET", f"/assessment-results?learner_id={lid}", admin)
check("score persisted", any(x["score"] == 86 for x in rr))
check("score > max rejected (400)", call("POST", "/assessment-results", admin, {"learner_id": lid, "assessment_id": pa["id"], "score": 150})[0] == 400)

print("== Progress, risk, NDU")
s, prog, _ = call("GET", f"/progress?course_id={courses['CLF']['id']}", admin)
mine = next(p for p in prog if p["learner_id"] == lid)
check("progress row with risk + reasons", mine["risk_level"] and mine["risk_reasons"])
demo_l = next(l for l in all_learners if l["email"] == "learner@nielit-demo.local")
before = next(p for p in prog if p["learner_id"] == demo_l["id"])
s, sim, _ = call("POST", "/ndu/simulate-update", admin, {"enrollment_id": before["enrollment_id"]})
check("simulate NDU update increases progress", s == 200 and sim["new_progress"] > sim["old_progress"], sim)
s, logs, _ = call("GET", "/ndu/logs?limit=5", admin)
check("NDU sync log stores old/new", logs[0]["old_value"] and logs[0]["new_value"] and logs[0]["sync_type"] == "NDU Learning Update")
for ep in ("sync-learner", "sync-progress", "sync-completion"):
    check(f"NDU {ep}", call("POST", f"/ndu/{ep}", admin, {})[0] == 200)

print("== Completion")
s, comp, _ = call("GET", "/completion?status=Eligible%20for%20Completion", admin)
if comp:
    s, cres, _ = call("POST", f"/completion/{comp[0]['enrollment_id']}/complete", admin)
    check("mark eligible learner completed", s == 200 and cres["status"] == "Completed")
s, comp2, _ = call("GET", "/completion?status=In%20Progress", admin)
check("cannot complete in-progress learner (400)", call("POST", f"/completion/{comp2[0]['enrollment_id']}/complete", admin)[0] == 400)

print("== Reports & exports")
s, cat, _ = call("GET", "/reports", admin)
check("14 reports for admin", len(cat) == 14)
for rep_def in cat:
    s, rep, _ = call("GET", f"/reports/{rep_def['key']}", admin)
    check(f"report {rep_def['key']} ({len(rep.get('rows', [])) if isinstance(rep, dict) else '?'} rows)", s == 200)
for fmt, magic in (("csv", b"\xef\xbb\xbf"), ("xlsx", b"PK"), ("pdf", b"%PDF")):
    s, body, hdr = call("GET", f"/reports/progress/export?format={fmt}", admin, raw=True)
    check(f"export {fmt}", s == 200 and body[:len(magic)] == magic and "attachment" in hdr.get("content-disposition", ""))
s, body, _ = call("GET", "/reports/learners/export?format=xlsx", dept, raw=True)
check("department export works", s == 200 and body[:2] == b"PK")

print("== Audit trail")
s, aud, _ = call("GET", "/audit?page_size=200", admin)
actions = {x["action"] for x in aud["items"]}
for act in ("LOGIN", "NOMINATION_CREATED", "NOMINATION_SUBMITTED", "ELIGIBILITY_CHECK", "NOMINATION_APPROVED",
            "COURSE_ALLOCATED", "BATCH_ALLOCATED", "LEARNER_ONBOARDED", "ATTENDANCE_SAVED", "ASSESSMENT_RECORDED",
            "NDU_SIMULATED_UPDATE", "REPORT_GENERATED", "REPORT_EXPORTED"):
    check(f"audit has {act}", act in actions)

print("== Notifications & search")
s, nots, _ = call("GET", "/notifications", dept)
check("department got onboarding notification", any(n["title"] == "Learner onboarded" for n in nots["items"]))
s, sr, _ = call("GET", "/search?q=Mehta", dept)
check("department search scoped", all(r["type"] != "Learner" or "SCIB" in r["subtitle"] for r in sr["results"]))
s, sr2, _ = call("GET", "/search?q=CLOUD", learner)
check("learner search works", s == 200)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
