import { useEffect, useRef, useState } from 'react'

const Score = ({ label, value }) => (
  <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/80">
    {label} <b className={value >= 4 ? 'text-[#34C3AF]' : value <= 2 ? 'text-coral' : 'text-amber'}>{value}/5</b>
  </span>
)

function Dots({ name }) {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label={`${name} is typing`} data-testid="typing-dots">
      {[0, 1, 2].map((i) => (
        <i key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60" style={{ animationDelay: `${i * 140}ms` }} />
      ))}
    </span>
  )
}

// Reveals `text` in step with Aria's voice. `progress` (0..1) comes from the audio playback position (or the
// browser speech boundaries); the displayed fraction chases it smoothly so the text appears to be typed
// while she speaks rather than jumping in chunks. Before her audio starts, only the typing dots show.
function TypedText({ text, progress, started }) {
  const [chars, setChars] = useState(0)
  const frac = useRef(0)
  const target = useRef(0)
  target.current = started ? Math.min(1, progress * 1.04 + 0.01) : 0
  const endRef = useRef(null)

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (frac.current < target.current) {
        // ease toward the speech position, never faster than a fast typist
        const step = Math.max((target.current - frac.current) * 8 * dt, 0)
        frac.current = Math.min(target.current, frac.current + Math.min(step, 90 * dt / Math.max(text.length, 1)) + 0.0004)
      }
      const n = Math.floor(frac.current * text.length)
      setChars((c) => (c === n ? c : n))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [chars])

  if (!started || chars === 0) return <Dots />
  return (
    <span data-testid="typed-text">
      {text.slice(0, chars)}
      <i className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-[#34C3AF]" />
      <span ref={endRef} />
    </span>
  )
}

// Chat-style transcript. The interviewer's lines are typed out live while they are spoken. Round dividers separate the
// technical round from the resume round. Under each answer: the analysis the interviewer made of it.
export default function TranscriptPanel({ turns, rounds = [], live = { active: false, started: false, progress: 0 }, thinking = false, name = 'Aria' }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' })
  }, [turns.length, thinking])

  const lastAi = (() => {
    for (let i = turns.length - 1; i >= 0; i--) if (turns[i].role === 'ai') return i
    return -1
  })()
  const roundName = (key) => {
    const idx = rounds.findIndex((r) => r.key === key)
    return idx >= 0 ? `Round ${idx + 1} · ${rounds[idx].name}` : null
  }
  let prevRound = null

  return (
    <div ref={ref} className="call-scroll h-full space-y-4 overflow-y-auto p-4" data-testid="transcript">
      {turns.length === 0 && <p className="text-sm text-white/50">The conversation will appear here.</p>}
      {turns.map((t, i) => {
        if (t.role === 'ai') {
          const divider = t.round && t.round !== prevRound ? roundName(t.round) : null
          if (t.round) prevRound = t.round
          const typing = live.active && i === lastAi
          return (
            <div key={i}>
              {divider && (
                <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[#34C3AF]" data-testid="round-divider">
                  <span className="h-px flex-1 bg-[#34C3AF]/30" />
                  {divider}
                  <span className="h-px flex-1 bg-[#34C3AF]/30" />
                </div>
              )}
              <div className="max-w-[92%]">
                <div className="mb-1 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-white/50">
                  {name}
                  {t.topic && <span className="rounded bg-white/10 px-1.5 py-0.5 normal-case tracking-normal text-white/70">{t.topic}</span>}
                  {t.is_followup && <span className="rounded bg-amber/20 px-1.5 py-0.5 text-amber">follow-up</span>}
                </div>
                <div className="rounded-xl rounded-tl-sm bg-white/10 px-3.5 py-2.5 text-sm leading-relaxed text-white" data-testid="ai-bubble">
                  {typing ? <TypedText key={t.text} text={t.text} progress={live.progress} started={live.started} /> : t.text}
                </div>
                {t.sources?.length > 0 && !typing && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {t.sources.map((s) => (
                      <span key={s.id} title={s.looks_for} className="rounded-full border border-[#34C3AF]/40 px-2 py-0.5 text-[10px] text-[#34C3AF]">
                        Grounded in {s.company === '_generic' ? 'general' : s.company} · {s.topic}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        }
        return (
          <div key={i} className="ml-auto max-w-[92%]">
            <div className="mb-1 text-right font-mono text-[10px] uppercase tracking-wide text-white/50">
              You {t.mode === 'voice' ? '· voice' : t.mode === 'text' ? '· typed' : ''}
            </div>
            <div className="rounded-xl rounded-tr-sm bg-[#0E8E7E]/35 px-3.5 py-2.5 text-sm text-white">{t.text || <i className="text-white/50">(no answer)</i>}</div>
            {t.analysis && (
              <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
                {t.analysis.accuracy != null && <Score label="Accuracy" value={t.analysis.accuracy} />}
                {t.analysis.ownership != null && <Score label="Ownership" value={t.analysis.ownership} />}
                <Score label="Relevance" value={t.analysis.relevance} />
                <Score label="Clarity" value={t.analysis.clarity} />
                <Score label="Depth" value={t.analysis.depth} />
                {t.analysis.mistakes?.[0] && <span className="w-full text-right text-[11px] text-white/50">Shaky: {t.analysis.mistakes.slice(0, 2).join('; ')}</span>}
                {!t.analysis.mistakes?.[0] && t.analysis.gaps?.[0] && <span className="w-full text-right text-[11px] text-white/50">Missing: {t.analysis.gaps.slice(0, 2).join('; ')}</span>}
              </div>
            )}
          </div>
        )
      })}
      {thinking && (
        <div className="max-w-[92%]" data-testid="thinking-bubble">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-white/50">{name}</div>
          <div className="inline-block rounded-xl rounded-tl-sm bg-white/10 px-3.5 py-2"><Dots name={name} /></div>
        </div>
      )}
    </div>
  )
}
