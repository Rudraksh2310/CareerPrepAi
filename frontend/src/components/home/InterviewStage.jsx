import { useEffect, useState } from 'react'
import { reducedMotion } from '../../lib/motion'

// The hero: a sample interview exchange that plays out in large type. A question is asked, an answer is typed, one
// phrase in it is highlighted, and the follow-up quotes that phrase. This is what the product does that a question
// list does not. The three samples are written for this page and labelled as samples.
const EXCHANGES = [
  {
    tab: 'Technical round',
    role: 'Backend engineer',
    q: 'Walk me through how you would design a URL shortener.',
    a: 'I would make a short code from a hash of the URL, store the mapping in a database, and redirect when someone opens it.',
    mark: 'a hash of the URL',
    f: 'You said a hash of the URL. What happens when two different URLs produce the same code?'
  },
  {
    tab: 'Resume round',
    role: 'From a resume',
    q: 'Your resume lists a payments project. What did you build yourself?',
    a: 'I wrote the retry logic and the webhook handler. My teammate built the dashboard.',
    mark: 'the retry logic',
    f: 'You mentioned the retry logic. How did you make sure a payment was never charged twice?'
  },
  {
    tab: 'Data analyst',
    role: 'Data analyst',
    q: 'Daily signups dropped sharply this week. How would you check if the drop is real?',
    a: 'I would compare it with the same weekday last month, then check whether it is only one traffic source.',
    mark: 'only one traffic source',
    f: 'You said only one traffic source. How would you find which one, and what would you check next?'
  }
]

const split = (text, phrase) => {
  const i = text.indexOf(phrase)
  if (i < 0) return [text, '', '']
  return [text.slice(0, i), text.slice(i, i + phrase.length), text.slice(i + phrase.length)]
}

function useExchange(ex, run) {
  const full = { q: ex.q, a: ex.a, f: ex.f, mark: true, step: 'done' }
  const [s, setS] = useState(full)
  useEffect(() => {
    if (reducedMotion()) {
      setS(full)
      return undefined
    }
    let dead = false
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const type = async (key, text, speed, step) => {
      setS((p) => ({ ...p, step }))
      for (let i = 1; i <= text.length; i += 1) {
        if (dead) return
        setS((p) => ({ ...p, [key]: text.slice(0, i) }))
        await wait(speed)
      }
    }
    ;(async () => {
      setS({ q: '', a: '', f: '', mark: false, step: 'wait' })
      await wait(1100) // let the stage wipe in first
      await type('q', ex.q, 26, 'q')
      if (dead) return
      await wait(450)
      await type('a', ex.a, 17, 'a')
      if (dead) return
      await wait(250)
      setS((p) => ({ ...p, mark: true, step: 'mark' }))
      await wait(900)
      if (dead) return
      await type('f', ex.f, 22, 'f')
      if (!dead) setS((p) => ({ ...p, step: 'done' }))
    })()
    return () => {
      dead = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex, run])
  return s
}

function Marked({ text, phrase, on }) {
  const [a, b, c] = split(text, phrase)
  return (
    <>
      {a}
      {b && <span className={`mark ${on ? 'on' : ''}`}>{b}</span>}
      {c}
    </>
  )
}

export default function InterviewStage({ interviewer = 'Aria' }) {
  const [idx, setIdx] = useState(0)
  const [run, setRun] = useState(0)
  const ex = EXCHANGES[idx]
  const s = useExchange(ex, run)
  const typing = (k) => s.step === k

  return (
    <div className="stage stage-in flex h-full flex-col justify-between gap-10 px-5 py-8 sm:px-10 lg:px-14 lg:py-12 xl:px-20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="flex items-center gap-2.5 text-sm font-semibold text-white/85">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-amber text-[13px] font-bold text-[#0e1118]" aria-hidden="true">{interviewer[0]}</span>
          {interviewer} is interviewing
        </p>
        <div role="group" aria-label="Sample exchanges" className="flex flex-wrap gap-1.5">
          {EXCHANGES.map((e, i) => (
            <button
              key={e.tab}
              type="button"
              aria-pressed={i === idx}
              onClick={() => { setIdx(i); setRun((n) => n + 1) }}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${i === idx ? 'bg-white text-[#0e1118]' : 'text-white/80 ring-1 ring-inset ring-white/30 hover:text-white hover:ring-white/60'}`}
            >
              {e.tab}
            </button>
          ))}
        </div>
      </div>

      {/* the animated version is for sighted users; screen readers get the whole exchange at once */}
      <div className="sr-only">
        <p>Sample exchange, {ex.role}.</p>
        <p>Interviewer: {ex.q}</p>
        <p>Candidate: {ex.a}</p>
        <p>Interviewer, following up: {ex.f}</p>
      </div>

      <div aria-hidden="true" className="space-y-8 lg:space-y-12">
        <p className={`display min-h-[2.2em] max-w-[26ch] text-[clamp(1.9rem,3.7vw,4.4rem)] !font-semibold !leading-[1.06] ${typing('q') ? 'typing' : ''}`}>{s.q}</p>

        <div className={`lg:ml-[22%] ${typing('a') ? 'listening' : ''}`}>
          <p className="mb-2 flex items-center gap-3 text-sm font-semibold text-white/70">
            You
            <span className="listen-bars text-amber">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</span>
          </p>
          <p className={`max-w-[44ch] min-h-[4.6em] text-[clamp(1.05rem,1.55vw,1.65rem)] leading-snug text-white/90 ${typing('a') ? 'typing' : ''}`}>
            <Marked text={s.a} phrase={ex.mark} on={s.mark} />
          </p>
        </div>

        <div className="lg:ml-[8%]">
          <p className="mb-2 text-sm font-semibold text-[#a9b3ff]">{interviewer}, following up</p>
          <p className={`display min-h-[3.2em] max-w-[30ch] text-[clamp(1.4rem,2.5vw,3rem)] !font-semibold !leading-[1.1] text-[#c4cbff] ${typing('f') ? 'typing' : ''}`}>
            <Marked text={s.f} phrase={ex.mark} on />
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-white/70">
        <p className="max-w-[52ch]">Sample exchange. In a real session your interviewer speaks the question and writes it as live captions.</p>
        <button type="button" onClick={() => setRun((n) => n + 1)} className="rounded-full px-3.5 py-1.5 font-semibold text-white ring-1 ring-inset ring-white/40 hover:ring-white">
          Replay
        </button>
      </div>
    </div>
  )
}
