import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboardApi } from '../api/endpoints'

// Expected shape per blueprint: array of
// { id, role, company, started_at, overall_score }
export default function Dashboard() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    dashboardApi.history()
      .then(({ data }) => { if (active) setSessions(data) })
      .catch((err) => { if (active) setError(err.response?.data?.detail || 'Could not load your history.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-wide text-teal">Your history</p>
          <h1 className="font-display text-3xl font-semibold">Dashboard</h1>
        </div>
        <Link to="/upload" className="rounded-lg bg-amber px-4 py-2 text-sm font-semibold text-[#2A1600] hover:brightness-105">
          New interview
        </Link>
      </div>

      {loading && <p className="text-sm text-muted">Loading…</p>}
      {error && <p className="text-sm text-coral">{error}</p>}
      {!loading && !error && sessions.length === 0 && (
        <div className="rounded-card border border-line bg-panel p-8 text-center">
          <p className="mb-4 text-sm text-muted">No interviews yet.</p>
          <Link to="/upload" className="text-sm text-teal hover:underline">Start your first one →</Link>
        </div>
      )}

      <div className="space-y-3">
        {sessions.map((s) => (
          <Link
            key={s.id}
            to={`/report/${s.id}`}
            className="flex items-center justify-between rounded-lg border border-line bg-panel px-5 py-4 transition hover:border-teal"
          >
            <div>
              <p className="font-medium">{s.role}{s.company ? ` — ${s.company}` : ''}</p>
              <p className="font-mono text-xs text-muted">{s.started_at}</p>
            </div>
            {typeof s.overall_score === 'number' && (
              <span className="rounded-md bg-panel2 px-3 py-1 font-mono text-sm text-teal">{s.overall_score}</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
