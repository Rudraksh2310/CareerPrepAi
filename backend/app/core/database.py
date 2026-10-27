from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columns added after the first release. `Base.metadata.create_all` never alters an existing table,
# so a database created by the old version would be missing them; this adds them idempotently.
_ADDED_COLUMNS = {
    "users": [("is_admin", "BOOLEAN NOT NULL DEFAULT FALSE")],
    "transcript_entries": [
        ("is_followup", "BOOLEAN DEFAULT FALSE"),
        ("analysis", "JSON"),
        ("sources", "JSON"),
        ("input_mode", "VARCHAR"),
        ("round", "VARCHAR"),
        ("topic", "VARCHAR"),
    ],
    "reports": [("details", "JSON")],
    "interview_sessions": [("interviewer", "VARCHAR DEFAULT 'aria'")],
}


def ensure_schema() -> None:
    from sqlalchemy import text

    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        for table, cols in _ADDED_COLUMNS.items():
            for name, ddl in cols:
                conn.execute(text(f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS "{name}" {ddl}'))
