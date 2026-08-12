from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, ConfigDict


# ---- Auth ----

class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


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


# ---- Interview ----

class InterviewStartRequest(BaseModel):
    role: str
    company: Optional[str] = None
    resume_id: Optional[str] = None


class InterviewStartResponse(BaseModel):
    id: str
    first_question: str


class InterviewMessageRequest(BaseModel):
    answer: str
    response_time: Optional[int] = None


class InterviewMessageResponse(BaseModel):
    question: Optional[str] = None
    finished: bool = False


class ReportOut(BaseModel):
    technical: int
    communication: int
    confidence: int
    grammar: int
    overall: int
    strengths: list[str] = []
    weak_topics: list[str] = []
    recommendations: list[str] = []
    duration: Optional[str] = None
    questions_answered: Optional[int] = None
    avg_response_time: Optional[str] = None


class SessionHistoryItem(BaseModel):
    id: str
    role: str
    company: Optional[str] = None
    started_at: datetime
    overall_score: Optional[int] = None


# ---- Resume extraction (LLM-based, Process 1.0 from the DFD) ----

class ExtractedProfile(BaseModel):
    """Output of the extraction agent — the structured JSON everything
    downstream (FAQ retrieval, question generation) is built on."""
    role_title: Optional[str] = None
    company_name: Optional[str] = None
    experience_level: Optional[str] = None
    key_skills: list[str] = []
    key_responsibilities: list[str] = []
    notable_projects: list[str] = []
    summary: Optional[str] = None
