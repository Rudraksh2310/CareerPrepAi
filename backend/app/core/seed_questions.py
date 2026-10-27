"""
Seeds the question bank (D2) with a starter set of tagged questions across
a few common roles/stacks, so retrieval has something to return before the
company FAQ scraping pipeline (blueprint §7, future scope) exists.

Run from the backend/ folder with the venv active:
    python -m app.core.seed_questions
"""

from app.core.database import SessionLocal, Base, engine
from app.core.question_bank import get_or_create_tag
from app.models.models import Question

SEED_QUESTIONS = [
    # (text, type, difficulty, [(tag_name, category), ...])
    (
        "Walk me through how you'd design a REST API for a to-do list app.",
        "technical", "entry",
        [("rest-api", "topic"), ("backend-engineer", "role"), ("python", "skill"), ("node", "skill")],
    ),
    (
        "How would you optimize a slow SQL query that's doing a full table scan?",
        "technical", "mid",
        [("sql", "skill"), ("postgresql", "skill"), ("backend-engineer", "role"), ("database", "topic")],
    ),
    (
        "Explain how you'd design a rate limiter for a public API.",
        "technical", "senior",
        [("system-design", "topic"), ("backend-engineer", "role"), ("api-design", "topic")],
    ),
    (
        "What's the difference between useEffect and useLayoutEffect in React, and when would you use each?",
        "technical", "mid",
        [("react", "skill"), ("frontend-engineer", "role"), ("javascript", "skill")],
    ),
    (
        "How would you improve the performance of a React app that re-renders too often?",
        "technical", "mid",
        [("react", "skill"), ("frontend-engineer", "role"), ("performance", "topic")],
    ),
    (
        "Explain the bias-variance tradeoff and how you'd diagnose it in a model you built.",
        "technical", "mid",
        [("machine-learning", "skill"), ("data-scientist", "role"), ("python", "skill")],
    ),
    (
        "How would you handle a severely imbalanced dataset for a classification task?",
        "technical", "mid",
        [("machine-learning", "skill"), ("data-scientist", "role")],
    ),
    (
        "Tell me about a time you disagreed with a teammate's technical decision. What did you do?",
        "behavioral", "entry",
        [("backend-engineer", "role"), ("frontend-engineer", "role"), ("data-scientist", "role"), ("teamwork", "topic")],
    ),
    (
        "Describe a project where the requirements changed midway. How did you adapt?",
        "behavioral", "entry",
        [("backend-engineer", "role"), ("frontend-engineer", "role"), ("data-scientist", "role"), ("adaptability", "topic")],
    ),
    (
        "How would you design the database schema for a ride-sharing app like Uber?",
        "technical", "senior",
        [("system-design", "topic"), ("backend-engineer", "role"), ("database", "topic")],
    ),
    (
        "What's the difference between Docker containers and virtual machines?",
        "technical", "entry",
        [("docker", "skill"), ("backend-engineer", "role"), ("devops", "topic")],
    ),
    (
        "How do you approach writing unit tests for a new feature?",
        "technical", "entry",
        [("testing", "topic"), ("backend-engineer", "role"), ("frontend-engineer", "role")],
    ),
]


def seed():
    Base.metadata.create_all(bind=engine)  # safety net if run standalone
    db = SessionLocal()
    try:
        added = 0
        for text, qtype, difficulty, tags in SEED_QUESTIONS:
            existing = db.query(Question).filter(Question.text == text).first()
            if existing:
                continue
            question = Question(text=text, question_type=qtype, difficulty=difficulty, source="seed")
            for tag_name, category in tags:
                question.tags.append(get_or_create_tag(db, tag_name, category))
            db.add(question)
            added += 1
        db.commit()
        print(f"Seeded {added} new question(s). Skipped {len(SEED_QUESTIONS) - added} already present.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
