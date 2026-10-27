import html
import io
import logging

import fitz  # PyMuPDF (already in requirements.txt)
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import rate_limit
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password_constant_time
from app.models.models import InterviewSession, Report, Resume, TranscriptEntry, User
from app.schemas.schemas import DeleteAccountRequest, TokenResponse, UserLogin, UserOut, UserRegister

log = logging.getLogger("auth")
router = APIRouter(prefix="/auth", tags=["auth"])


def _by_email(db: Session, email: str) -> User | None:
    # lower() on both sides so accounts created before emails were normalised can still log in
    return db.query(User).filter(func.lower(User.email) == email).first()


@router.post("/register", response_model=TokenResponse, dependencies=[Depends(rate_limit.by_ip("register", 10, 3600))])
def register(payload: UserRegister, db: Session = Depends(get_db)):
    if _by_email(db, payload.email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    user = User(name=payload.name, email=payload.email, password_hash=hash_password(payload.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # two simultaneous sign-ups with the same email
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    db.refresh(user)

    return TokenResponse(token=create_access_token(subject=user.id), user=user)


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(rate_limit.by_ip("login", 20, 600))])
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = _by_email(db, payload.email)
    if not verify_password_constant_time(payload.password, user.password_hash if user else None) or not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    return TokenResponse(token=create_access_token(subject=user.id), user=user)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/me/export", dependencies=[Depends(rate_limit.by_user("export", 10, 3600))])
def export_my_data(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Everything stored about the signed-in user, as JSON (data portability). Never includes the password hash."""
    iso = lambda d: d.isoformat() if d else None  # noqa: E731
    sessions = db.query(InterviewSession).filter(InterviewSession.user_id == current_user.id).order_by(InterviewSession.started_at).all()
    out_sessions = []
    for s in sessions:
        entries = db.query(TranscriptEntry).filter(TranscriptEntry.session_id == s.id).order_by(TranscriptEntry.order_index).all()
        rep = db.query(Report).filter(Report.session_id == s.id).first()
        out_sessions.append({
            "id": s.id, "role": s.role, "company": s.company, "status": s.status,
            "started_at": iso(s.started_at), "ended_at": iso(s.ended_at), "resume_id": s.resume_id,
            "transcript": [
                {"round": e.round, "topic": e.topic, "is_followup": bool(e.is_followup), "question": e.question, "answer": e.answer,
                 "input_mode": e.input_mode, "response_time_s": e.response_time, "analysis": e.analysis}
                for e in entries
            ],
            "report": None if not rep else {
                "scores": rep.scores_json, "strengths": rep.strengths, "weak_topics": rep.weak_topics,
                "recommendations": rep.recommendations, "details": rep.details,
            },
        })
    resumes = db.query(Resume).filter(Resume.user_id == current_user.id).order_by(Resume.created_at).all()
    return {
        "account": {"id": current_user.id, "name": current_user.name, "email": current_user.email, "created_at": iso(current_user.created_at)},
        "resumes": [{"id": r.id, "file_name": r.file_name, "uploaded_at": iso(r.created_at), "parsed": r.parsed_data} for r in resumes],
        "interviews": out_sessions,
    }


def _e(v) -> str:
    return html.escape(str(v)) if v not in (None, "") else "-"


def _label(k: str) -> str:
    return str(k).replace("_", " ").capitalize()


def _dt(v) -> str:
    return str(v)[:16].replace("T", " ") if v else "-"


def _ul(items) -> str:
    items = [str(i).strip() for i in (items or []) if i and str(i).strip()]
    return "<ul>" + "".join(f"<li>{html.escape(i)}</li>" for i in items) + "</ul>" if items else ""


def _scores(d: dict | None) -> str:
    if not d:
        return ""
    return "<p>" + " &nbsp;|&nbsp; ".join(f"{_label(k)}: <b>{_e(v)}</b>" for k, v in d.items()) + "</p>"


def _field(name: str, value) -> str:
    if isinstance(value, list):
        value = ", ".join(str(v) for v in value if v)
    return f"<p><b>{name}:</b> {_e(value)}</p>" if value else ""


def _resume_html(r: dict) -> str:
    d = r.get("parsed") or {}
    out = [f"<h3>{_e(r['file_name'])}</h3><p><i>Uploaded {_dt(r['uploaded_at'])}</i></p>"]
    out.append(_field("Target role", d.get("role_title")))
    out.append(_field("Company", d.get("company_name")))
    out.append(_field("Experience level", d.get("experience_level")))
    out.append(_field("Summary", d.get("summary")))
    out.append(_field("Skills", d.get("key_skills")))
    if d.get("experience"):
        out.append("<p><b>Experience</b></p>")
        for x in d["experience"]:
            dur = f" ({_e(x['duration'])})" if x.get("duration") else ""
            out.append(f"<p>{_e(x.get('role'))} at {_e(x.get('company'))}{dur}</p>" + _ul(x.get("highlights")))
    if d.get("projects"):
        out.append("<p><b>Projects</b></p>")
        for x in d["projects"]:
            out.append(f"<p><b>{_e(x.get('name'))}</b> - {_e(x.get('description'))}</p>")
            out.append(_field("Technologies", x.get("technologies")) + _ul(x.get("highlights")))
    for key, title in (("education", "Education"), ("certifications", "Certifications"), ("achievements", "Achievements")):
        if d.get(key):
            out.append(f"<p><b>{title}</b></p>" + _ul(d[key]))
    return "".join(out)


def _qa_html(i: int, q: dict) -> str:
    ans = (q.get("answer") or "").strip()
    out = [f"<p><b>Q{i}. {_e(q.get('question'))}</b><br/>Your answer: {_e(ans) if ans and ans != '-' else '<i>no answer</i>'}"]
    if q.get("score") is not None:
        out.append(f"<br/>Score: <b>{_e(q['score'])}/100</b>")
    if q.get("feedback"):
        out.append(f"<br/>Feedback: {_e(q['feedback'])}")
    if q.get("better_answer_tip"):
        out.append(f"<br/>Tip: {_e(q['better_answer_tip'])}")
    out.append("</p>")
    if q.get("mistakes"):
        out.append("<p>Missed:</p>" + _ul(q["mistakes"]))
    return "".join(out)


def _interview_html(s: dict) -> str:
    title = _e(s["role"]) + (f" at {_e(s['company'])}" if s.get("company") else "")
    rep = s.get("report") or {}
    details = rep.get("details") or {}
    out = [f"<h3>{title}</h3>", f"<p>Status: {_e(s['status'])} &nbsp;|&nbsp; Started: {_dt(s['started_at'])} &nbsp;|&nbsp; Ended: {_dt(s['ended_at'])}</p>"]
    if rep:
        out.append(f"<p><b>Overall score: {_e((rep.get('scores') or {}).get('overall'))}/100</b></p>")
        out.append(_scores({k: v for k, v in (rep.get("scores") or {}).items() if k != "overall"}))
        out.append(_field("Summary", details.get("summary")))
        for key, title_ in (("strengths", "Strengths"), ("weak_topics", "Areas to improve"), ("recommendations", "Recommendations")):
            if rep.get(key):
                out.append(f"<p><b>{title_}</b></p>" + _ul(dict.fromkeys(rep[key])))
        if details.get("avg_response_time"):
            out.append(_field("Average response time", details["avg_response_time"]))
    rounds = details.get("rounds") or []
    if rounds:
        for r in rounds:
            out.append(f"<h4>{_e(r.get('name'))}</h4>")
            if not r.get("questions_answered"):
                out.append("<p><i>This round was not attempted.</i></p>")
                continue
            out.append(f"<p>Round score: <b>{_e(r.get('overall'))}/100</b></p>" + _scores(r.get("scores")))
            out.append(_field("Summary", r.get("summary")))
            out.append("".join(_qa_html(i, q) for i, q in enumerate(r.get("per_question") or [], 1)))
    else:  # no report yet (e.g. interview still active): just the raw Q&A
        out.append("<h4>Transcript</h4>" + "".join(_qa_html(i, {"question": t["question"], "answer": t["answer"]}) for i, t in enumerate(s["transcript"], 1)))
    return "".join(out)


def _build_export_html(data: dict) -> str:
    acc = data["account"]
    out = ["<h1>CareerPrepAI - My data</h1>", "<h2>Account</h2>",
           _field("Name", acc.get("name")), _field("Email", acc.get("email")), _field("Member since", _dt(acc.get("created_at")))]
    out.append("<h2>Resumes</h2>")
    out += [_resume_html(r) for r in data["resumes"]] or ["<p>No resumes uploaded.</p>"]
    out.append("<h2>Interviews</h2>")
    out += [_interview_html(s) for s in data["interviews"]] or ["<p>No interviews yet.</p>"]
    return "".join(out)


@router.get("/me/export/pdf", dependencies=[Depends(rate_limit.by_user("export", 10, 3600))])
def export_my_data_pdf(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Same data as /me/export, rendered as a readable PDF report."""
    data = export_my_data(db=db, current_user=current_user)
    css = ("body{font-family:sans-serif;font-size:10pt} h1{font-size:20pt} "
           "h2{font-size:15pt;margin-top:18pt} h3{font-size:12.5pt;margin-top:14pt} h4{font-size:11pt;margin-top:10pt} "
           "p{margin:3pt 0} li{margin:1pt 0}")
    story = fitz.Story(html=_build_export_html(data), user_css=css)
    out = io.BytesIO()
    writer = fitz.DocumentWriter(out)
    mediabox = fitz.paper_rect("a4")
    where = mediabox + (40, 40, -40, -40)
    more = True
    while more:
        dev = writer.begin_page(mediabox)
        more, _ = story.place(where)
        story.draw(dev)
        writer.end_page()
    writer.close()
    return Response(
        content=out.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="careerprepai-my-data.pdf"'},
    )


@router.delete("/me", status_code=204, dependencies=[Depends(rate_limit.by_user("delete-account", 5, 3600))])
def delete_account(
    payload: DeleteAccountRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Permanently delete the account and everything linked to it (resumes, interviews, transcripts, reports)."""
    if not verify_password_constant_time(payload.password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Password is incorrect.")

    uid = current_user.id  # read before the row is gone: the ORM object is unusable after the commit
    sids = [s.id for s in db.query(InterviewSession.id).filter(InterviewSession.user_id == uid)]
    if sids:
        db.query(Report).filter(Report.session_id.in_(sids)).delete(synchronize_session=False)
        db.query(TranscriptEntry).filter(TranscriptEntry.session_id.in_(sids)).delete(synchronize_session=False)
        db.query(InterviewSession).filter(InterviewSession.id.in_(sids)).delete(synchronize_session=False)
    db.query(Resume).filter(Resume.user_id == uid).delete(synchronize_session=False)
    db.query(User).filter(User.id == uid).delete(synchronize_session=False)
    db.commit()
    log.info("account deleted: %s", uid)
    return None