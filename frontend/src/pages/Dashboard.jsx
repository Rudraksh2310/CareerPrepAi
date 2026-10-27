import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboardApi } from '../api/endpoints'
import { Alert, Button, Skeleton, scoreTone } from '../components/ui'
import { usePageMeta } from '../lib/seo'
import { errorMessage } from '../lib/errors'

// History item from GET /dashboard/history: { id, role, company, started_at, overall_score }.
// Everything below is derived from that real data; nothing is estimated or invented.

const PAGE_SIZE = 8

// the API returns naive UTC timestamps; make that explicit so the browser shows local time
const toDate = (s) => new Date(/(Z|[+-]\d\d:?\d\d)$/i.test(s) ? s : `${s}Z`)
const fmtDate = (s) => toDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const fmtTime = (s) => toDate(s).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const hasScore = (s) => typeof s.overall_score === 'number'

const controlCls =
  'h-10 rounded-md border border-line-strong bg-panel px-3 text-sm text-ink transition-colors hover:border-muted ' +
  'focus:border-teal-ink focus:outline-none focus:ring-2 focus:ring-teal-ink/25'

function Stat({ label, value, note }) {
  return (
    <div className="bg-panel/70 p-4 sm:p-5">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-semibold tabular-nums text-ink sm:text-[1.75rem]">{value}</dd>
      {note && <dd className="mt-0.5 text-xs text-muted">{note}</dd>}
    </div>
  )
}

// Overall score per interview, oldest to newest. Real scores only; hidden until there are at least two.
function ScoreTrend({ points }) {
  const box = useRef(null)
  const [W, setW] = useState(640)
  const H = 160
  useEffect(() => {
    const el = box.current
    if (!el) return undefined
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const pad = { l: 34, r: 12, t: 12, b: 22 }
  const x = (i) => pad.l + (points.length === 1 ? 0 : (i * (W - pad.l - pad.r)) / (points.length - 1))
  const y = (v) => pad.t + ((100 - v) * (H - pad.t - pad.b)) / 100
  const line = points.map((p, i) => `${x(i)},${y(p.score)}`).join(' ')
  const first = points[0]
  const last = points[points.length - 1]
  return (
    <figure className="glass rounded-card p-4 sm:p-5">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
        <span className="font-semibold text-ink">Score trend</span>
        <span className="text-xs text-muted">Overall score, last {points.length} scored interviews, oldest to newest</span>
      </figcaption>
      <div ref={box} className="w-full">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block"
        role="img"
        aria-label={`Overall score across ${points.length} interviews, from ${first.score} to ${last.score}.`}
      >
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} className="stroke-line" strokeWidth="1" />
            <text x={pad.l - 8} y={y(g) + 4} textAnchor="end" fontSize="11" className="fill-muted" fontFamily="IBM Plex Mono, monospace">{g}</text>
          </g>
        ))}
        <polyline points={line} fill="none" className="stroke-teal-ink" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={p.id} cx={x(i)} cy={y(p.score)} r="4" className="fill-panel stroke-teal-ink" strokeWidth="2">
            <title>{`${p.label}: ${p.score}/100 (${p.date})`}</title>
          </circle>
        ))}
        <text x={x(0)} y={H - 5} textAnchor="start" fontSize="11" className="fill-muted" fontFamily="IBM Plex Mono, monospace">{first.date}</text>
        <text x={x(points.length - 1)} y={H - 5} textAnchor="end" fontSize="11" className="fill-muted" fontFamily="IBM Plex Mono, monospace">{last.date}</text>
      </svg>
      </div>
    </figure>
  )
}

function LoadingState() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your interviews</span>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-panel/70 p-5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-3 h-7 w-12" />
          </div>
        ))}
      </div>
      <div className="glass mt-6 overflow-hidden rounded-card">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between border-b border-line px-4 py-4 last:border-0">
            <div className="space-y-2">
              <Skeleton className="h-4 w-48 max-w-[50vw]" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-5 w-10" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  usePageMeta({ title: 'Dashboard', noindex: true })
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all') // all | scored | open
  const [sort, setSort] = useState('newest') // newest | oldest | high | low
  const [page, setPage] = useState(1)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    dashboardApi.history()
      .then(({ data }) => { if (active) setSessions(data) })
      .catch((err) => { if (active) setError(errorMessage(err, 'Could not load your interviews.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [attempt])

  const stats = useMemo(() => {
    const scored = sessions.filter(hasScore)
    const avg = scored.length ? Math.round(scored.reduce((a, s) => a + s.overall_score, 0) / scored.length) : null
    const best = scored.length ? Math.max(...scored.map((s) => s.overall_score)) : null
    return { total: sessions.length, scored: scored.length, avg, best }
  }, [sessions])

  const trend = useMemo(
    () =>
      sessions
        .filter(hasScore)
        .sort((a, b) => toDate(a.started_at) - toDate(b.started_at))
        .slice(-12)
        .map((s) => ({
          id: s.id,
          score: s.overall_score,
          label: s.company ? `${s.role}, ${s.company}` : s.role,
          date: fmtDate(s.started_at)
        })),
    [sessions]
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = sessions.filter((s) => {
      if (filter === 'scored' && !hasScore(s)) return false
      if (filter === 'open' && hasScore(s)) return false
      return !q || `${s.role} ${s.company || ''}`.toLowerCase().includes(q)
    })
    const t = (s) => toDate(s.started_at).getTime()
    const sc = (s, none) => (hasScore(s) ? s.overall_score : none)
    rows = [...rows].sort((a, b) => {
      if (sort === 'oldest') return t(a) - t(b)
      if (sort === 'high') return sc(b, -1) - sc(a, -1) || t(b) - t(a)
      if (sort === 'low') return sc(a, 101) - sc(b, 101) || t(b) - t(a)
      return t(b) - t(a)
    })
    return rows
  }, [sessions, query, filter, sort])

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const rows = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const filtering = query.trim() !== '' || filter !== 'all'
  const clearFilters = () => { setQuery(''); setFilter('all'); setPage(1) }

  return (
    <div className="page py-8 sm:py-12">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow mb-2">Dashboard</p>
          <h1 className="h2 sm:text-4xl">Your interviews</h1>
          <p className="mt-1.5 max-w-prose text-sm text-muted">Every mock interview you have run, with its score and full report.</p>
        </div>
        <Button to="/upload" size="lg" className="w-full sm:w-auto">New interview</Button>
      </div>

      {loading && <LoadingState />}

      {!loading && error && (
        <Alert tone="error" className="flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
        </Alert>
      )}

      {!loading && !error && sessions.length === 0 && (
        <div className="glass rounded-card !border-dashed px-6 py-12 text-center">
          <h2 className="h3 text-lg">No interviews yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Upload your resume, pick a role and an interviewer, and they will run a technical round and a resume round. Your score and report will show up here.
          </p>
          <Button to="/upload" className="mt-5">Start your first interview</Button>
        </div>
      )}

      {!loading && !error && sessions.length > 0 && (
        <div className="space-y-6">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
            <Stat label="Interviews" value={stats.total} />
            <Stat label="With a report" value={stats.scored} note={stats.total - stats.scored > 0 ? `${stats.total - stats.scored} not finished` : undefined} />
            <Stat label="Average score" value={stats.avg ?? '—'} note={stats.avg == null ? 'No scored interviews yet' : 'out of 100'} />
            <Stat label="Best score" value={stats.best ?? '—'} note={stats.best == null ? undefined : 'out of 100'} />
          </dl>

          {trend.length >= 2 && <ScoreTrend points={trend} />}

          <section aria-labelledby="history-h">
            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h2 id="history-h" className="h3 text-lg">All interviews</h2>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                <div className="col-span-2 sm:w-64">
                  <label htmlFor="q" className="sr-only">Search by role or company</label>
                  <input
                    id="q"
                    type="search"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setPage(1) }}
                    placeholder="Search role or company"
                    className={`${controlCls} w-full placeholder:text-muted/70`}
                  />
                </div>
                <div>
                  <label htmlFor="f" className="sr-only">Show</label>
                  <select id="f" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1) }} className={`${controlCls} w-full`}>
                    <option value="all">All interviews</option>
                    <option value="scored">With a report</option>
                    <option value="open">Not finished</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="s" className="sr-only">Sort by</label>
                  <select id="s" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }} className={`${controlCls} w-full`}>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="high">Highest score</option>
                    <option value="low">Lowest score</option>
                  </select>
                </div>
              </div>
            </div>

            {visible.length === 0 ? (
              <div className="glass rounded-card px-6 py-10 text-center">
                <p className="text-sm text-muted">No interviews match{filtering ? ' these filters' : ''}.</p>
                <Button variant="secondary" size="sm" className="mt-4" onClick={clearFilters}>Clear filters</Button>
              </div>
            ) : (
              <div className="glass overflow-hidden rounded-card">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Your interviews, {visible.length} shown</caption>
                  <thead className="border-b border-line bg-panel2/70 text-xs font-medium text-muted">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 font-medium">Interview</th>
                      <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Date</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Score</th>
                      <th scope="col" className="w-16 px-3 py-2.5 sm:w-28 sm:px-4"><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((s) => {
                      const scored = hasScore(s)
                      const to = scored ? `/report/${s.id}` : `/interview/${s.id}`
                      return (
                        <tr key={s.id} className="transition-colors hover:bg-panel2/50">
                          <td className="px-4 py-3.5">
                            <p className="font-medium text-ink">{s.role}</p>
                            <p className="text-xs text-muted">
                              {s.company || 'No company'}
                              <span className="md:hidden"> &middot; {fmtDate(s.started_at)}</span>
                            </p>
                          </td>
                          <td className="hidden px-4 py-3.5 text-muted md:table-cell">
                            {fmtDate(s.started_at)}
                            <span className="block text-xs">{fmtTime(s.started_at)}</span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {scored ? (
                              <span className={`font-mono text-base font-semibold tabular-nums ${scoreTone(s.overall_score)}`}>
                                {s.overall_score}<span className="text-xs font-normal text-muted">/100</span>
                              </span>
                            ) : (
                              <span className="whitespace-nowrap text-xs text-muted">No report</span>
                            )}
                          </td>
                          <td className="px-3 py-3.5 text-right sm:px-4">
                            <Link to={to} className="inline-flex min-h-[2.25rem] items-center whitespace-nowrap text-sm font-semibold text-teal-ink hover:underline">
                              {scored ? <>View<span className="hidden sm:inline">&nbsp;report</span></> : 'Resume'}
                              <span className="sr-only">: {s.role}{s.company ? `, ${s.company}` : ''}, {fmtDate(s.started_at)}</span>
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {visible.length > PAGE_SIZE && (
                  <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
                    <p className="text-muted" aria-live="polite">
                      {(current - 1) * PAGE_SIZE + 1}&ndash;{Math.min(current * PAGE_SIZE, visible.length)} of {visible.length}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</Button>
                      <Button variant="secondary" size="sm" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</Button>
                    </div>
                  </nav>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
