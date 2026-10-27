# CareerPrepAI — AI Interview Coach

A voice-based mock interview. You join a video-call-style room, an animated AI interviewer asks questions out loud (choose one of five characters: Aria, Arjun, Meera, Daniel or Marcus, each with their own voice),
listens to your spoken answers, analyses them, and asks **RAG-grounded follow-up questions**. At the end you get a scored feedback report.

## Interview structure (two rounds)

- **Round 1 - Technical:** 10 questions over 5 topics by default (`TECHNICAL_QUESTIONS`, `TECHNICAL_TOPICS`). Topics come from the job profile and the technologies the candidate lists (plus role fundamentals such as data structures or system design). Answers are judged on technical knowledge.
- **Round 2 - Resume:** exactly 5 questions by default (`RESUME_MAX_QUESTIONS`). Topics are taken in priority order: each experience, each project, then education, certifications and achievements. A resume with more than 5 items is therefore not covered completely; one with fewer gets follow-ups. Follow-ups use what the resume says and what the candidate answered.
- **Interviewer and microphone:** the character is chosen on the setup page and stored with the session (`interview_sessions.interviewer`; the column is added automatically to an existing database). The microphone is chosen in the lobby. Browser speech recognition (Chrome/Edge) always listens to the system default microphone, so picking a different one switches answers to server transcription (needs `GROQ_API_KEY` or `OPENAI_API_KEY`), without live captions.
- **Report:** one report with a section per round (own scores, topics, strengths, weak spots, recommendations, question-by-question).
- Code (`interview_plan.py`) owns coverage, budget and follow-up limits; the LLM writes the questions. Without an API key an offline engine runs instead; set the key matching `LLM_PROVIDER` in `backend/.env` for real AI follow-ups. Resumes uploaded before this version must be re-uploaded so experience and projects are extracted.

## How a turn works
```
mic ──► speech-to-text ──► POST /interview/{id}/message
                               │ 1. RAG: retrieve company/role FAQs closest to what you just said   (app/core/rag.py)
                               │ 2. LLM: analyse the answer (relevance/clarity/depth, claims, gaps)
                               │         + decide follow-up | new topic | re-ask, write the next question (question_engine.py)
                               ▼
        question text ──► text-to-speech ──► audio ──► Web Audio analyser ──► avatar mouth (lip-sync)
```

## Run it
1. **Backend** — see `backend/README.md` (Postgres, `.env`, `uvicorn app.main:app --reload`).
2. **Frontend** — `cd frontend && npm install && npm run dev` → http://localhost:5173
3. Use **Chrome or Edge** (built-in speech recognition, live captions). Allow microphone access. Headphones recommended.

No API keys? It still runs (heuristic follow-ups, device voice) — but add `ANTHROPIC_API_KEY` (or OpenAI/Groq) for real answer analysis and feedback.

## Security, privacy and deployment
Upload validation, rate limits, headers, account export/deletion and the production checklist (proxy limits, CSP, `ENVIRONMENT`, `VITE_SITE_URL`) are in `SECURITY_AND_DEPLOYMENT.md`. New settings are documented in `backend/.env.example` and `frontend/.env.example`.

## What is where
| Feature | Files |
|---|---|
| Call UI (lobby, tiles, captions, controls) | `frontend/src/pages/Interview.jsx`, `frontend/src/components/call/*` |
| Interviewer avatar + lip-sync | `frontend/src/components/Avatar.jsx`, `frontend/src/lib/tts.js` |
| Voice input (browser or Whisper) | `frontend/src/lib/stt.js`, `backend/app/routers/voice.py` |
| RAG + FAQ data (12 companies) | `backend/app/core/rag.py`, `backend/app/data/company_faqs.json` |
| Analysis + follow-ups | `backend/app/core/question_engine.py` |
| Feedback report | `backend/app/core/evaluation.py`, `frontend/src/pages/Report.jsx` |

## Look and motion
Palette: cool paper, ink, cobalt (actions) and marker yellow (the highlighter). Type: Bricolage Grotesque for headlines, Atkinson Hyperlegible Next for text, both bundled. Tokens are CSS variables in `src/index.css`; the names `teal` and `amber` now hold cobalt and yellow.

The home page opens with a sample interview exchange in large type (`components/home/InterviewStage.jsx`): a question, a typed answer with one phrase highlighted, and the follow-up that quotes it. Below it: two staggered round statements, a four-step timeline that fills as you scroll, five interviewer panels (the chosen one widens; the choice is remembered for the upload page), the report, a glossary and the FAQ.

Interview words drift behind the page (`components/FloatingTerms.jsx`, text in `content/glossary.js`). They fade out while passing over text or panels so they never cover it, stop on hover or focus, and clicking or pressing Enter opens a definition and a tip. A button pauses them, and the same terms are written out in the glossary section. Behind everything are slow sound-wave lines (`LiveBackground.jsx`).

All motion is switched off when the visitor's system asks for reduced motion: the exchange is shown complete, the words and waves stand still (the words are not rendered; the glossary lists them), and nothing is hidden. Touch screens show fewer words. Panels on the dashboard, upload, report and account pages are plain with a hairline border.

## Honest notes
- The FAQ bank is a **curated sample** of typical question patterns per company, not scraped real data. Add rows to `company_faqs.json`.
- The avatar is a built-in animated vector figure whose mouth is driven by the real TTS audio. A photoreal avatar API (Simli/Tavus/D-ID) can replace `Avatar.jsx`; it needs paid keys, so it is not wired in.
- Live updates use plain HTTP requests per turn (not WebSockets); that is enough for turn-based interviews.
- Tests: `cd backend && TEST_DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/careerprepai_test pytest`
