"""NIELIT Digital Training, Nomination, Monitoring & Reporting Portal — PROTOTYPE API."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.api.routes import (
    attendance,
    auth,
    batches,
    content,
    courses,
    dashboard,
    departments,
    learner_portal,
    learners,
    ndu,
    nominations,
    progress,
    reports,
    results,
    system,
    users,
)
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine

log = logging.getLogger("nielit")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    import app.models  # noqa: F401  (register models)
    from app.models import User
    from app.seed.seed import seed

    Base.metadata.create_all(bind=engine)
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    if settings.auto_seed:
        with SessionLocal() as db:
            empty = db.scalar(select(User.id).limit(1)) is None
        if empty:
            log.info("Empty database — loading demo seed data…")
            seed()
    if settings.jwt_secret_generated:
        log.warning("JWT_SECRET not set — using a random per-process secret (sessions reset on restart).")
    yield


app = FastAPI(
    title="NIELIT Digital Training Portal — Prototype API",
    description=(
        "**PROTOTYPE / DEMONSTRATION SYSTEM — SAMPLE DATA.** Nomination, eligibility, allocation, batch, attendance, "
        "assessment, progress, completion, reporting, audit and *Prototype / Demo NDU Integration* APIs.\n\n"
        "Use **POST /api/auth/login** then click *Authorize* and paste the `access_token`."
    ),
    version="0.9.0-prototype",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = []
    for e in exc.errors():
        loc = [str(x) for x in e.get("loc", []) if x not in ("body", "query", "path")]
        errors.append({"field": ".".join(loc), "message": str(e.get("msg", "Invalid value")).replace("Value error, ", "")})
    first = errors[0] if errors else {"field": "", "message": "Invalid request"}
    detail = f"{first['field']}: {first['message']}" if first["field"] else first["message"]
    return JSONResponse(status_code=422, content={"detail": detail, "errors": errors})


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "An unexpected error occurred. Please try again."})


API = "/api"
for r in (auth, dashboard, departments, users, learners, nominations, courses, content, batches, attendance, results,
          progress, ndu, reports, system, learner_portal):
    app.include_router(r.router, prefix=API)

settings.media_dir.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(settings.media_dir)), name="media")


@app.get("/api/health", tags=["System"])
def health():
    return {"status": "ok", "environment": settings.environment, "label": "DEMONSTRATION ENVIRONMENT — SAMPLE DATA"}


@app.get("/", include_in_schema=False)
def root():
    return {"name": settings.app_name, "docs": "/docs", "health": "/api/health"}
