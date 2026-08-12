from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import Base, engine
from app.models import models  # noqa: F401 — registers models on Base before create_all
from app.routers import auth, resume, interview, dashboard

app = FastAPI(title="CareerPrepAi API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(resume.router)
app.include_router(interview.router)
app.include_router(dashboard.router)


@app.on_event("startup")
def on_startup():
    # Phase 1: create tables directly on startup. Switch to Alembic migrations
    # once the schema stabilizes (alembic is in requirements.txt for this).
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health_check():
    return {"status": "ok"}
