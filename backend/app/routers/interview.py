from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.question_engine import get_first_question, get_next_question, generate_report
from app.models.models import User, InterviewSession, TranscriptEntry, Report
from app.schemas.schemas import (
    InterviewStartRequest,
    InterviewStartResponse,
    InterviewMessageRequest,
    InterviewMessageResponse,
    ReportOut,
)

router = APIRouter(prefix="/interview", tags=["interview"])


def _get_owned_session(session_id: str, db: Session, current_user: User) -> InterviewSession:
    session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Interview session not found.")
    return session


@router.post("/start", response_model=InterviewStartResponse)
def start_interview(
    payload: InterviewStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = InterviewSession(
        user_id=current_user.id,
        resume_id=payload.resume_id,
        role=payload.role,
        company=payload.company,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    first_question = get_first_question(payload.role, payload.company)

    entry = TranscriptEntry(session_id=session.id, question=first_question, order_index=0)
    db.add(entry)
    db.commit()

    return InterviewStartResponse(id=session.id, first_question=first_question)


@router.post("/{session_id}/message", response_model=InterviewMessageResponse)
def send_message(
    session_id: str,
    payload: InterviewMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_owned_session(session_id, db, current_user)
    if session.status != "active":
        raise HTTPException(status_code=400, detail="This interview has already ended.")

    entries = (
        db.query(TranscriptEntry)
        .filter(TranscriptEntry.session_id == session.id)
        .order_by(TranscriptEntry.order_index)
        .all()
    )
    if not entries:
        raise HTTPException(status_code=400, detail="No question to answer yet.")

    current_entry = entries[-1]
    current_entry.answer = payload.answer
    current_entry.response_time = payload.response_time
    db.commit()

    next_index = len(entries)
    next_question = get_next_question(next_index)

    if next_question is None:
        return InterviewMessageResponse(finished=True)

    new_entry = TranscriptEntry(session_id=session.id, question=next_question, order_index=next_index)
    db.add(new_entry)
    db.commit()

    return InterviewMessageResponse(question=next_question, finished=False)


@router.post("/{session_id}/end")
def end_interview(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_owned_session(session_id, db, current_user)

    if session.status == "active":
        session.status = "ended"
        session.ended_at = datetime.utcnow()
        db.commit()

    entries = (
        db.query(TranscriptEntry)
        .filter(TranscriptEntry.session_id == session.id)
        .order_by(TranscriptEntry.order_index)
        .all()
    )
    transcript_dicts = [
        {"question": e.question, "answer": e.answer, "response_time": e.response_time}
        for e in entries
    ]
    report_data = generate_report(transcript_dicts)

    existing_report = db.query(Report).filter(Report.session_id == session.id).first()
    if not existing_report:
        report = Report(
            session_id=session.id,
            scores_json={
                "technical": report_data["technical"],
                "communication": report_data["communication"],
                "confidence": report_data["confidence"],
                "grammar": report_data["grammar"],
                "overall": report_data["overall"],
            },
            strengths=report_data["strengths"],
            weak_topics=report_data["weak_topics"],
            recommendations=report_data["recommendations"],
        )
        db.add(report)
        db.commit()

    return {"status": "ended"}


@router.get("/{session_id}/report", response_model=ReportOut)
def get_report(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_owned_session(session_id, db, current_user)
    report = db.query(Report).filter(Report.session_id == session.id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not ready yet. End the interview first.")

    scores = report.scores_json or {}
    duration = None
    if session.ended_at and session.started_at:
        seconds = int((session.ended_at - session.started_at).total_seconds())
        duration = f"{seconds // 60}m {seconds % 60}s"

    entries_count = (
        db.query(TranscriptEntry)
        .filter(TranscriptEntry.session_id == session.id, TranscriptEntry.answer.isnot(None))
        .count()
    )

    return ReportOut(
        technical=scores.get("technical", 0),
        communication=scores.get("communication", 0),
        confidence=scores.get("confidence", 0),
        grammar=scores.get("grammar", 0),
        overall=scores.get("overall", 0),
        strengths=report.strengths or [],
        weak_topics=report.weak_topics or [],
        recommendations=report.recommendations or [],
        duration=duration,
        questions_answered=entries_count,
    )
