from datetime import datetime
from typing import Optional

import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


def _clean(v: str) -> str:
    return " ".join(v.split())  # trim + collapse whitespace, drops stray control whitespace


def _valid_uuid(v: Optional[str]) -> Optional[str]:
    if v is None or v == "":
        return None
    try:
        return str(uuid.UUID(str(v)))
    except ValueError:
        raise ValueError("Invalid id.")


# ---- Auth ----

class UserRegister(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        v = _clean(v)
        if not v:
            raise ValueError("Name is required.")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        return str(v).strip().lower()

    @field_validator("password")
    @classmethod
    def _pw(cls, v):
        if len(v.encode("utf-8")) > 72:  # bcrypt only uses the first 72 bytes: reject instead of silently truncating
            raise ValueError("Password must be at most 72 bytes.")
        if not v.strip():
            raise ValueError("Password cannot be only spaces.")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        return str(v).strip().lower()


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    email: EmailStr


class TokenResponse(BaseModel):
    token: str
    user: UserOut


# ---- Resume ----

class ResumeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    parsed_skills: list[str] = []
    parsed_projects: list[str] = []
    parsed_experience: list[str] = []


# ---- Interview ----

class InterviewStartRequest(BaseModel):
    role: str = Field(min_length=2, max_length=100)
    company: Optional[str] = Field(default=None, max_length=100)
    resume_id: Optional[str] = None
    interviewer: str = "aria"

    @field_validator("interviewer")
    @classmethod
    def _interviewer(cls, v):
        from app.core.personas import PERSONAS

        v = (v or "aria").strip().lower()
        if v not in PERSONAS:
            raise ValueError("Unknown interviewer.")
        return v

    @field_validator("role")
    @classmethod
    def _role(cls, v):
        v = _clean(v)
        if len(v) < 2:
            raise ValueError("Role is required.")
        return v

    @field_validator("company")
    @classmethod
    def _company(cls, v):
        v = _clean(v) if v else ""
        return v or None

    @field_validator("resume_id")
    @classmethod
    def _rid(cls, v):
        return _valid_uuid(v)


class RoundInfo(BaseModel):
    key: str  # technical | resume
    name: str  # "Technical round"
    max_questions: int
    topics: list[str] = []  # what this round will cover, in order


class InterviewStartResponse(BaseModel):
    id: str
    first_question: str
    interviewer_name: str = "Aria"
    interviewer: str = "aria"
    max_questions: int = 0  # total across both rounds
    sources: list[dict] = []
    round: str = "technical"
    topic: Optional[str] = None
    rounds: list[RoundInfo] = []
    ai_engine: dict = {}


class InterviewMessageRequest(BaseModel):
    answer: str = Field(default="", max_length=20000)
    skip_round: bool = False  # leave the current round now and start the next one
    response_time: Optional[int] = Field(default=None, ge=0, le=86400)
    input_mode: Optional[str] = None  # "voice" | "text"


class InterviewMessageResponse(BaseModel):
    question: Optional[str] = None
    finished: bool = False
    is_followup: bool = False
    decision: Optional[str] = None  # follow_up | new_topic | reask
    analysis: Optional[dict] = None  # analysis of the answer just given
    sources: list[dict] = []  # RAG snippets that grounded the new question
    closing: Optional[str] = None  # spoken sign-off when finished
    question_number: Optional[int] = None  # overall
    max_questions: Optional[int] = None  # overall
    round: Optional[str] = None
    round_name: Optional[str] = None
    round_changed: bool = False  # this question opens a new round
    round_question_number: Optional[int] = None
    round_max_questions: Optional[int] = None
    topic: Optional[str] = None
    engine: Optional[str] = None  # llm | heuristic
    engine_note: Optional[str] = None


class InterviewStateOut(BaseModel):
    """Everything the call UI needs to (re)join a session, e.g. after a page refresh."""
    id: str
    role: str
    company: Optional[str] = None
    status: str
    interviewer_name: str = "Aria"
    interviewer: str = "aria"
    max_questions: int = 0
    question_number: int = 0
    current_question: Optional[str] = None  # the open (unanswered) question, if any
    current_round: Optional[str] = None
    current_topic: Optional[str] = None
    rounds: list[RoundInfo] = []
    ai_engine: dict = {}
    turns: list[dict] = []


class RoundReport(BaseModel):
    key: str  # technical | resume
    name: str
    overall: int = 0
    scores: dict = {}  # axis -> 0..100 (axes differ per round)
    summary: Optional[str] = None
    strengths: list[str] = []
    weak_topics: list[str] = []
    recommendations: list[str] = []
    topics: list[dict] = []  # [{label, score}]
    per_question: list[dict] = []
    questions_answered: int = 0
    engine: Optional[str] = None


class ReportOut(BaseModel):
    technical: int
    communication: int
    confidence: int
    grammar: int
    overall: int
    clarity: Optional[int] = None
    relevance: Optional[int] = None
    structure: Optional[int] = None
    summary: Optional[str] = None
    per_question: list[dict] = []
    strengths: list[str] = []
    weak_topics: list[str] = []
    recommendations: list[str] = []
    duration: Optional[str] = None
    questions_answered: Optional[int] = None
    avg_response_time: Optional[str] = None
    rounds: list[RoundReport] = []


class SessionHistoryItem(BaseModel):
    id: str
    role: str
    company: Optional[str] = None
    started_at: datetime
    overall_score: Optional[int] = None


# ---- Resume extraction (LLM-based, Process 1.0 from the DFD) ----

def _as_list(v):
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


class ExperienceItem(BaseModel):
    """One job / internship / role on the resume."""
    model_config = ConfigDict(extra="ignore")
    company: Optional[str] = None
    role: Optional[str] = None
    duration: Optional[str] = None
    highlights: list[str] = []  # bullet points: what they did / achieved
    technologies: list[str] = []

    @model_validator(mode="before")
    @classmethod
    def _coerce(cls, v):
        if isinstance(v, str):
            return {"role": v}
        if isinstance(v, dict):
            v = dict(v)
            for k in ("highlights", "technologies"):
                v[k] = [str(x) for x in _as_list(v.get(k)) if x]
            for k in ("company", "role", "duration"):
                if v.get(k) is not None:
                    v[k] = str(v[k])
        return v

    @property
    def label(self) -> str:
        bits = [b for b in (self.role, self.company) if b]
        return " at ".join(bits) if len(bits) == 2 else (bits[0] if bits else "Experience")


class ProjectItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    description: Optional[str] = None
    technologies: list[str] = []
    highlights: list[str] = []

    @model_validator(mode="before")
    @classmethod
    def _coerce(cls, v):
        if isinstance(v, str):
            return {"name": v}
        if isinstance(v, dict):
            v = dict(v)
            v.setdefault("name", v.get("title") or "Project")
            for k in ("highlights", "technologies"):
                v[k] = [str(x) for x in _as_list(v.get(k)) if x]
            if v.get("description") is not None:
                v["description"] = str(v["description"])
        return v


class ExtractedProfile(BaseModel):
    """Output of the extraction agent — the structured JSON everything
    downstream (FAQ retrieval, question generation) is built on."""
    role_title: Optional[str] = None
    company_name: Optional[str] = None
    experience_level: Optional[str] = None
    key_skills: list[str] = []
    key_responsibilities: list[str] = []
    notable_projects: list[str] = []  # project names only (kept for older code); full detail is in `projects`
    summary: Optional[str] = None
    # Full resume inventory: Round 2 asks about every item below.
    experience: list[ExperienceItem] = []
    projects: list[ProjectItem] = []
    education: list[str] = []
    certifications: list[str] = []
    achievements: list[str] = []

    @field_validator("key_skills", "key_responsibilities", "notable_projects", "education", "certifications", "achievements", mode="before")
    @classmethod
    def _strings(cls, v):
        return [x if isinstance(x, str) else str(x.get("name") or x.get("title") or x) if isinstance(x, dict) else str(x) for x in _as_list(v) if x]
