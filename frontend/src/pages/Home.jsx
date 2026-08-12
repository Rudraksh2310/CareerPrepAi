import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const compareNo = [
  'Same fixed questions for every candidate',
  'No reaction to what you actually said',
  'A generic score, if any feedback at all',
  'Forgets everything between questions'
]

const compareYes = [
  'Questions grounded in your resume and target role',
  'Follow-up questions generated from your last answer',
  'A report combining hard metrics and written feedback',
  'Remembers the full conversation as it goes'
]

const steps = [
  { n: '01', title: 'Upload your resume', body: 'PDF or DOCX. Tell us the role — and the company, if you\u2019re prepping for a specific one.' },
  { n: '02', title: 'Answer live questions', body: 'Type your answers as they come. Each one is grounded in your background, not a generic list.' },
  { n: '03', title: 'Get follow-up questions', body: 'Give a vague answer, get pushed on it — same as a real interviewer would.' },
  { n: '04', title: 'Read your report', body: 'Scores across technical depth, communication and confidence, plus specific things to fix.' }
]

const faqs = [
  { q: 'Is this free?', a: 'Yes, CareerPrepAi is free to use while it\u2019s in beta.' },
  { q: 'Do I need to prep anything?', a: 'Just a resume — PDF or DOCX. Everything else happens in the session.' },
  { q: 'Can I redo an interview?', a: 'Yes, start as many sessions as you want — each one gets its own report in your dashboard.' },
  { q: 'Is my resume stored?', a: 'It\u2019s stored against your account so past sessions stay linked to it — nothing is shared publicly.' }
]

export default function Home() {
  const { user } = useAuth()
  const primaryHref = user ? '/upload' : '/register'

  return (
    <div>
      {/* Hero */}
      <header className="px-6 py-16 md:py-20">
        <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-2 md:items-center">
          <div>
            <p className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-teal">
              <span className="h-px w-4 bg-teal" />
              Free while in beta
            </p>
            <h1 className="mb-4 font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
              Practice interviews that <span className="text-amber">talk back.</span>
            </h1>
            <p className="mb-6 max-w-md text-[17px] text-muted">
              Upload your resume, tell us the role, and CareerPrepAi runs a live mock interview
              that reacts to what you actually say — then hands you a report on exactly what to fix.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to={primaryHref}
                className="rounded-lg bg-amber px-6 py-3 font-semibold text-[#2A1600] transition hover:brightness-105"
              >
                Start your first interview
              </Link>
              <a
                href="#how"
                className="rounded-lg border border-line px-6 py-3 font-semibold text-ink transition hover:border-muted"
              >
                See how it works
              </a>
            </div>
          </div>

          {/* Call mockup */}
          <div className="rounded-2xl border border-line bg-panel p-4 shadow-[0_30px_60px_-24px_rgba(25,27,34,0.18)]">
            <div className="relative flex h-56 items-center justify-center overflow-hidden rounded-xl border border-line bg-gradient-to-br from-panel2 to-line/40">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-line bg-white font-display text-xl font-bold text-teal">
                AI
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-line bg-panel2 px-4 py-3 text-sm">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-amber">AI Interviewer</span>
              Why did you choose that approach over the alternatives?
            </div>
          </div>
        </div>
      </header>

      {/* Why */}
      <section className="border-t border-line px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 max-w-xl">
            <h2 className="mb-3 font-display text-2xl font-semibold tracking-tight md:text-[28px]">
              Question banks don't interview you
            </h2>
            <p className="text-muted">
              Most "mock interview" tools are just a quiz with a timer. CareerPrepAi is built to
              actually behave like an interviewer.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[#EAD3C7] bg-[#FBF1EC] p-6">
              <h3 className="mb-3 font-mono text-xs uppercase tracking-wide text-coral">Generic mock interview</h3>
              <ul className="space-y-2">
                {compareNo.map((item) => (
                  <li key={item} className="border-t border-black/5 pt-2 text-sm text-[#3D4148] first:border-0 first:pt-0">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-[#CFE3D3] bg-[#EFF6F1] p-6">
              <h3 className="mb-3 font-mono text-xs uppercase tracking-wide text-teal">CareerPrepAi</h3>
              <ul className="space-y-2">
                {compareYes.map((item) => (
                  <li key={item} className="border-t border-black/5 pt-2 text-sm text-[#3D4148] first:border-0 first:pt-0">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-line px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 max-w-xl">
            <h2 className="mb-3 font-display text-2xl font-semibold tracking-tight md:text-[28px]">
              How a session works
            </h2>
            <p className="text-muted">Four steps, roughly ten minutes, no setup beyond your resume.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <div key={s.n} className="rounded-xl border border-line bg-panel p-5">
                <span className="mb-2 block font-mono text-[11px] text-amber">{s.n}</span>
                <h4 className="mb-1.5 text-sm font-semibold">{s.title}</h4>
                <p className="text-[13px] text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Report preview */}
      <section className="border-t border-line px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 max-w-xl">
            <h2 className="mb-3 font-display text-2xl font-semibold tracking-tight md:text-[28px]">
              A report you can actually act on
            </h2>
            <p className="text-muted">
              Not just a number — a breakdown of what worked, what to practice, and what to look up
              before the real thing.
            </p>
          </div>
          <div className="grid gap-9 md:grid-cols-2 md:items-start">
            <div className="rounded-2xl border border-line bg-panel p-6">
              {[['Technical knowledge', 82], ['Communication', 75], ['Confidence', 80]].map(([label, val]) => (
                <div key={label} className="mb-4 last:mb-0">
                  <div className="mb-1.5 flex justify-between text-xs text-muted">
                    <span>{label}</span>
                    <span className="font-mono text-ink">{val}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-panel2">
                    <div className="h-full rounded-full bg-gradient-to-r from-teal to-amber" style={{ width: `${val}%` }} />
                  </div>
                </div>
              ))}
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-[#CFE3D3] bg-[#EFF6F1] px-3 py-1 text-xs text-teal">Strong Python knowledge</span>
                <span className="rounded-full border border-[#CFE3D3] bg-[#EFF6F1] px-3 py-1 text-xs text-teal">Clear structure</span>
                <span className="rounded-full border border-[#EAD3C7] bg-[#FBF1EC] px-3 py-1 text-xs text-coral">SQL indexing</span>
              </div>
            </div>
            <div>
              <h3 className="mb-2.5 font-display text-xl font-semibold">Two sources, merged into one report</h3>
              <p className="mb-2.5 text-sm text-muted">
                Duration, response time and questions answered come straight from the session — no
                room for anything to be made up.
              </p>
              <p className="text-sm text-muted">
                Strengths, weak topics and what to study next come from a full read of your
                transcript against an interview rubric.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-line px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10">
            <h2 className="font-display text-2xl font-semibold tracking-tight md:text-[28px]">Before you start</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {faqs.map((f) => (
              <div key={f.q} className="rounded-xl border border-line bg-panel px-5 py-4">
                <h4 className="mb-1.5 text-sm font-semibold">{f.q}</h4>
                <p className="text-[13.5px] text-muted">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-line px-6 py-20 text-center">
        <h2 className="mb-3 font-display text-3xl font-semibold">Ready to hear the next question?</h2>
        <p className="mb-6 text-muted">Ten minutes, one resume, and a report you'll actually use.</p>
        <Link to={primaryHref} className="rounded-lg bg-amber px-6 py-3 font-semibold text-[#2A1600] transition hover:brightness-105">
          Get started free
        </Link>
      </section>

      <footer className="flex flex-wrap justify-between gap-4 border-t border-line px-6 py-10 text-sm text-muted">
        <div>CareerPrepAi</div>
        <div>Built by Rudraksh Dhasmana &amp; Shashwat Bhardwaj &middot; Christ (Deemed to be University)</div>
      </footer>
    </div>
  )
}
