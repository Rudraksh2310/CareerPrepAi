from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import User, InterviewSession, Report
from app.schemas.schemas import SessionHistoryItem

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/history", response_model=list[SessionHistoryItem])
def get_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sessions = (
        db.query(InterviewSession)
        .filter(InterviewSession.user_id == current_user.id)
        .order_by(InterviewSession.started_at.desc())
        .all()
    )

    items = []
    for s in sessions:
        report = db.query(Report).filter(Report.session_id == s.id).first()
        overall = None
        if report and report.scores_json:
            overall = report.scores_json.get("overall")
        items.append(
            SessionHistoryItem(
                id=s.id,
                role=s.role,
                company=s.company,
                started_at=s.started_at,
                overall_score=overall,
            )
        )
    return items
