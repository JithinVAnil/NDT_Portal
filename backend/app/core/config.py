"""Application configuration loaded from environment variables.

No secrets are hard-coded for production use: JWT_SECRET must be supplied via
environment (.env). A random per-process secret is generated if it is missing,
which is safe for a local demo (tokens simply expire on restart).
"""
from __future__ import annotations

import os
import secrets
from functools import lru_cache
from pathlib import Path


def _load_dotenv() -> None:
    """Minimal .env loader (avoids an extra dependency)."""
    for candidate in (Path.cwd() / ".env", Path(__file__).resolve().parents[2] / ".env"):
        if candidate.is_file():
            for raw in candidate.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
            break


_load_dotenv()


class Settings:
    def __init__(self) -> None:
        self.app_name: str = os.getenv("APP_NAME", "NIELIT Digital Training Portal (Prototype)")
        self.environment: str = os.getenv("ENVIRONMENT", "demo")
        self.database_url: str = os.getenv(
            "DATABASE_URL",
            "postgresql+psycopg://nielit:nielit_demo@localhost:5432/nielit_portal",
        )
        secret = os.getenv("JWT_SECRET", "")
        self.jwt_secret_generated = not bool(secret)
        self.jwt_secret: str = secret or secrets.token_urlsafe(48)
        self.jwt_algorithm: str = "HS256"
        self.access_token_minutes: int = int(os.getenv("ACCESS_TOKEN_MINUTES", "480"))
        self.cors_origins: list[str] = [
            o.strip()
            for o in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
            if o.strip()
        ]
        self.demo_password: str = os.getenv("DEMO_PASSWORD", "Demo@12345")
        self.media_dir: Path = Path(os.getenv("MEDIA_DIR", str(Path(__file__).resolve().parents[2] / "media")))
        self.auto_seed: bool = os.getenv("AUTO_SEED", "true").lower() in ("1", "true", "yes")
        self.max_upload_mb: int = int(os.getenv("MAX_UPLOAD_MB", "1024"))


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
