"""Configurable programme settings stored in app_settings (demo defaults)."""
from __future__ import annotations

import copy
from typing import Any

from sqlalchemy.orm import Session

from app.models import AppSetting

QUALIFICATION_LEVELS = [
    "Secondary (10th)",
    "Higher Secondary (12th)",
    "Diploma",
    "Graduate",
    "Graduate (Engineering/IT)",
    "Post Graduate",
]

DEFAULTS: dict[str, dict[str, Any]] = {
    "eligibility_rules": {
        "description": "Demo eligibility rules — final rules to be configured according to official programme requirements.",
        "value": [
            {"code": "VALID_ID", "label": "Valid employee / learner ID", "enabled": True, "severity": "FAIL"},
            {"code": "VALID_DEPARTMENT", "label": "Valid, active nominating department", "enabled": True, "severity": "FAIL"},
            {"code": "VALID_EMAIL", "label": "Valid official email address", "enabled": True, "severity": "FAIL"},
            {"code": "DESIGNATION", "label": "Designation provided", "enabled": True, "severity": "WARN"},
            {"code": "QUALIFICATION", "label": "Meets minimum qualification for course", "enabled": True, "severity": "FAIL"},
            {"code": "PREREQUISITE", "label": "Course prerequisite satisfied", "enabled": True, "severity": "WARN"},
            {"code": "DUPLICATE", "label": "No duplicate active nomination / enrolment", "enabled": True, "severity": "FAIL"},
        ],
    },
    "risk_thresholds": {
        "description": "Demo at-risk rules.",
        "value": {
            "on_track_progress": 70,
            "at_risk_progress": 50,
            "at_risk_attendance": 75,
            "at_risk_score": 50,
            "inactivity_days": 7,
            "critical_attendance": 60,
            "critical_failed_assessments": 2,
        },
    },
    "completion_rules": {
        "description": "Demo completion criteria.",
        "value": {
            "require_all_modules": True,
            "require_all_assessments_passed": True,
            "require_all_practicals": True,
            "min_attendance": 75,
        },
    },
    "programme": {
        "description": "Programme-level configuration.",
        "value": {
            "programme_name": "Digital Training & Forensics Capacity Building Programme",
            "content_target_hours": 25.5,
            "normal_video_minutes": [8, 12],
            "deep_dive_max_minutes": 20,
            "ndu_mode": "DEMO",
            "ndu_base_url": "https://ndu.digital",
        },
    },
}


def get_setting(db: Session, key: str) -> Any:
    row = db.get(AppSetting, key)
    if row is None:
        return copy.deepcopy(DEFAULTS[key]["value"])
    return row.value


def set_setting(db: Session, key: str, value: Any) -> AppSetting:
    row = db.get(AppSetting, key)
    if row is None:
        row = AppSetting(key=key, value=value, description=DEFAULTS.get(key, {}).get("description"))
        db.add(row)
    else:
        row.value = value
    return row


def seed_defaults(db: Session) -> None:
    for key, spec in DEFAULTS.items():
        if db.get(AppSetting, key) is None:
            db.add(AppSetting(key=key, value=copy.deepcopy(spec["value"]), description=spec["description"]))


def qualification_rank(q: str | None) -> int:
    if not q:
        return -1
    try:
        return QUALIFICATION_LEVELS.index(q)
    except ValueError:
        return -1
