import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useParams } from 'react-router-dom'
import { interviewApi } from '../api/endpoints'
import { Alert, Button, Skeleton } from '../components/ui'
import { usePageMeta } from '../lib/seo'
import { copyText } from '../lib/clipboard'
import { errorMessage } from '../lib/errors'

// One report, two sections (one per round):
// { overall, summary, duration, questions_answered, avg_response_time,
//   rounds: [{ key: 'technical'|'resume', name, overall, scores: {axis: 0-100}, summary, strengths, weak_topics,
//              recommendations, topics: [{label, score}], per_question: [{index, score, question, answer, topic,
//              is_followup, feedback, better_answer_tip, correct?, mistakes?}], questions_answered }],
//   ...legacy flat fields (technical, clarity, ...) used when a report predates rounds }
const AXIS = {
  knowledge: 'Technical knowledge', depth: 'Depth', problem_solving: 'Problem solving',
  ownership: 'Ownership', specificity: 'Specificity', impact: 'Impact and results',
  relevance: 'Relevance', clarity: 'Clarity', communication: 'Communication', confidence: 'Confidence', grammar: 'Grammar',
}
const ROUND_BLURB = {
  technical: 'Judged on technical knowledge: correctness, depth and problem solving for the role.',
  resume: 'Judged on how well you own and explain your experience and projects.',
}

const tone = (v) => (v >= 70 ? 'text-teal-ink' : v >= 50 ? 'text-amber-ink' : 'text-coral-ink')

function Bars({ rows }) {
  return rows.map(([label, value]) => (
    <div key={label} className="mb-3.5 last:mb-0">
      <div className="mb-1.5 flex justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-mono text-ink">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-panel2">
        <div className="h-full rounded-full bg-teal transition-all duration-1000" style={{ width: `${value}%` }} />
      </div>
    </div>
  ))
}

function RoundSection({ round, index, forceOpen = false }) {
  const [openState, setOpen] = useState(false)
  const open = openState || forceOpen
  const rows = Object.entries(round.scores || {}).map(([k, v]) => [AXIS[k] || k, v])
  const reached = round.questions_answered > 0
  return (
    <section className="glass mt-10 rounded-card" data-testid={`round-${round.key}`}>
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-6 py-5 rounded-t-card">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-teal-ink">Round {index + 1}</p>
          <h2 className="font-display text-2xl font-semibold">{round.name}</h2>
          <p className="mt-1 text-sm text-muted">{ROUND_BLURB[round.key]}</p>
        </div>
        <div className="text-right">
          <span className={`font-display text-4xl font-semibold ${reached ? tone(round.overall) : 'text-muted'}`} data-testid={`score-${round.key}`}>
            {reached ? round.overall : '—'}
          </span>
          <span className="text-base text-muted">/100</span>
          <p className="font-mono text-xs text-muted">{round.questions_answered} answered</p>
        </div>
      </header>

      {!reached ? (
        <p className="px-6 py-6 text-sm text-muted">{round.summary}</p>
      ) : (
        <div className="space-y-8 px-6 py-6">
          {round.summary && <p className="text-sm leading-relaxed text-ink">{round.summary}</p>}

          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <Bars rows={rows} />
            </div>
            <div className="space-y-5">
              {round.topics?.length > 0 && (
                <div>
                  <h3 className="mb-2 font-display text-sm font-semibold">{round.key === 'technical' ? 'Topics' : 'Resume items'}</h3>
                  <ul className="space-y-1.5">
                    {round.topics.map((t) => (
                      <li key={t.label} className="flex items-center justify-between gap-3 glass rounded-lg px-3 py-1.5 text-sm">
                        <span className="truncate text-ink">{t.label}</span>
                        <span className={`font-mono text-xs ${tone(t.score)}`}>{t.score}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {(round.strengths || []).map((s) => (
                  <span key={s} className="rounded-full border border-teal-ink/40 px-3 py-1 text-xs text-teal-ink">{s}</span>
                ))}
                {(round.weak_topics || []).map((w) => (
                  <span key={w} className="rounded-full border border-coral-ink/40 px-3 py-1 text-xs text-coral-ink">{w}</span>
                ))}
              </div>
            </div>
          </div>

          {round.recommendations?.length > 0 && (
            <div>
              <h3 className="mb-2 font-display text-sm font-semibold">How to improve this round</h3>
              <ul className="space-y-2 text-sm text-muted">
                {round.recommendations.map((r) => (
                  <li key={r} className="glass rounded-lg px-3 py-2">{r}</li>
                ))}
              </ul>
            </div>
          )}

          {round.per_question?.length > 0 && (
            <div>
              <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="font-display text-sm font-semibold text-teal-ink hover:underline" data-testid={`toggle-${round.key}`} data-no-print>
                {open ? 'Hide' : 'Show'} question by question ({round.per_question.length})
              </button>
              {open && (
                <ul className="mt-3 space-y-3">
                  {round.per_question.map((q) => (
                    <li key={q.index} className="glass rounded-card p-4 text-sm">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="font-mono text-xs text-muted">
                          Q{q.index}{q.topic ? ` · ${q.topic}` : ''}{q.is_followup ? ' · follow-up' : ''}
                        </span>
                        <span className={`font-mono text-xs ${tone(q.score)}`}>{q.score}/100</span>
                      </div>
                      {q.question && <p className="text-ink">{q.question}</p>}
                      {q.answer && <p className="mt-1.5 border-l-2 border-line pl-3 text-muted">{q.answer}</p>}
                      <p className="mt-2 text-ink">{q.feedback}</p>
                      {q.mistakes?.length > 0 && <p className="mt-1.5 text-coral-ink">Shaky or missing: {q.mistakes.join('; ')}</p>}
                      {q.better_answer_tip && <p className="mt-1.5 text-muted">Tip: {q.better_answer_tip}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// Reports created before rounds existed keep the old single-section layout.
function LegacyBody({ report }) {
  const rows = [
    ['Clarity', report.clarity], ['Relevance', report.relevance], ['Structure', report.structure],
    ['Technical knowledge', report.technical], ['Communication', report.communication],
    ['Confidence', report.confidence], ['Grammar', report.grammar],
  ].filter(([, v]) => v !== null && v !== undefined)
  return (
    <div className="mt-8 grid gap-8 md:grid-cols-2">
      <div className="glass rounded-card p-6"><Bars rows={rows} /></div>
      <ul className="space-y-2 text-sm text-muted">
        {(report.recommendations || []).map((r) => <li key={r} className="glass rounded-lg px-3 py-2">{r}</li>)}
      </ul>
    </div>
  )
}

// Plain-text version of the report for the "Copy summary" button.
function buildSummary(report) {
  const lines = ['CareerPrepAi interview report', `Overall: ${report.overall}/100 | Duration: ${report.duration ?? '-'} | Answered: ${report.questions_answered ?? '-'}`]
  for (const [i, r] of (report.rounds || []).entries()) {
    lines.push('', `Round ${i + 1}: ${r.name}: ${r.questions_answered ? `${r.overall}/100` : 'not reached'}`)
    if (r.summary) lines.push(r.summary)
    if (r.strengths?.length) lines.push(`Strengths: ${r.strengths.join('; ')}`)
    if (r.weak_topics?.length) lines.push(`To work on: ${r.weak_topics.join('; ')}`)
    for (const rec of r.recommendations || []) lines.push(`- ${rec}`)
  }
  if (!(report.rounds || []).length) {
    if (report.summary) lines.push('', report.summary)
    for (const rec of report.recommendations || []) lines.push(`- ${rec}`)
  }
  return lines.join('\n')
}

export default function Report() {
  usePageMeta({ title: 'Interview report', noindex: true })
  const { sessionId } = useParams()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [printing, setPrinting] = useState(false)
  const [copied, setCopied] = useState(null) // null | 'ok' | 'fail'

  // expand every round's question list while printing / saving as PDF, then restore
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true))
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])

  const copySummary = useCallback(async () => {
    const ok = await copyText(buildSummary(report))
    setCopied(ok ? 'ok' : 'fail')
    setTimeout(() => setCopied(null), 3000)
  }, [report])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    interviewApi.getReport(sessionId)
      .then(({ data }) => { if (active) setReport(data) })
      .catch((err) => { if (active) setError(errorMessage(err, 'Could not load the report.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [sessionId, attempt])

  const rounds = report?.rounds || []

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-wide text-teal-ink">Session report</p>
          <h1 className="font-display text-3xl font-semibold">How it went</h1>
        </div>
        {report && (
          <div className="flex flex-wrap gap-2" data-no-print>
            <Button variant="secondary" size="sm" onClick={copySummary}>{copied === 'ok' ? 'Copied' : 'Copy summary'}</Button>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>Print or save as PDF</Button>
          </div>
        )}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {copied === 'ok' ? 'Report summary copied to the clipboard.' : copied === 'fail' ? 'Could not copy. Select the text and copy it manually.' : ''}
      </div>
      {copied === 'fail' && <Alert tone="error" className="mb-4">Could not copy to the clipboard. Select the text and copy it manually.</Alert>}

      {loading && (
        <div aria-busy="true">
          <span className="sr-only">Loading your report</span>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="mt-6 h-64 w-full" />
        </div>
      )}
      {error && (
        <Alert tone="error" className="flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          <span className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
            <Button to="/dashboard" variant="secondary" size="sm">Dashboard</Button>
          </span>
        </Alert>
      )}

      {report && (
        <>
          <div className="glass rounded-card p-6" data-testid="report-overview">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="text-sm text-muted">Overall</span>
                <p className="font-display text-5xl font-semibold" data-testid="overall-score">{report.overall}<span className="text-base text-muted">/100</span></p>
              </div>
              {rounds.length > 0 && (
                <div className="flex gap-3">
                  {rounds.map((r, i) => (
                    <a key={r.key} href={`#round-${r.key}`} onClick={(e) => { e.preventDefault(); document.querySelector(`[data-testid="round-${r.key}"]`)?.scrollIntoView({ behavior: 'smooth' }) }}
                       className="rounded-lg border border-line px-4 py-2 text-center hover:border-teal">
                      <span className="block font-mono text-[10px] uppercase tracking-wide text-muted">Round {i + 1} · {r.key === 'technical' ? 'Technical' : 'Resume'}</span>
                      <span className={`font-display text-2xl font-semibold ${r.questions_answered ? tone(r.overall) : 'text-muted'}`}>{r.questions_answered ? r.overall : '—'}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 font-mono text-xs text-muted">
              <div className="rounded-lg border border-line p-3"><div className="text-ink">{report.duration ?? '—'}</div><div>duration</div></div>
              <div className="rounded-lg border border-line p-3"><div className="text-ink">{report.questions_answered ?? '—'}</div><div>answered</div></div>
              <div className="rounded-lg border border-line p-3"><div className="text-ink">{report.avg_response_time ?? '—'}</div><div>avg time</div></div>
            </div>
          </div>

          {rounds.length > 0 ? (
            rounds.map((r, i) => <RoundSection key={r.key} round={r} index={i} forceOpen={printing} />)
          ) : (
            <>
              <LegacyBody report={report} />
              {report.summary && <p className="mt-8 glass rounded-card p-5 text-sm leading-relaxed text-ink">{report.summary}</p>}
            </>
          )}
        </>
      )}

      <Link to="/dashboard" data-no-print className="mt-10 inline-block text-sm text-teal-ink hover:underline">
        ← Back to dashboard
      </Link>
    </div>
  )
}
