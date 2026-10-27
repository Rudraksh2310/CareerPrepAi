import { useState } from 'react'

// A sample of the report, laid out like the real one (pages/Report.jsx): overall score, one section per round with its
// criteria, topics, strengths and weak topics, how to improve, and the question-by-question feedback.
// The content below is written for this page. It is labelled as a sample and its scores are illustrative.
const ROUNDS = [
  {
    key: 'technical',
    tab: 'Technical round',
    title: 'Technical round',
    blurb: 'Judged on technical knowledge: correctness, depth and problem solving for the role.',
    overall: 62,
    answered: 10,
    summary: 'You gave clear, well-structured answers on the basics. Depth dropped on the follow-ups about hashing and caching.',
    criteria: [['Technical knowledge', 66], ['Depth', 54], ['Problem solving', 64], ['Relevance', 71], ['Clarity', 68], ['Communication', 63], ['Confidence', 60], ['Grammar', 82]],
    topicsLabel: 'Topics',
    topics: [['APIs', 74], ['Databases', 71], ['Data structures', 58], ['System design', 55], ['Caching', 49]],
    strengths: ['Explained trade-offs clearly', 'Used concrete examples'],
    weak: ['Hash collisions', 'Cache invalidation'],
    improve: [
      'Practise explaining how you would handle collisions, then say what you would measure.',
      'Review cache invalidation and when each strategy fits.'
    ],
    q: {
      meta: 'Question 2, system design, follow-up',
      score: 52,
      question: 'You said a hash of the URL. What happens when two different URLs produce the same code?',
      answer: 'We could just try again with a different hash.',
      feedback: 'Right idea, but incomplete. You did not say how you would notice the collision or what you would store to retry safely.',
      missing: 'Collision detection; a unique constraint on the code',
      tip: 'Say how you notice a collision first (a unique index), then how you retry, then why that stays fast.'
    }
  },
  {
    key: 'resume',
    tab: 'Resume round',
    title: 'Resume round',
    blurb: 'Judged on how well you own and explain your experience and projects.',
    overall: 68,
    answered: 5,
    summary: 'You were clear about which parts you built yourself. Your answers rarely said what the work achieved.',
    criteria: [['Ownership', 72], ['Specificity', 61], ['Impact and results', 55], ['Relevance', 74], ['Clarity', 70], ['Communication', 66], ['Confidence', 64], ['Grammar', 84]],
    topicsLabel: 'Resume items',
    topics: [['Backend internship', 71], ['Payments project', 66], ['College portal', 62]],
    strengths: ['Clear about your own part', 'Honest about what was a team effort'],
    weak: ['No measurable results'],
    improve: [
      'Add one number to each project: volume, speed or error rate.',
      'Prepare a one-sentence answer to "what would you do differently?" for each item.'
    ],
    q: {
      meta: 'Question 3, payments project, follow-up',
      score: 58,
      question: 'You mentioned the retry logic. How did you make sure a payment was never charged twice?',
      answer: 'I added a check before retrying.',
      feedback: 'A good start, but you did not say what the check looked at or what happens if two requests arrive at once.',
      missing: 'Idempotency key; behaviour under concurrent requests',
      tip: 'Name the mechanism (for example a unique key per payment), then describe one failure it prevents.'
    }
  }
]

const tone = (v) => (v >= 70 ? 'text-teal-ink' : v >= 50 ? 'text-amber-ink' : 'text-coral-ink')
const overall = Math.round(ROUNDS.reduce((a, r) => a + r.overall, 0) / ROUNDS.length)

export default function ReportPreview() {
  const [i, setI] = useState(0)
  const r = ROUNDS[i]
  return (
    <div className="border-y border-l border-line-strong bg-panel text-sm">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 py-5 sm:px-8">
        <div>
          <p className="text-muted">Overall</p>
          <p className="font-display text-5xl font-bold leading-none tracking-tight">
            {overall}<span className="ml-1 text-lg font-medium text-muted">/100</span>
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-2">
          {[['Duration', '24m 10s'], ['Answered', '15'], ['Average response', '14s']].map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted">{k}</dt>
              <dd className="font-display text-lg font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div role="group" aria-label="Rounds in the sample report" className="flex gap-1 border-b border-line px-5 pt-3 sm:px-8">
        {ROUNDS.map((x, k) => (
          <button
            key={x.key}
            type="button"
            aria-pressed={k === i}
            onClick={() => setI(k)}
            className={`-mb-px border-b-2 px-3 py-2.5 font-semibold transition-colors ${k === i ? 'border-teal text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {x.tab} <span className={`font-mono text-xs ${tone(x.overall)}`}>{x.overall}</span>
          </button>
        ))}
      </div>

      <div className="space-y-7 px-5 py-6 sm:px-8">
        <div>
          <h3 className="font-display text-2xl font-semibold tracking-tight">{r.title}</h3>
          <p className="mt-1 text-muted">{r.blurb}</p>
          <p className="mt-3 text-ink">{r.summary}</p>
        </div>

        <div className="grid gap-8 xl:grid-cols-2">
          <div>
            {r.criteria.map(([label, v]) => (
              <div key={label} className="mb-3 last:mb-0">
                <div className="mb-1 flex justify-between">
                  <span className="text-muted">{label}</span>
                  <span className="font-mono text-ink">{v}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-panel2">
                  <div className="h-full rounded-full bg-teal" style={{ width: `${v}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-5">
            <div>
              <h4 className="mb-2 font-display font-semibold">{r.topicsLabel}</h4>
              <ul className="divide-y divide-line border-y border-line">
                {r.topics.map(([t, v]) => (
                  <li key={t} className="flex items-center justify-between gap-3 py-1.5">
                    <span>{t}</span>
                    <span className={`font-mono text-xs ${tone(v)}`}>{v}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              {r.strengths.map((s) => <span key={s} className="rounded-full border border-teal-ink/40 px-3 py-1 text-xs text-teal-ink">{s}</span>)}
              {r.weak.map((w) => <span key={w} className="rounded-full border border-coral-ink/40 px-3 py-1 text-xs text-coral-ink">{w}</span>)}
            </div>
          </div>
        </div>

        <div>
          <h4 className="mb-2 font-display font-semibold">How to improve this round</h4>
          <ul className="space-y-1.5 text-muted">
            {r.improve.map((x) => <li key={x} className="border-l-2 border-line-strong pl-3">{x}</li>)}
          </ul>
        </div>

        <div>
          <h4 className="mb-2 font-display font-semibold">Question by question (one shown)</h4>
          <div className="border border-line p-4">
            <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted">
              <span>{r.q.meta}</span>
              <span className={`font-mono ${tone(r.q.score)}`}>{r.q.score}/100</span>
            </div>
            <p className="text-ink">{r.q.question}</p>
            <p className="mt-2 border-l-2 border-line-strong pl-3 text-muted">{r.q.answer}</p>
            <p className="mt-2 text-ink">{r.q.feedback}</p>
            <p className="mt-2 text-coral-ink">Shaky or missing: {r.q.missing}</p>
            <p className="mt-2 text-muted">Tip: {r.q.tip}</p>
          </div>
        </div>
      </div>
      <p className="border-t border-line px-5 py-3 text-xs text-muted sm:px-8">
        Sample report written for this page. The scores show the layout, not typical results.
      </p>
    </div>
  )
}
