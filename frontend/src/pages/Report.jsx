import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { interviewApi } from '../api/endpoints'

// Expected report shape (per blueprint section 4.5 / 5.1 "Report" entity):
// { technical, communication, confidence, grammar, overall,
//   strengths: string[], weak_topics: string[], recommendations: string[],
//   duration, questions_answered, avg_response_time }
export default function Report() {
  const { sessionId } = useParams()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    interviewApi.getReport(sessionId)
      .then(({ data }) => { if (active) setReport(data) })
      .catch((err) => { if (active) setError(err.response?.data?.detail || 'Could not load the report.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [sessionId])

  const scoreRows = report ? [
    ['Technical knowledge', report.technical],
    ['Communication', report.communication],
    ['Confidence', report.confidence],
    ['Grammar', report.grammar]
  ] : []

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="mb-2 font-mono text-xs uppercase tracking-wide text-teal">Session report</p>
      <h1 className="mb-8 font-display text-3xl font-semibold">How it went</h1>

      {loading && <p className="text-sm text-muted">Loading your report…</p>}
      {error && <p className="text-sm text-coral">{error}</p>}

      {report && (
        <div className="grid gap-8 md:grid-cols-2">
          <div className="rounded-card border border-line bg-panel p-6">
            {scoreRows.map(([label, value]) => (
              <div key={label} className="mb-4 last:mb-0">
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="text-muted">{label}</span>
                  <span className="font-mono text-ink">{value}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-panel2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-teal to-amber transition-all duration-1000"
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            ))}

            <div className="mt-5 flex flex-wrap gap-2">
              {(report.strengths || []).map((s) => (
                <span key={s} className="rounded-full border border-teal/40 px-3 py-1 text-xs text-teal">{s}</span>
              ))}
              {(report.weak_topics || []).map((w) => (
                <span key={w} className="rounded-full border border-coral/40 px-3 py-1 text-xs text-coral/90">{w}</span>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 font-display text-lg font-semibold">Recommendations</h3>
            <ul className="space-y-2 text-sm text-muted">
              {(report.recommendations || []).map((r) => (
                <li key={r} className="rounded-lg border border-line bg-panel px-3 py-2">{r}</li>
              ))}
            </ul>

            <div className="mt-6 grid grid-cols-3 gap-3 font-mono text-xs text-muted">
              <div className="rounded-lg border border-line bg-panel p-3">
                <div className="text-ink">{report.duration ?? '—'}</div>
                <div>duration</div>
              </div>
              <div className="rounded-lg border border-line bg-panel p-3">
                <div className="text-ink">{report.questions_answered ?? '—'}</div>
                <div>answered</div>
              </div>
              <div className="rounded-lg border border-line bg-panel p-3">
                <div className="text-ink">{report.avg_response_time ?? '—'}</div>
                <div>avg time</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Link to="/dashboard" className="mt-10 inline-block text-sm text-teal hover:underline">
        ← Back to dashboard
      </Link>
    </div>
  )
}
