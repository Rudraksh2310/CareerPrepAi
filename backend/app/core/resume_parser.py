import io

from pypdf import PdfReader
from docx import Document

# A small, editable keyword list for Phase 1. This is intentionally simple —
# swap this module's internals for an LLM-based extractor in a later phase
# without touching the router or the response shape.
SKILL_KEYWORDS = [
    "python", "java", "javascript", "typescript", "react", "node", "fastapi",
    "django", "flask", "sql", "postgresql", "mongodb", "docker", "kubernetes",
    "aws", "git", "c++", "c", "html", "css", "tailwind", "next.js", "express",
    "machine learning", "data structures", "algorithms", "rest api", "graphql",
]


def extract_text(filename: str, content: bytes) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        reader = PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    if lower.endswith(".docx"):
        doc = Document(io.BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs)
    raise ValueError("Unsupported file type. Upload a PDF or DOCX.")


def parse_resume(text: str) -> dict:
    lower_text = text.lower()
    found_skills = sorted({kw for kw in SKILL_KEYWORDS if kw in lower_text})

    # Naive project line detection — lines mentioning "project" are surfaced as-is.
    # Good enough for Phase 1; Phase 3's RAG/LLM step can replace this.
    projects = [
        line.strip() for line in text.splitlines()
        if "project" in line.lower() and len(line.strip()) > 5
    ][:5]

    return {
        "skills": found_skills,
        "projects": projects,
        "raw_length": len(text),
    }
