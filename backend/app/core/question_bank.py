"""
Process 2.0 — Retrieve Company FAQs / role-relevant questions (from the DFD).

Input: the candidate's ExtractedProfile (role_title, key_skills, ...) and
       any explicit role/company from the interview session.
Output: a ranked list of Question rows from D2 (the question bank).

Retrieval today is tag-overlap counting over Postgres — simple, debuggable,
and enough to unblock question_engine.py. Phase 3 swaps this function's
internals for embedding similarity search (ChromaDB/FAISS) without changing
its signature, so nothing upstream (question_engine, routers) needs to change
when that happens.
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import Question, Tag, question_tags


def _normalize(value: str) -> str:
    return value.strip().lower().replace(" ", "-")


def get_relevant_questions(
    db: Session,
    role_title: str | None = None,
    key_skills: list[str] | None = None,
    company: str | None = None,
    difficulty: str | None = None,
    limit: int = 10,
) -> list[Question]:
    """Rank questions by how many of their tags match the candidate's
    role + skills + target company. Questions with zero overlap are excluded."""
    wanted_tags = set()
    if role_title:
        wanted_tags.add(_normalize(role_title))
    if company:
        wanted_tags.add(_normalize(company))
    for skill in key_skills or []:
        wanted_tags.add(_normalize(skill))

    if not wanted_tags:
        return []

    query = (
        db.query(Question, func.count(Tag.id).label("overlap"))
        .join(question_tags, Question.id == question_tags.c.question_id)
        .join(Tag, Tag.id == question_tags.c.tag_id)
        .filter(Tag.name.in_(wanted_tags))
    )
    if difficulty:
        query = query.filter(Question.difficulty == difficulty)

    query = query.group_by(Question.id).order_by(func.count(Tag.id).desc()).limit(limit)

    return [row[0] for row in query.all()]


def get_or_create_tag(db: Session, name: str, category: str) -> Tag:
    normalized = _normalize(name)
    tag = db.query(Tag).filter(Tag.name == normalized).first()
    if tag:
        return tag
    tag = Tag(name=normalized, category=category)
    db.add(tag)
    db.flush()  # get tag.id without committing yet
    return tag