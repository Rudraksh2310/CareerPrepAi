# CareerPrepAi — Backend (Phase 1)

FastAPI + PostgreSQL backend. This merges two earlier pieces of work into
one consistent backend:

- **Auth, DB schema, and route naming** — Postgres, JWT auth, and the
  `/auth/*`, `/resume/upload`, `/interview/*`, `/dashboard/*` routes the
  frontend already calls.
- **Resume/JD extraction** — the LLM-based extraction pipeline
  (`app/core/llm.py`, `app/core/file_parsing.py`, `app/core/extraction.py`),
  provider-swappable between Claude and OpenAI via `LLM_PROVIDER` in `.env`.

## Setup

1. **PostgreSQL** — create a database:
   ```sql
   CREATE DATABASE careerprepai;
   ```

2. **Python environment**
   ```bash
   python -m venv venv
   source venv/bin/activate       # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Configure env**
   ```bash
   cp .env.example .env
   ```
   Edit `.env`:
   - `DATABASE_URL` → your Postgres connection string
   - `SECRET_KEY` → any long random string (`openssl rand -hex 32`)
   - `CORS_ORIGINS` → the frontend's dev URL (`http://localhost:5173` by default)
   - `LLM_PROVIDER` → `claude` or `openai`
   - `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` → whichever provider you picked

4. **Run**
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   Tables are created automatically on startup (Phase 1 — no migrations yet).
   Visit `http://localhost:8000/docs` for interactive API docs.

5. Point the frontend at this backend: in `careerprepai-frontend/.env`, set
   `VITE_API_BASE_URL=http://localhost:8000`.

## What's implemented (Phase 1 scope, per blueprint §8.1)

- `POST /auth/register`, `POST /auth/login` — bcrypt hashing, JWT bearer tokens
- `POST /resume/upload` — PDF/DOCX/TXT → raw text → **LLM extraction**
  (role, company, experience level, skills, responsibilities, projects,
  summary) → stored as structured JSON against the resume row
- `POST /interview/start` — creates a session, returns the first question
- `POST /interview/{id}/message` — records the answer, returns the next
  question or `finished: true`
- `POST /interview/{id}/end` — closes the session, generates a report
- `GET /interview/{id}/report` — scores, strengths, weak topics, recommendations
- `GET /dashboard/history` — past sessions for the logged-in user

## Added for the voice interview
- `GET /interview/{id}` (rejoin), `POST /interview/{id}/message` now returns `is_followup`, `analysis`, `sources` (RAG), `closing`
- `GET /voice/config`, `POST /voice/transcribe` (Whisper via Groq/OpenAI), `POST /voice/tts` (Edge/OpenAI/ElevenLabs)
- RAG over `app/data/company_faqs.json`: ChromaDB if available (first run downloads an ~80MB model), otherwise a built-in TF-IDF index
- LLM-based report (clarity, relevance, structure + per-question feedback); heuristic fallback if no LLM
- New columns are added automatically on startup (`ensure_schema`) so an existing database keeps working
- Every LLM step has an offline fallback, so the interview never dead-ends

## Database schema

`app/models/models.py` — `users`, `resumes` (now storing the LLM-extracted
`ExtractedProfile` JSON), `interview_sessions`, `transcript_entries`, `reports`.
