import { useEffect, useState } from 'react'
import { adminApi } from '../api/endpoints'
import { Alert, Skeleton } from '../components/ui'
import NotFound from './NotFound'
import { usePageMeta } from '../lib/seo'
import { errorMessage } from '../lib/errors'

// Owner-only product statistics. The API returns aggregate counts and never any resume,
// answer, name or email, so there is nothing sensitive to render here.

const SERIES = [
  { key: 'signups', label: 'Signups' },
  { key: 'interviews_started', label: 'Interviews started' },
  { key: 'interviews_completed', label: 'Interviews completed' },
  { key: 'reports', label: 'Reports generated' }
]

const fmtDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

function Stat({ label, value, note }) {
  return (
    <div className="bg-panel p-4 sm:p-5">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-semibold tabular-nums text-ink">{value}</dd>
      {note && <dd className="mt-0.5 text-xs text-muted">{note}</dd>}
    </div>
  )
}

function Bars({ series, k, label }) {
  const max = Math.max(1, ...series.map((d) => d[k]))
  const total = series.reduce((a, d) => a + d[k], 0)
  const W = 300
  const H = 64
  const bw = W / series.length
  return (
    <figure className="rounded-card border border-line bg-panel p-4">
      <figcaption className="mb-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold text-ink">{label}</span>
        <span className="text-xs text-muted">{total} in the last {series.length} days</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" role="img" aria-label={`${label} per day, last ${series.length} days, ${total} in total, busiest day ${max}`} preserveAspectRatio="none">
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} stroke="currentColor" className="text-line-strong" />
        {series.map((d, i) => {
          const h = (d[k] / max) * (H - 4)
          return d[k] > 0 ? (
            <rect key={d.date} x={i * bw + 1} width={Math.max(1, bw - 2)} y={H - h} height={h} rx="1" className="fill-teal-ink">
              <title>{`${fmtDay(d.date)}: ${d[k]}`}</title>
            </rect>
          ) : null
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{fmtDay(series[0].date)}</span>
        <span>{fmtDay(series[series.length - 1].date)}</span>
      </div>
    </figure>
  )
}

export default function Admin() {
  usePageMeta({ title: 'Admin', noindex: true })
  const [state, setState] = useState({ status: 'loading' })

  const load = () => {
    setState({ status: 'loading' })
    adminApi
      .stats()
      .then(({ data }) => setState({ status: 'ok', data }))
      .catch((err) =>
        setState(
          err?.response?.status === 403
            ? { status: 'forbidden' }
            : { status: 'error', message: errorMessage(err, 'Could not load statistics.') }
        )
      )
  }
  useEffect(load, [])

  // to anyone who isn't an admin the page simply doesn't exist
  if (state.status === 'forbidden') return <NotFound />

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Admin</h1>
      <p className="mt-1 text-sm text-muted">Totals and daily counts only. No resume text, answers, names or emails are shown here.</p>

      {state.status === 'loading' && (
        <div className="mt-6 space-y-3" aria-busy="true" aria-label="Loading statistics">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      )}


      {state.status === 'error' && (
        <div className="mt-6 space-y-3">
          <Alert tone="error">{state.message}</Alert>
          <button type="button" onClick={load} className="rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-ink hover:border-muted">Try again</button>
        </div>
      )}

      {state.status === 'ok' && (() => {
        const { totals: t, series, completion_rate: rate, generated_at: at } = state.data
        return (
          <>
            <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-3">
              <Stat label="Registered users" value={t.users} note={`${t.signups_7d} new in 7 days`} />
              <Stat label="Active users (7 days)" value={t.active_users_7d} note="Started an interview" />
              <Stat label="Interviews started" value={t.interviews_started} />
              <Stat label="Interviews completed" value={t.interviews_completed} note={rate === null ? 'No interviews yet' : `${rate}% of started`} />
              <Stat label="Reports generated" value={t.reports} />
              <Stat label="Resumes uploaded" value={t.resumes} />
            </dl>

            <h2 className="mt-8 font-display text-lg font-semibold text-ink">Last {series.length} days</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {SERIES.map((s) => <Bars key={s.key} series={series} k={s.key} label={s.label} />)}
            </div>

            <details className="mt-6 rounded-card border border-line bg-panel p-4">
              <summary className="cursor-pointer text-sm font-medium text-ink">Show the daily numbers as a table</summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm tabular-nums">
                  <caption className="sr-only">Daily counts for the last {series.length} days</caption>
                  <thead className="text-xs text-muted">
                    <tr>
                      <th scope="col" className="py-1 pr-3 font-medium">Date</th>
                      {SERIES.map((s) => <th key={s.key} scope="col" className="py-1 pr-3 font-medium">{s.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[...series].reverse().map((d) => (
                      <tr key={d.date} className="border-t border-line">
                        <th scope="row" className="py-1 pr-3 font-normal text-muted">{fmtDay(d.date)}</th>
                        {SERIES.map((s) => <td key={s.key} className="py-1 pr-3">{d[s.key]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <p className="mt-4 text-xs text-muted">Updated {new Date(at).toLocaleString()}. Days are counted in UTC.</p>
          </>
        )
      })()}
    </div>
  )
}
