"""Admin-only product statistics.

Aggregate counts only: this module never selects resume text, questions, answers,
names or emails, so it cannot leak candidate content by construction.
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_admin
from app.models.models import InterviewSession, Report, Resume, User

router = APIRouter(prefix="/admin", tags=["admin"])

DAYS = 30


def _daily(db: Session, col, since: datetime) -> dict[str, int]:
    day = func.date(col)
    rows = db.query(day, func.count()).filter(col >= since).group_by(day).all()
    return {str(d): int(n) for d, n in rows}


@router.get("/stats")
def stats(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    now = datetime.utcnow()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    since = today - timedelta(days=DAYS - 1)
    week = now - timedelta(days=7)

    def count(q):
        return int(q.scalar() or 0)

    totals = {
        "users": count(db.query(func.count(User.id))),
        "resumes": count(db.query(func.count(Resume.id))),
        "interviews_started": count(db.query(func.count(InterviewSession.id))),
        "interviews_completed": count(
            db.query(func.count(InterviewSession.id)).filter(InterviewSession.status == "ended")
        ),
        "reports": count(db.query(func.count(Report.id))),
        "active_users_7d": count(
            db.query(func.count(func.distinct(InterviewSession.user_id))).filter(InterviewSession.started_at >= week)
        ),
        "signups_7d": count(db.query(func.count(User.id)).filter(User.created_at >= week)),
    }

    signups = _daily(db, User.created_at, since)
    started = _daily(db, InterviewSession.started_at, since)
    completed = _daily(db, InterviewSession.ended_at, since)
    reports = _daily(db, Report.created_at, since)

    series = []
    for i in range(DAYS):
        d = (since + timedelta(days=i)).date().isoformat()
        series.append(
            {
                "date": d,
                "signups": signups.get(d, 0),
                "interviews_started": started.get(d, 0),
                "interviews_completed": completed.get(d, 0),
                "reports": reports.get(d, 0),
            }
        )

    rate = None
    if totals["interviews_started"]:
        rate = round(100 * totals["interviews_completed"] / totals["interviews_started"])

    return {
        "generated_at": now.isoformat() + "Z",
        "days": DAYS,
        "totals": totals,
        "completion_rate": rate,
        "series": series,
    }
