import { useEffect, useRef } from 'react'
import SelfView from './SelfView'
import { CamIcon, CamOffIcon, MicIcon, MicOffIcon } from './icons'

function Row({ ok, label, value, testId }) {
  return (
    <li className="flex items-start gap-3 py-2.5 text-sm" data-testid={testId}>
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ok === true ? 'bg-teal' : ok === false ? 'bg-coral' : 'bg-amber'}`} />
      <span className="flex-1">
        <span className="block text-ink">{label}</span>
        <span className="block text-xs text-muted">{value}</span>
      </span>
    </li>
  )
}

// "Green room": request permissions, preview camera, check the mic, then Join (the click is also the user
// gesture browsers require before audio can play).
export default function Lobby({
  session, persona, user, stream, camOn, micOn, mediaState, getLevel, stt, tts, onMic, onCam, onJoin, joining, error,
  devices = [], deviceId = '', onDevice, deviceError = '', micNote = null,
}) {
  const name = persona?.name || 'Aria'
  const meterRef = useRef(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (meterRef.current) meterRef.current.style.width = `${Math.round((micOn ? getLevel() : 0) * 100)}%`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [getLevel, micOn])

  const micOk = mediaState.mic === 'ok' ? true : mediaState.mic === 'pending' ? null : false

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-6 py-10 md:grid-cols-[1.25fr_1fr]" data-testid="lobby">
      <div>
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#12151B]">
          <SelfView stream={stream} camOn={camOn} micOn={micOn} name={user?.name} getLevel={getLevel} className="relative h-full w-full !rounded-2xl" />
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-3">
            <button onClick={onMic} disabled={mediaState.mic !== 'ok'} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'} className={`flex h-11 w-11 items-center justify-center rounded-full text-white ${micOn ? 'bg-white/20' : 'bg-coral'} disabled:opacity-40`}>
              {micOn ? <MicIcon /> : <MicOffIcon />}
            </button>
            <button onClick={onCam} disabled={mediaState.cam !== 'ok'} aria-label={camOn ? 'Turn camera off' : 'Turn camera on'} className={`flex h-11 w-11 items-center justify-center rounded-full text-white ${camOn ? 'bg-white/20' : 'bg-coral'} disabled:opacity-40`}>
              {camOn ? <CamIcon /> : <CamOffIcon />}
            </button>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-panel2" aria-hidden="true">
          <div ref={meterRef} className="h-full rounded-full bg-teal transition-[width] duration-75" style={{ width: '0%' }} />
        </div>
        <p className="mt-1.5 text-xs text-muted">Say something - the bar should move.</p>

        {mediaState.mic === 'ok' && (
          <div className="mt-4">
            <label htmlFor="mic-select" className="mb-1.5 block text-sm font-medium text-ink">Microphone</label>
            <select
              id="mic-select"
              value={deviceId}
              onChange={(e) => onDevice?.(e.target.value)}
              data-testid="mic-select"
              className="block h-11 w-full rounded-md border border-line-strong bg-panel px-3 text-sm text-ink focus:border-teal-ink focus:outline-none focus:ring-2 focus:ring-teal-ink/25"
            >
              <option value="">System default microphone</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-muted">Using a headset? Pick its microphone here, or choose the system default.</p>
            {deviceError && <p role="alert" className="mt-1.5 text-xs text-coral-ink">{deviceError}</p>}
            {micNote && <p className="mt-1.5 text-xs text-amber-ink" data-testid="mic-note">{micNote}</p>}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-wide text-teal-ink">Ready to join?</p>
        <h1 className="mb-1 font-display text-2xl font-semibold">Interview with {name}</h1>
        <p className="mb-5 text-sm text-muted">
          {session?.role}{session?.company ? ` · ${session.company}` : ''}
        </p>
        <ol className="mb-5 space-y-1.5 text-sm" data-testid="round-plan">
          {(session?.rounds || []).map((r, i) => (
            <li key={r.key} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal/15 font-mono text-[11px] text-teal-ink">{i + 1}</span>
              <span>
                <span className="text-ink">{r.key === 'technical' ? 'Technical round' : 'Resume round'}</span>
                <span className="text-muted"> · up to {r.max_questions} questions · {r.key === 'technical' ? r.topics.slice(0, 5).join(', ') : 'the experience and projects on your resume'}</span>
              </span>
            </li>
          ))}
        </ol>

        <ul className="divide-y divide-line rounded-card border border-line bg-panel px-4">
          <Row testId="chk-mic" ok={micOk} label="Microphone" value={mediaState.mic === 'ok' ? 'Working' : mediaState.mic === 'pending' ? 'Waiting for permission…' : mediaState.micMessage} />
          <Row testId="chk-cam" ok={mediaState.cam === 'ok' ? true : mediaState.cam === 'pending' ? null : false} label="Camera (optional)" value={mediaState.cam === 'ok' ? 'Working' : mediaState.cam === 'pending' ? 'Waiting for permission…' : 'Off - that is fine, the interviewer does not need to see you'} />
          <Row testId="chk-stt" ok={stt.ok} label="Understanding your voice" value={stt.text} />
          <Row testId="chk-tts" ok={tts.ok} label={`${name}'s voice`} value={tts.text} />
          {session?.ai_engine && (
            <Row
              testId="chk-ai"
              ok={session.ai_engine.configured ? true : null}
              label={`${name}'s questions`}
              value={session.ai_engine.configured ? `AI follow-ups (${session.ai_engine.provider}).` : `${session.ai_engine.note} Add the key to enable AI follow-ups.`}
            />
          )}
        </ul>

        {error && <p className="mt-3 text-sm text-coral-ink">{error}</p>}

        <button
          onClick={onJoin}
          disabled={joining}
          data-testid="btn-join"
          className="mt-5 w-full rounded-lg bg-amber py-3 font-semibold text-[#2A1600] transition hover:brightness-105 disabled:opacity-60"
        >
          {joining ? 'Joining…' : 'Join interview'}
        </button>
        <p className="mt-3 text-xs text-muted">
          Tip: use headphones so the microphone does not pick up {name}&apos;s voice. When you finish speaking, pause for
          a couple of seconds, or press &quot;I&apos;m done answering&quot;.
        </p>
      </div>
    </div>
  )
}
