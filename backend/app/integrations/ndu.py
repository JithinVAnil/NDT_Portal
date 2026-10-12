"""NIELIT Digital University (NDU) integration adapter.

PROTOTYPE / DEMO NDU INTEGRATION.
No real NDU API is called. `MockNduAdapter` simulates enrolment, learner,
progress and completion synchronisation locally so the portal workflow can be
demonstrated. A real adapter implementing `NduAdapter` can be dropped in once
official NDU API documentation and credentials are provided.
"""
from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class NduResult:
    success: bool
    message: str
    payload: dict


class NduAdapter(ABC):
    mode: str = "ABSTRACT"

    @abstractmethod
    def register_learner(self, learner_code: str, email: str, name: str) -> NduResult: ...

    @abstractmethod
    def enroll(self, learner_ref: str, course_ref: str) -> NduResult: ...

    @abstractmethod
    def push_progress(self, learner_ref: str, course_ref: str, progress_pct: float) -> NduResult: ...

    @abstractmethod
    def push_completion(self, learner_ref: str, course_ref: str, status: str) -> NduResult: ...

    @abstractmethod
    def fetch_learning_update(self, learner_ref: str, course_ref: str, modules_completed: int, modules_total: int,
                              content_completed: int, content_total: int) -> NduResult: ...

    @abstractmethod
    def request_playback(self, learner_ref: str, course_ref: str, content_code: str) -> NduResult:
        """Fetch a time-limited playback URL for a video from NDU. The portal never hosts video itself."""


class MockNduAdapter(NduAdapter):
    """Deterministic local simulation of NDU behaviour."""

    mode = "DEMO"

    @staticmethod
    def learner_ref(learner_code: str) -> str:
        digest = hashlib.sha1(learner_code.encode()).hexdigest()[:8].upper()
        return f"NDU-L-{digest}"

    def register_learner(self, learner_code: str, email: str, name: str) -> NduResult:
        if "@" not in (email or ""):
            return NduResult(False, "Demo NDU rejected learner: invalid email", {})
        return NduResult(True, "Learner profile registered in demo NDU", {"ndu_learner_ref": self.learner_ref(learner_code)})

    def enroll(self, learner_ref: str, course_ref: str) -> NduResult:
        return NduResult(True, f"Enrolled {learner_ref} in {course_ref} (demo)", {"status": "ENROLLED"})

    def push_progress(self, learner_ref: str, course_ref: str, progress_pct: float) -> NduResult:
        return NduResult(True, f"Progress {progress_pct:.0f}% acknowledged by demo NDU", {"ack": True})

    def push_completion(self, learner_ref: str, course_ref: str, status: str) -> NduResult:
        return NduResult(True, f"Completion status '{status}' acknowledged by demo NDU", {"ack": True})

    def fetch_learning_update(self, learner_ref, course_ref, modules_completed, modules_total,
                              content_completed, content_total) -> NduResult:
        """Simulate the learner completing further modules and videos on NDU since the last sync."""
        if modules_completed >= modules_total and content_completed >= content_total:
            return NduResult(True, "No new learning activity — all modules already complete on NDU",
                             {"modules_completed": modules_completed, "content_completed": content_completed})
        new_modules = min(modules_total, modules_completed + 2)
        step = max(1, round(content_total / max(modules_total, 1))) if content_total else 0
        new_content = min(content_total, content_completed + step)
        return NduResult(
            True,
            "Demo NDU reported new module completion",
            {"modules_completed": new_modules, "content_completed": new_content},
        )

    def request_playback(self, learner_ref: str, course_ref: str, content_code: str) -> NduResult:
        """Simulate NDU returning a signed, time-limited playback URL. No real stream is served."""
        token = hashlib.sha1(f"{learner_ref}:{content_code}".encode()).hexdigest()[:16]
        return NduResult(
            True,
            f"Demo NDU issued a playback token for {content_code}",
            {
                "playback_url": f"https://ndu.digital/demo-play/{content_code}?token={token}",
                "expires_in_seconds": 900,
                "requires_ndu_login": True,
                "note": "Prototype hook — the real NDU returns a signed HLS/DASH URL once official API access is provided.",
            },
        )


def get_adapter() -> NduAdapter:
    return MockNduAdapter()
