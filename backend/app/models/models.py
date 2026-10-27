import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, String, DateTime, ForeignKey, Integer, JSON, Text, Table
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


def gen_uuid():
    return str(uuid.uuid4())

    
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Set by hand in the database (see SECURITY_AND_DEPLOYMENT.md); there is no API to grant it.
    is_admin = Column(Boolean, default=False, nullable=False, server_default="false")

    resumes = relationship("Resume", back_populates="user")
    sessions = relationship("InterviewSession", back_populates="user")


class Resume(Base):
    __tablename__ = "resumes"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    file_name = Column(String, nullable=False)
    # Parsed structured data (skills, projects, experience) — JSONB-friendly, schema
    # can evolve without a migration since resumes vary in shape (blueprint §2.1, §5.1).
    parsed_data = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="resumes")


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    resume_id = Column(UUID(as_uuid=False), ForeignKey("resumes.id"), nullable=True)
    role = Column(String, nullable=False)
    company = Column(String, nullable=True)
    status = Column(String, default="active")  # active | ended
    interviewer = Column(String, default="aria")  # key in app/core/personas.py
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="sessions")
    transcript_entries = relationship("TranscriptEntry", back_populates="session", order_by="TranscriptEntry.order_index")
    report = relationship("Report", back_populates="session", uselist=False)


class TranscriptEntry(Base):
    __tablename__ = "transcript_entries"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    session_id = Column(UUID(as_uuid=False), ForeignKey("interview_sessions.id"), nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=True)
    response_time = Column(Integer, nullable=True)  # seconds
    is_followup = Column(Boolean, default=False)  # was this question a follow-up to the previous answer?
    analysis = Column(JSON, nullable=True)  # LLM/heuristic analysis of the ANSWER to this question
    sources = Column(JSON, nullable=True)  # RAG snippets that grounded this QUESTION
    input_mode = Column(String, nullable=True)  # "voice" | "text" — how the answer was given
    round = Column(String, nullable=True)  # "technical" | "resume"
    topic = Column(String, nullable=True)  # plan topic this question belongs to, e.g. "Python" / "Project: X"
    order_index = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("InterviewSession", back_populates="transcript_entries")


class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    session_id = Column(UUID(as_uuid=False), ForeignKey("interview_sessions.id"), unique=True, nullable=False)
    scores_json = Column(JSON, default=dict)  # technical, communication, confidence, grammar, overall
    strengths = Column(JSON, default=list)
    weak_topics = Column(JSON, default=list)
    recommendations = Column(JSON, default=list)
    details = Column(JSON, nullable=True)  # summary + per-question feedback (Phase 5)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("InterviewSession", back_populates="report")


# ---- Question bank (D2 from the DFD — retrieval source for Process 2.0) ----
#
# Tag-based instead of one-table-per-role: a role can span any combination of
# technologies, and a rigid schema (a column/table per tech) breaks the moment
# a new stack shows up. Tagging lets one question carry several tags — a skill,
# a role, a topic, a difficulty — so retrieval works by tag overlap against the
# candidate's extracted profile (ExtractedProfile.key_skills, role_title, etc.)
# rather than by a fixed lookup key. This is the relational seed for what
# becomes vector-embedded retrieval in Phase 3 (ChromaDB/FAISS per the
# blueprint) — same tags, same questions, added retrieval layer on top.

question_tags = Table(
    "question_tags",
    Base.metadata,
    Column("question_id", UUID(as_uuid=False), ForeignKey("questions.id"), primary_key=True),
    Column("tag_id", UUID(as_uuid=False), ForeignKey("tags.id"), primary_key=True),
)


class Tag(Base):
    __tablename__ = "tags"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False, unique=True, index=True)  # e.g. "python", "backend-engineer", "system-design"
    category = Column(String, nullable=False)  # "skill" | "role" | "topic" | "company" | "difficulty"

    questions = relationship("Question", secondary=question_tags, back_populates="tags")


class Question(Base):
    __tablename__ = "questions"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    text = Column(Text, nullable=False)
    question_type = Column(String, nullable=False, default="technical")  # technical | behavioral | situational
    difficulty = Column(String, nullable=False, default="mid")  # entry | mid | senior
    source = Column(String, default="seed")  # "seed" | "company_faq" | "generated"
    created_at = Column(DateTime, default=datetime.utcnow)

    tags = relationship("Tag", secondary=question_tags, back_populates="questions")
