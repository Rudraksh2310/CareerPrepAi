import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui'
import Avatar from '../components/Avatar'
import FloatingTerms from '../components/FloatingTerms'
import InterviewStage from '../components/home/InterviewStage'
import ReportPreview from '../components/home/ReportPreview'
import { FAQS } from '../content/faqs'
import { TERMS } from '../content/glossary'
import { usePageMeta } from '../lib/seo'
import { reducedMotion } from '../lib/motion'
import { PERSONAS, loadInterviewerChoice, saveInterviewerChoice } from '../lib/personas'

// Every claim on this page maps to something the app actually does (see backend/app/core/interview_plan.py,
// frontend/src/pages/Report.jsx and backend/app/data/company_faqs.json). No invented numbers or testimonials.

const steps = [
  { title: 'Set up', body: 'Upload a PDF or DOCX resume, enter the role you want and optionally a company, then choose one of five interviewers.' },
  { title: 'Join the call room', body: 'Pick your microphone and check your camera in the lobby, then join the call.' },
  { title: 'Answer the interviewer', body: 'Speak or type. Each question appears as live text while it is said, and the next one depends on your answer.' },
  { title: 'Read your report', body: 'One section per round, with scores, weak topics and feedback on every answer.' }
]

const reportParts = [
  ['Scores per round', 'Technical: knowledge, depth, problem solving. Resume: ownership, specificity, impact. Both: relevance, clarity, communication, confidence, grammar.'],
  ['Topics and resume items', 'Each topic you were asked about, and each job or project, with its own score.'],
  ['Strengths and weak topics', 'What held up, and what to study before the real interview.'],
  ['Question by question', 'Your answer, feedback on it, anything shaky or missing, and a tip for a better answer.'],
  ['Session facts', 'Duration, questions answered and average response time, measured from the session itself.']
]

// The four steps sit on one line that fills as the section scrolls into view.
function useScrollFill(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    if (reducedMotion()) {
      el.style.setProperty('--fill', '1')
      return undefined
    }
    let raf = 0
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const p = (window.innerHeight * 0.85 - r.top) / (window.innerHeight * 0.45)
      el.style.setProperty('--fill', String(Math.max(0.04, Math.min(1, p))))
    }
    const on = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      cancelAnimationFrame(raf)
    }
  }, [ref])
}

export default function Home() {
  const { user } = useAuth()
  const { hash, key } = useLocation()
  const primaryHref = user ? '/upload' : '/register'
  usePageMeta({ path: '/' })
  const timeline = useRef(null)
  useScrollFill(timeline)

  // in-page links from other routes (e.g. /#faq) arrive here with a hash; the router does not scroll for us
  useEffect(() => {
    if (!hash) return
    document.getElementById(hash.slice(1))?.scrollIntoView()
  }, [hash, key])

  const [who, setWho] = useState(loadInterviewerChoice)
  const persona = PERSONAS.find((p) => p.id === who) || PERSONAS[0]
  const choose = (id) => {
    setWho(id)
    saveInterviewerChoice(id)
  }

  return (
    <div className="home-field">
      {/* Hero: the exchange runs to the right edge of the screen */}
      <section className="edge-l grid min-h-[calc(100vh-4rem)] min-h-[calc(100svh-4rem)] lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
        <div className="flex flex-col justify-center py-12 pr-4 sm:pr-6 lg:py-16 lg:pr-14">
          <h1 className="h1 max-w-[12ch] lg:text-[clamp(3.4rem,5.4vw,6.6rem)]">Mock interviews that talk back.</h1>
          <p className="lead mt-7 max-w-[34ch] sm:text-xl">
            An AI interviewer asks each question out loud, listens, and follows up on what you actually said. A technical round on your role, then a resume round, and a report for each.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button to={primaryHref} size="lg">{user ? 'Start an interview' : 'Start your first interview'}</Button>
            <Button href="#how" variant="secondary" size="lg">See how it works</Button>
          </div>
          <p className="mt-4 text-sm text-muted">Answer by voice or by typing. Your resume is optional. Free during beta.</p>
        </div>
        <div className="min-w-0 lg:min-h-full">
          <InterviewStage interviewer={persona.name} />
        </div>
      </section>

      {/* Rounds: two statements, stepped across the page like the interview itself */}
      <section id="rounds" className="page py-24 lg:py-40">
        <div className="grid gap-y-20 lg:grid-cols-12">
          <div className="lg:col-span-9">
            <p className="eyebrow">Round 1, technical</p>
            <h2 className="display mt-3 text-[clamp(2.6rem,7.2vw,8.5rem)]">Ten questions about the role you want.</h2>
            <div className="mt-8 grid max-w-3xl gap-6 sm:grid-cols-[1fr_16rem]">
              <p className="text-muted">
                By default, ten questions across five topics. Each answer is checked for correctness and depth, and your interviewer follows up where it was thin or wrong.
              </p>
              <p className="border-l-2 border-teal pl-4 text-sm font-semibold text-ink">Scored on knowledge, depth and problem solving.</p>
            </div>
          </div>
          <div className="lg:col-span-9 lg:col-start-4">
            <p className="eyebrow">Round 2, resume</p>
            <h2 className="display mt-3 text-[clamp(2.6rem,7.2vw,8.5rem)]">Five more about the work you list.</h2>
            <div className="mt-8 grid max-w-3xl gap-6 sm:grid-cols-[1fr_16rem]">
              <p className="text-muted">
                Your interviewer goes through your resume: five questions, starting with your experience and projects, with follow-ups on what you built yourself and what it achieved. No resume? They ask about your background instead.
              </p>
              <p className="border-l-2 border-teal pl-4 text-sm font-semibold text-ink">Scored on ownership, specificity and impact.</p>
            </div>
          </div>
        </div>
        <p className="mt-14 max-w-prose text-muted">Each round is judged on what matters for it, so the report shows where you were weak instead of one blended number. You can skip ahead to Round 2 at any time.</p>
      </section>

      {/* How it works: one line across the full width */}
      <section id="how" className="page pb-24 lg:pb-40">
        <h2 className="h2 lg:text-6xl">From resume to report in four steps.</h2>
        <div ref={timeline} className="relative mt-14 lg:mt-20" style={{ '--fill': 1 }}>
          <div className="absolute bottom-3 left-[1.05rem] top-3 w-0.5 bg-line-strong lg:bottom-auto lg:left-0 lg:right-0 lg:top-[1.05rem] lg:h-0.5 lg:w-auto" aria-hidden="true">
            <div className="timeline-fill h-full w-full bg-teal" />
          </div>
          <ol className="relative grid gap-12 lg:grid-cols-4 lg:gap-10">
            {steps.map((s, i) => (
              <li key={s.title} className="relative pl-14 lg:pl-0 lg:pt-16">
                <span className="absolute left-0 top-0 grid h-[2.15rem] w-[2.15rem] place-items-center rounded-full bg-teal font-display text-sm font-bold text-white" aria-hidden="true">{i + 1}</span>
                <h3 className="h3 text-2xl"><span className="sr-only">Step {i + 1}: </span>{s.title}</h3>
                <p className="mt-2 max-w-[34ch] text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Interviewers: full-width panels, the chosen one widens */}
      <section id="interviewers" className="pb-24 lg:pb-40">
        <div className="page grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-end">
          <h2 className="h2 lg:text-6xl">Pick who interviews you.</h2>
          <p className="lead">Five characters, each with their own voice. The questions and the scoring are the same for all of them, so choose whoever you will feel most at ease with.</p>
        </div>
        <div role="group" aria-label="Choose an interviewer" className="mt-10 flex flex-col gap-1 md:h-[34rem] md:flex-row">
          {PERSONAS.map((p) => {
            const on = p.id === who
            const [c1] = p.look.blazer
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => choose(p.id)}
                className={`pane group relative h-28 overflow-hidden text-left text-white md:h-auto md:basis-0 ${on ? 'md:grow-[3.2]' : 'md:grow'}`}
                style={{ background: `linear-gradient(165deg, ${c1}, #0e1118 85%)` }}
              >
                <span className="absolute inset-y-0 left-0 w-28 md:inset-x-0 md:bottom-0 md:left-0 md:top-6 md:w-auto" aria-hidden="true">
                  <Avatar key={on ? `${p.id}-on` : p.id} persona={p} animate={on} viewBox="95 70 290 300" className="mx-auto h-full w-full object-bottom md:h-full" />
                </span>
                <span className="absolute inset-y-0 left-32 right-3 flex flex-col justify-center md:inset-x-0 md:bottom-0 md:left-0 md:top-auto md:block md:bg-gradient-to-t md:from-black/70 md:to-transparent md:p-5 md:pt-16">
                  <span className="block font-display text-2xl font-bold tracking-tight md:text-3xl">{p.name}</span>
                  <span className={`block text-sm text-white/85 ${on ? '' : 'md:hidden lg:block'}`}>{p.tagline}</span>
                  {on && <span className="mt-1 inline-block text-sm font-semibold text-amber">Your interviewer</span>}
                </span>
              </button>
            )
          })}
        </div>
        <div className="page mt-6">
          <Button to={primaryHref}>Interview with {persona.name}</Button>
        </div>
      </section>

      {/* Report */}
      <section id="report" className="edge-l pb-24 lg:pb-40">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:gap-16">
          <div className="pr-4 sm:pr-6 lg:pr-0">
            <h2 className="h2 lg:text-6xl">One report, a section for each round.</h2>
            <p className="lead mt-5 max-w-[40ch]">Not just a number: what you got right, what to practise, and what to look up before the real thing.</p>
            <dl className="mt-10 divide-y divide-line-strong border-y border-line-strong">
              {reportParts.map(([term, def]) => (
                <div key={term} className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
                  <dt className="font-display text-lg font-semibold tracking-tight">{term}</dt>
                  <dd className="text-muted">{def}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="min-w-0 pl-4 sm:pl-0">
            <ReportPreview />
          </div>
        </div>
      </section>

      {/* Words */}
      <section id="glossary" className="page pb-24 lg:pb-40">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-end">
          <h2 className="h2 lg:text-6xl">Words you will hear in an interview.</h2>
          <p className="lead">The same words drift behind this page. Hover one to stop it, click it for a short explanation and a tip.</p>
        </div>
        <dl className="mt-12 grid gap-x-12 gap-y-9 sm:grid-cols-2 xl:grid-cols-3">
          {TERMS.map((t) => (
            <div key={t.term} className="border-t border-line-strong pt-4">
              <dt className="font-display text-xl font-semibold tracking-tight">{t.term}</dt>
              <dd className="mt-1 text-muted">{t.meaning}</dd>
              <dd className="mt-2 text-sm text-ink"><span className="font-semibold">Tip: </span>{t.tip}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* FAQ */}
      <section id="faq" className="page pb-24 lg:pb-40">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
          <h2 className="h2 lg:sticky lg:top-28 lg:self-start lg:text-6xl">Before you start.</h2>
          <div className="divide-y divide-line-strong border-y border-line-strong">
            {FAQS.map((f) => (
              <details key={f.q} className="group py-1">
                <summary className="flex min-h-[3.5rem] cursor-pointer list-none items-center justify-between gap-4 py-3 font-display text-xl font-semibold tracking-tight text-ink marker:hidden [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <svg className="h-5 w-5 shrink-0 text-muted transition-transform duration-300 group-open:rotate-45" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </summary>
                <p className="max-w-[60ch] pb-4 pr-8 text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="page pb-24 lg:pb-36">
        <h2 className="display max-w-[14ch] text-[clamp(2.8rem,8vw,9.5rem)]">Ready for the first question?</h2>
        <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
          <Button to={primaryHref} size="lg">{user ? 'Start an interview' : 'Get started free'}</Button>
          <p className="max-w-[36ch] text-muted">Set up takes a minute. Then your interviewer starts the call.</p>
        </div>
        <p className="mt-8 text-sm text-muted">
          Questions about your data? Read the <Link to="/privacy" className="font-semibold text-teal-ink underline">privacy policy</Link>.
        </p>
      </section>

      <FloatingTerms />
    </div>
  )
}
