# Security and deployment notes

What the app enforces itself, what the host must add, and what is still open.

## Enforced by the backend
- **Uploads** (`backend/app/core/upload_guard.py`): the server checks the file *contents*, not the filename or the browser-supplied MIME type. PDF needs a `%PDF-` header, DOCX must be a valid ZIP containing the Word document parts (entry-count and uncompressed-size limits against zip bombs), TXT must be strict UTF-8 with no binary bytes. A file whose contents do not match its extension gets 415, an oversized file 413. The size cap (`MAX_UPLOAD_BYTES`, default 5 MB) is enforced while reading, so a client cannot bypass it. The frontend repeats these checks only for faster feedback.
- **Auth**: JWT (HS256) required on every non-public route; every interview/report query is scoped to the owning user (a foreign id returns 404). Production refuses to start with a weak `SECRET_KEY`.
- **Abuse limits**: login, register, upload and voice endpoints are rate limited. The limiter is in memory and per process.
- **Errors**: unexpected errors return a generic 500; validation errors never echo secrets or stack traces.
- **Headers**: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` (camera/microphone/geolocation off: the API serves no pages; the frontend host sets the site's own policy, below), a locked-down `Content-Security-Policy` for API responses, and `Cache-Control: no-store` on authenticated responses. CORS is limited to `CORS_ORIGINS`.
- **Interviewer choice**: the character is a whitelisted key (`backend/app/core/personas.py`); unknown values are rejected on `/interview/start` and fall back to the default on `/voice/tts`. Nothing the client sends is used as a voice name or file path.
- **Privacy tools**: `GET /auth/me/export` (download your data) and `DELETE /auth/me` (password-confirmed account deletion).

## The host must add
1. **Reverse proxy**: TLS, a request body cap (the in-app cap checks `Content-Length`, so a chunked upload must also be limited at the proxy, e.g. `client_max_body_size 6m`), and a shared rate limit if you run more than one backend process. Set `TRUST_PROXY=true` only behind a proxy you control.
2. **Static-site headers** for the frontend host (the Vite build ships none). Suggested starting point, to be tested against your real API origin:
   ```
   Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://YOUR-API-ORIGIN; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
   X-Content-Type-Options: nosniff
   Referrer-Policy: strict-origin-when-cross-origin
   Permissions-Policy: microphone=(self), camera=(self)
   ```
   Fonts are self-hosted, so no third-party origins are required. Serve `index.html` for unknown paths (SPA fallback) but return real 404s for missing files under `/assets`.
3. **Environment**: `ENVIRONMENT=production`, a random `SECRET_KEY` (`openssl rand -hex 32`), a real `CORS_ORIGINS`, and at build time `VITE_SITE_URL` (emits canonical URLs, Open Graph URLs and `sitemap.xml`).

## Known limits and decisions
- **Token storage**: the JWT is kept in `localStorage`. An XSS bug would expose it. Mitigations: no `dangerouslySetInnerHTML` anywhere, React escaping, the CSP above. Moving to an httpOnly cookie is a larger change (CSRF protection, cookie settings per domain) and was not done.
- **Dependency advisories**: `react-router` has an advisory that is only fixed in v7 (a major upgrade, not forced here); one Tailwind build-chain advisory affects development only. Re-run `npm audit` before release.
- **Legal pages**: Privacy and Terms are drafts written from what the code actually does. They show a draft notice until `VITE_LEGAL_REVIEWED=true`. The legal entity, governing law and contact address were not provided and were not invented (`VITE_CONTACT_EMAIL`).
- **Analytics**: none installed, and no cookies are set, so there is no cookie banner. If you add analytics, add it behind a consent control and update the Privacy Policy first. No analytics ID was provided.
- **Rendering**: client-side rendered SPA; per-route titles/descriptions are set at runtime, so crawlers that do not run JavaScript see only the homepage tags. Prerendering was not added.
- **Types**: the project is plain JavaScript; type checking was not added.

## Admin statistics page (`/admin`)

An owner-only page showing real totals and 30-day daily counts (signups, interviews started and completed, reports, resumes, active users). It reads your own database; no third party is involved.

- **Aggregates only.** `GET /admin/stats` counts rows. It never selects resume text, questions, answers, names or emails, and a test asserts that none appear in the response.
- **Who can open it.** Only accounts whose `is_admin` flag is true. There is no API or screen that grants the flag; you set it once, directly in the database (SQL console in Neon, or psql):

```sql
UPDATE users SET is_admin = TRUE WHERE email = 'you@example.com';
```

  Use your own registered email. The column is added automatically on the next backend start. Other accounts get a 403 from the API, and the page shows the normal "not found" screen.
- **Open it** at `https://your-site/admin` while signed in. It is intentionally not linked from the navigation and is marked noindex.
- Days are counted in UTC. Counts go down when users delete their accounts.

## Still outside the app (your choices, not yet wired in)

- **Visitor analytics** (page views, referrers): not added. Pick Plausible, Umami or Cloudflare Web Analytics, then add its script and update the Privacy page in the same change. Have your legal reviewer confirm whether a consent banner is needed for your audience.
- **Uptime**: point an uptime monitor (UptimeRobot, Better Stack, etc.) at `/health/ready`. It returns 503 when the database is unreachable.
- **Errors**: add an error tracker such as Sentry for the backend and frontend, and list it on the Privacy page as a processor.
