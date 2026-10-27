import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core import interview_plan as ip
from app.core import rate_limit
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.evaluation import generate_report
from app.core.llm import llm_status
from app.core import personas
from app.core.question_engine import next_turn
from app.models.models import User, InterviewSession, TranscriptEntry, Report, Resume
from app.schemas.schemas import (
    InterviewStartRequest,
    InterviewStartResponse,
    InterviewMessageRequest,
    InterviewMessageResponse,
    InterviewStateOut,
    ReportOut,
)

router = APIRouter(prefix="/interview", tags=["interview"])

MAX_ANSWER_CHARS = 6000


def _get_owned_session(session_id: str, db: Session, current_user: User) -> InterviewSession:
    try:
        uuid.UUID(session_id)  # a malformed id must be a clean 404, not a database error
    except ValueError:
        raise HTTPException(status_code=404, detail="Interview session not found.")
    session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Interview session not found.")
    return session


def _entries(db: Session, session_id: str) -> list[TranscriptEntry]:
    return (
        db.query(TranscriptEntry)
        .filter(TranscriptEntry.session_id == session_id)
        .order_by(TranscriptEntry.order_index)
        .all()
    )


def _history(entries: list[TranscriptEntry]) -> list[dict]:
    return [
        {
            "question": e.question, "answer": e.answer, "is_followup": bool(e.is_followup), "analysis": e.analysis,
            "round": e.round or ip.TECHNICAL, "topic": e.topic,
        }
        for e in entries
    ]


def _resume_for(db: Session, session: InterviewSession):
    return db.query(Resume).filter(Resume.id == session.resume_id).first() if session.resume_id else None


def _round_counts(entries: list[TranscriptEntry]) -> dict[str, int]:
    out: dict[str, int] = {}
    for e in entries:
        k = e.round or ip.TECHNICAL
        out[k] = out.get(k, 0) + 1
    return out


@router.post("/start", response_model=InterviewStartResponse, dependencies=[Depends(rate_limit.by_user("interview-start", 30, 3600))])
def start_interview(
    payload: InterviewStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    resume = None
    if payload.resume_id:
        resume = db.query(Resume).filter(Resume.id == payload.resume_id, Resume.user_id == current_user.id).first()
        if not resume:
            raise HTTPException(status_code=404, detail="Resume not found.")

    session = InterviewSession(
        user_id=current_user.id,
        resume_id=payload.resume_id,
        role=payload.role,
        company=payload.company,
        interviewer=payload.interviewer,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    plan = ip.build_plan(payload.role, payload.company, resume)
    persona = personas.get(payload.interviewer)
    turn = next_turn(db, payload.role, payload.company, resume, [], candidate_name=current_user.name, plan=plan, interviewer_name=persona.name)

    db.add(
        TranscriptEntry(
            session_id=session.id,
            question=turn.question,
            order_index=0,
            is_followup=False,
            sources=turn.sources,
            round=turn.round,
            topic=turn.topic,
        )
    )
    db.commit()

    return InterviewStartResponse(
        id=session.id,
        first_question=turn.question,
        interviewer_name=persona.name,
        interviewer=persona.key,
        max_questions=plan.total,
        sources=turn.sources,
        round=turn.round,
        topic=turn.topic,
        rounds=plan.info(),
        ai_engine={**llm_status(), "engine": turn.engine, "engine_note": turn.engine_note},
    )


@router.get("/{session_id}", response_model=InterviewStateOut)
def get_interview(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_owned_session(session_id, db, current_user)
    entries = _entries(db, session.id)
    plan = ip.build_plan(session.role, session.company, _resume_for(db, session))
    turns = []
    for e in entries:
        turns.append({
            "role": "ai", "text": e.question, "is_followup": bool(e.is_followup), "sources": e.sources or [],
            "round": e.round or ip.TECHNICAL, "topic": e.topic,
        })
        if e.answer is not None:
            turns.append({"role": "candidate", "text": e.answer, "analysis": e.analysis, "round": e.round or ip.TECHNICAL})
    open_entry = entries[-1] if entries and entries[-1].answer is None else None
    return InterviewStateOut(
        id=session.id,
        role=session.role,
        company=session.company,
        status=session.status,
        interviewer_name=personas.get(session.interviewer).name,
        interviewer=personas.get(session.interviewer).key,
        max_questions=plan.total,
        question_number=len(entries),
        current_question=open_entry.question if open_entry and session.status == "active" else None,
        current_round=(open_entry.round if open_entry else None) or ip.TECHNICAL,
        current_topic=open_entry.topic if open_entry else None,
        rounds=plan.info(),
        ai_engine=llm_status(),
        turns=turns,
    )


@router.post("/{session_id}/message", response_model=InterviewMessageResponse, dependencies=[Depends(rate_limit.by_user("interview-message", 90, 60))])
def send_message(
    session_id: str,
    payload: InterviewMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_owned_session(session_id, db, current_user)
    if session.status != "active":
        raise HTTPException(status_code=400, detail="This interview has already ended.")

    entries = _entries(db, session.id)
    if not entries:
        raise HTTPException(status_code=400, detail="No question to answer yet.")

    current = entries[-1]
    if current.answer is not None:
        # A double-submit (double click / retry) must not create a second "next question".
        raise HTTPException(status_code=409, detail="That question was already answered.")

    if payload.skip_round and (current.round or ip.TECHNICAL) == ip.ROUND_ORDER[-1]:
        raise HTTPException(status_code=400, detail="You are already in the last round.")
    if not payload.answer.strip() and not payload.skip_round:
        raise HTTPException(status_code=422, detail="Answer is empty.")
    current.answer = payload.answer.strip()[:MAX_ANSWER_CHARS]
    current.response_time = payload.response_time
    current.input_mode = payload.input_mode if payload.input_mode in ("voice", "text") else None
    db.commit()

    resume = _resume_for(db, session)
    plan = ip.build_plan(session.role, session.company, resume)
    turn = next_turn(
        db, session.role, session.company, resume, _history(entries), candidate_name=current_user.name, plan=plan,
        force_next_round=payload.skip_round, interviewer_name=personas.get(session.interviewer).name,
    )

    # Persist the analysis of the answer that was just given.
    current.analysis = turn.analysis
    db.commit()

    counts = _round_counts(entries)
    if turn.finished:
        return InterviewMessageResponse(
            finished=True,
            closing=turn.closing,
            analysis=turn.analysis,
            question_number=len(entries),
            max_questions=plan.total,
            engine=turn.engine,
            engine_note=turn.engine_note,
        )

    db.add(
        TranscriptEntry(
            session_id=session.id,
            question=turn.question,
            order_index=len(entries),
            is_followup=turn.is_followup,
            sources=turn.sources,
            round=turn.round,
            topic=turn.topic,
        )
    )
    db.commit()

    return InterviewMessageResponse(
        question=turn.question,
        finished=False,
        is_followup=turn.is_followup,
        decision=turn.decision,
        analysis=turn.analysis,
        sources=turn.sources,
        question_number=len(entries) + 1,
        max_questions=plan.total,
        round=turn.round,
        round_name=ip.ROUND_NAMES[turn.round],
        round_changed=turn.round_changed,
        round_question_number=counts.get(turn.round, 0) + 1,
        round_max_questions=plan.round(turn.round).budget,
        topic=turn.topic,
        engine=turn.engine,
        engine_note=turn.engine_note,
    )


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

    existing_report = db.query(Report).filter(Report.session_id == session.id).first()
    if not existing_report:
        entries = _entries(db, session.id)
        data = generate_report(
            [
                {
                    "question": e.question,
                    "answer": e.answer,
                    "response_time": e.response_time,
                    "analysis": e.analysis,
                    "is_followup": bool(e.is_followup),
                    "round": e.round or ip.TECHNICAL,
                    "topic": e.topic,
                }
                for e in entries
            ],
            role=session.role,
            company=session.company,
        )
        db.add(
            Report(
                session_id=session.id,
                scores_json={
                    k: data[k]
                    for k in ("technical", "communication", "confidence", "grammar", "overall", "clarity", "relevance", "structure")
                },
                strengths=data["strengths"],
                weak_topics=data["weak_topics"],
                recommendations=data["recommendations"],
                details={
                    "summary": data.get("summary"),
                    "per_question": data.get("per_question", []),
                    "rounds": data.get("rounds", []),
                    "avg_response_time": data.get("avg_response_time"),
                    "engine": data.get("engine"),
                },
            )
        )
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
    details = report.details or {}
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
        clarity=scores.get("clarity"),
        relevance=scores.get("relevance"),
        structure=scores.get("structure"),
        summary=details.get("summary"),
        per_question=details.get("per_question", []),
        rounds=details.get("rounds", []),
        strengths=report.strengths or [],
        weak_topics=report.weak_topics or [],
        recommendations=report.recommendations or [],
        duration=duration,
        questions_answered=entries_count,
        avg_response_time=details.get("avg_response_time"),
    )
