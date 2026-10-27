import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import settings
from app.core.database import Base, engine, ensure_schema, SessionLocal
from app.models import models  # noqa: F401 — registers models on Base before create_all
from app.routers import admin, auth, resume, interview, dashboard, voice

log = logging.getLogger("app")

# Per-path request-body ceilings, checked from Content-Length before the body is read.
_UPLOAD_PATHS = {"/resume/upload": lambda: settings.max_upload_bytes + 64 * 1024, "/voice/transcribe": lambda: voice.MAX_AUDIO_BYTES + 64 * 1024}


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Phase 1: create tables directly on startup. Switch to Alembic migrations
    # once the schema stabilizes (alembic is in requirements.txt for this).
    Base.metadata.create_all(bind=engine)
    ensure_schema()  # add columns introduced after the first release to existing databases
    yield


_docs = {} if not settings.is_production else {"docs_url": None, "redoc_url": None, "openapi_url": None}
app = FastAPI(title="CareerPrepAi API", version="0.1.0", lifespan=lifespan, **_docs)

@app.middleware("http")
async def harden(request: Request, call_next):
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        limit = _UPLOAD_PATHS.get(request.url.path, lambda: settings.max_json_body_bytes)()
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > limit:
            return JSONResponse({"detail": "Request body is too large."}, status_code=413)
    try:
        response = await call_next(request)
    except Exception:  # last resort: never leak a traceback or internals to the client
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        response = JSONResponse({"detail": "Something went wrong on our side. Please try again."}, status_code=500)
    h = response.headers
    h["X-Content-Type-Options"] = "nosniff"
    h["X-Frame-Options"] = "DENY"
    h["Referrer-Policy"] = "strict-origin-when-cross-origin"
    h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path != "/health":
        h["Cache-Control"] = "no-store"  # responses are per-user
    if not request.url.path.startswith(("/docs", "/redoc", "/openapi")):
        h["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    if settings.is_production:
        h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# added last so CORS is the outermost layer: even early 413/500 responses carry the CORS headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,  # auth is a bearer header, not cookies
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


app.include_router(auth.router)
app.include_router(resume.router)
app.include_router(interview.router)
app.include_router(dashboard.router)
app.include_router(voice.router)
app.include_router(admin.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/health/ready")
def readiness():
    """Liveness plus a database round-trip, for load balancers / uptime checks."""
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except Exception:
        log.exception("readiness check failed")
        return JSONResponse({"status": "unavailable"}, status_code=503)
    return {"status": "ok"}
