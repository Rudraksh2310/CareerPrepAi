# CareerPrepAi — Frontend (Phase 1)

React + Vite + Tailwind frontend for the Phase 1 scope from the project blueprint:
auth, resume upload, text-based interview, basic report, dashboard.

## Setup

```bash
npm install
cp .env.example .env      # then set VITE_API_BASE_URL to your FastAPI backend
npm run dev
```

Build check (already verified, builds clean):

```bash
npm run build
```

## Structure

```
src/
  api/
    client.js       axios instance, attaches bearer token, handles 401
    endpoints.js     one function per backend endpoint (blueprint §6)
  context/
    AuthContext.jsx  login/register/logout + session state
  components/
    Nav.jsx
    ProtectedRoute.jsx
  pages/
    Home, Login, Register, ResumeUpload, Interview, Report, Dashboard
```

## Backend contract this frontend expects

These match the "Backend / API Design" table in the blueprint (§6). If your
FastAPI routes differ, only `src/api/endpoints.js` needs to change — no page
component references a URL directly.

| Endpoint | Method | Expected response body (used by frontend) |
|---|---|---|
| `/auth/register` | POST | `{ token, user: { id, name, email } }` |
| `/auth/login` | POST | `{ token, user: { id, name, email } }` |
| `/resume/upload` | POST (multipart) | `{ id, parsed_skills, parsed_projects }` |
| `/interview/start` | POST | `{ id, first_question }` |
| `/interview/{id}/message` | POST | `{ question }` or `{ finished: true }` |
| `/interview/{id}/end` | POST | `{}` (any 2xx) |
| `/interview/{id}/report` | GET | `{ technical, communication, confidence, grammar, overall, strengths[], weak_topics[], recommendations[], duration, questions_answered, avg_response_time }` |
| `/dashboard/history` | GET | `[{ id, role, company, started_at, overall_score }]` |

All authenticated requests send `Authorization: Bearer <token>` automatically
(see `client.js`). A 401 response clears the stored token client-side.

## Notes for the next phase

- `VITE_API_BASE_URL` unset → dev server proxies `/api/*` to `localhost:8000`
  (see `vite.config.js`), so this also works before `.env` is configured.
- Design tokens (colors, fonts) live in `tailwind.config.js` — kept identical
  to the earlier concept page so visuals stay consistent.
- Voice/avatar (Phase 4 in the blueprint) is intentionally not wired up yet —
  `Interview.jsx` is text-only by design for this phase.
