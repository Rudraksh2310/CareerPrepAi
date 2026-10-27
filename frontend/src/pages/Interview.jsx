import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { interviewApi, voiceApi } from '../api/endpoints'
import { useAuth } from '../context/AuthContext'
import useCallMedia from '../hooks/useCallMedia'
import { browserSttSupported, createListener, serverRecordingSupported } from '../lib/stt'
import { createVoice } from '../lib/tts'
import { getPersona } from '../lib/personas'
import Captions from '../components/call/Captions'
import ControlBar from '../components/call/ControlBar'
import InterviewerTile from '../components/call/InterviewerTile'
import Lobby from '../components/call/Lobby'
import SelfView from '../components/call/SelfView'
import TranscriptPanel from '../components/call/TranscriptPanel'
import { SendIcon } from '../components/call/icons'
import { errorMessage } from '../lib/errors'

// The live interview, as a video call with the interviewer the candidate chose (Aria by default).
//
//   lobby -> [asking -> listening -> thinking]* -> closing -> ending -> /report
//   Two rounds: 1 technical, 2 resume. Aria announces the switch; the header and transcript show the round.
//
//   asking    Aria speaks the question (TTS); her mouth follows the audio.
//   listening the microphone is open; speech is transcribed live; ~2.3s of silence (or "I'm done") ends the turn.
//   thinking  the answer is sent to the backend: analysed, RAG-grounded follow-up chosen, next question written.
//   retry     the network call failed; the answer is kept and can be re-sent.

const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function Interview() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const media = useCallMedia()

  const [phase, setPhase] = useState('loading') // loading | lobby | asking | listening | thinking | retry | closing | ending
  const [loadError, setLoadError] = useState(null)
  const [session, setSession] = useState(null)
  const [voiceCfg, setVoiceCfg] = useState(null)
  const [joining, setJoining] = useState(false)
  const [audioStarted, setAudioStarted] = useState(false)
  const [turns, setTurns] = useState([])
  const [caption, setCaption] = useState({ text: '', progress: 0 })
  const [interim, setInterim] = useState('')
  const [hint, setHint] = useState('')
  const [error, setError] = useState(null)
  const [captionsOn, setCaptionsOn] = useState(true)
  const [transcriptOn, setTranscriptOn] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024)
  const [typeMode, setTypeMode] = useState(false)
  const [typed, setTyped] = useState('')
  const [qNum, setQNum] = useState(0)
  const [roundKey, setRoundKey] = useState('technical')
  const [roundQ, setRoundQ] = useState(0)
  const [banner, setBanner] = useState(null)
  const [engine, setEngine] = useState({ engine: null, note: null })
  const [elapsed, setElapsed] = useState(0)

  const levelRef = useRef({ open: 0, wide: 0 })
  const voiceRef = useRef(null)
  const listenerRef = useRef(null)
  const audioCtxRef = useRef(null)
  const answerStartRef = useRef(0)
  const joinedAtRef = useRef(0)
  const aliveRef = useRef(true) // component mounted
  const endingRef = useRef(false) // the interview is being ended: stop the turn loop
  const emptyRef = useRef(0)
  const forceServerRef = useRef(false)
  const typeModeRef = useRef(false)
  const micOnRef = useRef(true)
  const lastAnswerRef = useRef(null)
  const roundKeyRef = useRef('technical')
  const bannerTimer = useRef(null)
  const retryRef = useRef(null)
  const api = useRef({}) // always-latest handlers, so long-lived callbacks never see stale state

  micOnRef.current = media.micOn
  roundKeyRef.current = roundKey
  typeModeRef.current = typeMode

  // ------------------------------------------------------------------ load session + server voice capabilities
  useEffect(() => {
    let cancelled = false
    aliveRef.current = true
    Promise.all([interviewApi.get(sessionId), voiceApi.config().then((r) => r.data).catch(() => null)])
      .then(([{ data }, cfg]) => {
        if (cancelled) return
        if (data.status !== 'active') {
          navigate(`/report/${sessionId}`, { replace: true })
          return
        }
        setSession(data)
        setVoiceCfg(cfg)
        setTurns(data.turns || [])
        setQNum(data.question_number || 0)
        const rk = data.current_round || 'technical'
        setRoundKey(rk)
        setRoundQ((data.turns || []).filter((t) => t.role === 'ai' && (t.round || 'technical') === rk).length)
        if (data.ai_engine && !data.ai_engine.configured) setEngine({ engine: 'heuristic', note: data.ai_engine.note })
        setPhase('lobby')
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err, 'Could not load this interview.'))
      })
    return () => {
      cancelled = true
      aliveRef.current = false
      clearTimeout(bannerTimer.current)
      voiceRef.current?.cancel()
      listenerRef.current?.cancel()
      audioCtxRef.current?.close?.().catch?.(() => {})
    }
  }, [sessionId, navigate])

  useEffect(() => {
    if (['loading', 'lobby'].includes(phase)) return undefined
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - joinedAtRef.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [phase])

  const persona = getPersona(session?.interviewer)

  // ------------------------------------------------------------------ capability summary for the lobby
  // Browser speech recognition always listens to the system default microphone, so a specific microphone choice
  // can only be honoured by the server (Whisper) path, which transcribes the audio of the chosen device.
  const customMic = !!media.deviceId
  const serverOk = !!(voiceCfg?.stt_server && serverRecordingSupported())
  // evaluated at call time: the "network error -> switch to server transcription" fallback flips a ref mid-call
  const computeSttMode = () => {
    if (!forceServerRef.current && !(customMic && serverOk) && browserSttSupported()) return 'browser'
    if (serverOk) return 'server'
    if (browserSttSupported()) return 'browser'
    return null
  }
  const sttMode = computeSttMode()
  const micNote = !customMic ? null
    : sttMode === 'server' ? 'Your answers are transcribed on the server from this microphone, so there are no live captions while you speak.'
    : sttMode === 'browser' ? "This browser's built-in speech recognition always uses your system's default microphone. To answer with this one, set it as the default in your system sound settings, or type your answers."
    : null
  const sttInfo =
    media.state.mic === 'error' ? { ok: false, text: 'No microphone - you will type your answers.' }
    : sttMode === 'browser' ? { ok: true, text: 'Browser speech recognition with live captions.' }
    : sttMode === 'server' ? { ok: true, text: `Server transcription (${voiceCfg?.stt_provider}). No live captions while you speak.` }
    : { ok: false, text: 'Not supported in this browser - use Chrome/Edge, or type your answers.' }
  const ttsInfo = voiceCfg?.tts_server
    ? { ok: true, text: `Natural voice (${voiceCfg.tts_provider}), lip-synced to the audio.` }
    : typeof window !== 'undefined' && window.speechSynthesis
      ? { ok: null, text: 'Your device voice. Set TTS_PROVIDER on the server for a more natural one.' }
      : { ok: false, text: `No voice available - ${persona.name} will show captions only.` }

  // ------------------------------------------------------------------ the turn loop
  function pickEngine() {
    if (media.state.mic !== 'ok') return null
    return computeSttMode()
  }

  function startListening({ keepHint = false } = {}) {
    if (!aliveRef.current || endingRef.current) return
    setPhase('listening')
    setInterim('')
    if (!keepHint) setHint('')
    answerStartRef.current = Date.now()
    listenerRef.current?.cancel()
    listenerRef.current = null
    if (typeModeRef.current) return

    const engine = pickEngine()
    if (!engine) {
      setTypeMode(true)
      setHint('Voice input is not available here - type your answer below.')
      return
    }
    if (!micOnRef.current) {
      setHint('You are muted. Unmute to answer by voice.')
      return
    }
    const listener = createListener({
      mode: engine,
      stream: media.streamRef.current,
      onInterim: setInterim,
      onFinal: (text) => {
        if (listenerRef.current === listener) listenerRef.current = null
        api.current.submitAnswer(text, 'voice')
      },
      onError: (err) => api.current.onSttError(err, engine),
      transcribe: voiceApi.transcribe,
    })
    listenerRef.current = listener
    listener.start()
  }

  function onSttError(err, engine) {
    listenerRef.current = null
    if (err.code === 'network' && engine === 'browser' && voiceCfg?.stt_server && serverRecordingSupported()) {
      forceServerRef.current = true
      setHint('Switched to server transcription.')
      startListening({ keepHint: true })
      return
    }
    setTypeMode(true)
    setInterim('')
    setHint(`${err.message} You can type your answer below.`)
  }

  async function ask(text, closing = false) {
    if (!aliveRef.current || endingRef.current) return
    setPhase(closing ? 'closing' : 'asking')
    setAudioStarted(false)
    setInterim('')
    setHint('')
    setCaption({ text, progress: 0 })
    await voiceRef.current.speak(text, {
      onStart: () => setAudioStarted(true),
      onProgress: (p) => setCaption((c) => ({ ...c, progress: p })),
    })
    if (!aliveRef.current || endingRef.current) return
    setCaption((c) => ({ ...c, progress: 1 }))
    if (closing) await finish()
    else startListening()
  }

  async function submitAnswer(raw, mode) {
    if (!aliveRef.current || endingRef.current) return
    const text = (raw || '').trim()
    if (!text) {
      emptyRef.current += 1
      if (emptyRef.current >= 3) {
        setTypeMode(true)
        setHint("I'm still not hearing anything. Check your microphone, or type your answer below.")
        setPhase('listening')
      } else {
        setHint("I didn't catch that. Please try again, or use the keyboard button to type.")
        startListening({ keepHint: true })
      }
      return
    }
    emptyRef.current = 0
    listenerRef.current?.cancel()
    listenerRef.current = null
    setInterim('')
    setHint('')
    setError(null)
    setTurns((t) => [...t, { role: 'candidate', text, mode, round: roundKeyRef.current }])
    lastAnswerRef.current = {
      text,
      mode,
      responseTime: Math.max(1, Math.round((Date.now() - answerStartRef.current) / 1000)),
    }
    setPhase('thinking')
    setAudioStarted(false)
    await sendAnswer()
  }

  async function sendAnswer() {
    const a = lastAnswerRef.current
    if (!a) return
    setError(null)
    setPhase('thinking')
    try {
      const { data } = await interviewApi.sendMessage(sessionId, {
        answer: a.text,
        response_time: a.responseTime,
        input_mode: a.mode,
        skip_round: !!a.skip,
      })
      lastAnswerRef.current = null
      if (!aliveRef.current || endingRef.current) return
      setTurns((t) => {
        const copy = [...t]
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].role === 'candidate') { copy[i] = { ...copy[i], analysis: data.analysis }; break }
        }
        return copy
      })
      if (data.engine) setEngine({ engine: data.engine, note: data.engine_note })
      if (data.finished) {
        const closing = data.closing || 'Thank you, that is the end of the interview.'
        setTurns((t) => [...t, { role: 'ai', text: closing, round: roundKeyRef.current, closing: true }])
        await ask(closing, true)
        return
      }
      setQNum(data.question_number || ((n) => n + 1))
      if (data.round) setRoundKey(data.round)
      if (data.round_question_number) setRoundQ(data.round_question_number)
      if (data.round_changed) {
        setBanner(data.round)
        clearTimeout(bannerTimer.current)
        bannerTimer.current = setTimeout(() => setBanner(null), 6500)
      }
      setTurns((t) => [...t, { role: 'ai', text: data.question, is_followup: data.is_followup, sources: data.sources, round: data.round, topic: data.topic }])
      await ask(data.question)
    } catch (err) {
      if (!aliveRef.current) return
      if (err.response?.status === 409) {
        // The server already has this answer (e.g. a retry after a dropped response): resync.
        lastAnswerRef.current = null
        await resync()
        return
      }
      setError(errorMessage(err, 'Could not send your answer. Check your connection and retry.'))
      retryRef.current = sendAnswer
      setPhase('retry')
    }
  }

  async function skipRound() {
    if (phase !== 'listening' && phase !== 'asking') return
    if (!window.confirm('Skip the rest of the technical round and go straight to Round 2 (your resume)?')) return
    voiceRef.current?.cancel()
    listenerRef.current?.cancel()
    listenerRef.current = null
    setInterim('')
    setHint('')
    setError(null)
    setTurns((t) => [...t, { role: 'candidate', text: '(skipped to the resume round)', mode: 'text', round: roundKeyRef.current }])
    lastAnswerRef.current = { text: '', mode: 'text', responseTime: 1, skip: true }
    setPhase('thinking')
    setAudioStarted(false)
    await sendAnswer()
  }

  async function resync() {
    try {
      const { data } = await interviewApi.get(sessionId)
      setTurns(data.turns || [])
      setQNum(data.question_number || 0)
      setRoundKey(data.current_round || 'technical')
      setRoundQ((data.turns || []).filter((t) => t.role === 'ai' && (t.round || 'technical') === (data.current_round || 'technical')).length)
      if (data.current_question) await ask(data.current_question)
      else await finish()
    } catch {
      setError('Lost connection to the server.')
      retryRef.current = resync
      setPhase('retry')
    }
  }

  async function finish() {
    if (!aliveRef.current || endingRef.current) return
    endingRef.current = true
    setPhase('ending')
    try {
      await interviewApi.end(sessionId)
      if (aliveRef.current) navigate(`/report/${sessionId}`, { replace: true })
    } catch (err) {
      endingRef.current = false
      setError(errorMessage(err, 'Could not generate your report.'))
      retryRef.current = finish
      setPhase('retry')
    }
  }

  api.current = { submitAnswer, onSttError }

  // ------------------------------------------------------------------ user actions
  async function join() {
    setJoining(true)
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new AC()
      await audioCtxRef.current.resume().catch(() => {})
      voiceRef.current = createVoice({
        getAudioContext: () => audioCtxRef.current,
        fetchAudio: voiceCfg?.tts_server ? (text) => voiceApi.tts(text, persona.id) : null,
        gender: persona.gender,
        levelRef,
      })
      window.speechSynthesis?.getVoices?.() // warm the voice list
      joinedAtRef.current = Date.now()
      setElapsed(0)
      if (session?.current_question) await ask(session.current_question)
      else await finish()
    } finally {
      setJoining(false)
    }
  }

  const toggleMic = useCallback(() => {
    const next = !media.micOn
    media.setMic(next)
    micOnRef.current = next
    if (phase === 'listening' && !typeModeRef.current) {
      if (!next) {
        listenerRef.current?.cancel()
        listenerRef.current = null
        setInterim('')
        setHint('You are muted. Unmute to answer by voice.')
      } else {
        startListening()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.micOn, phase])

  function toggleType() {
    const next = !typeMode
    setTypeMode(next)
    typeModeRef.current = next
    if (phase === 'listening') {
      if (next) {
        listenerRef.current?.cancel()
        listenerRef.current = null
        setInterim('')
      } else {
        startListening()
      }
    }
  }

  function submitTyped(e) {
    e?.preventDefault()
    if (phase !== 'listening' || !typed.trim()) return
    const text = typed
    setTyped('')
    submitAnswer(text, 'text')
  }

  async function endCall() {
    if (!window.confirm('End the interview now and get your feedback report?')) return
    voiceRef.current?.cancel()
    listenerRef.current?.cancel()
    listenerRef.current = null
    await finish()
  }

  // ------------------------------------------------------------------ render
  if (loadError) {
    return <div className="mx-auto max-w-md px-6 py-24 text-center text-sm text-coral">{loadError}</div>
  }
  if (phase === 'loading') {
    return <div className="mx-auto max-w-md px-6 py-24 text-center text-sm text-muted">Preparing your interview room…</div>
  }
  if (phase === 'lobby') {
    return (
      <Lobby
        session={session}
        persona={persona}
        user={user}
        stream={media.stream}
        camOn={media.camOn}
        micOn={media.micOn}
        mediaState={media.state}
        getLevel={media.getLevel}
        devices={media.devices}
        deviceId={media.deviceId}
        onDevice={media.selectMic}
        deviceError={media.deviceError}
        micNote={micNote}
        stt={sttInfo}
        tts={ttsInfo}
        onMic={() => media.setMic(!media.micOn)}
        onCam={() => media.setCam(!media.camOn)}
        onJoin={join}
        joining={joining}
        error={error}
      />
    )
  }

  const avatarState =
    phase === 'asking' || phase === 'closing' ? (audioStarted ? 'speaking' : 'thinking')
    : phase === 'listening' ? 'listening'
    : phase === 'thinking' ? 'thinking'
    : 'idle'

  const aiCaption = (phase === 'asking' || phase === 'closing') && caption.text
  const placeholderHint =
    hint ||
    (typeMode ? 'Type your answer below…' : media.micOn ? 'Listening… speak when you are ready.' : 'You are muted.')
  const rounds = session?.rounds || []
  const maxQ = session?.max_questions || 8
  const roundIdx = Math.max(0, rounds.findIndex((r) => r.key === roundKey))
  const roundInfo = rounds[roundIdx]
  const roundMax = roundInfo?.max_questions || maxQ
  const roundShort = roundKey === 'resume' ? 'Resume' : 'Technical'
  const live = { active: phase === 'asking' || phase === 'closing', started: audioStarted, progress: caption.progress }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#12151B] text-white" data-testid="call-room" data-phase={phase}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber" />
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold">Mock interview · {session?.role}{session?.company ? ` · ${session.company}` : ''}</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-white/45">CareerPrepAi</p>
          </div>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2 text-xs sm:gap-2.5">
          {engine.engine === 'heuristic' && (
            <span className="hidden rounded-full bg-amber/20 px-3 py-1.5 font-mono text-amber sm:inline" title={engine.note || ''} data-testid="engine-warning">Offline questions</span>
          )}
          {roundKey === 'technical' && rounds.length > 1 && (phase === 'listening' || phase === 'asking') && (
            <button onClick={skipRound} className="hidden rounded-full border border-white/20 px-3 py-1.5 font-mono hover:bg-white/10 sm:inline" data-testid="btn-skip-round">Skip to Round 2</button>
          )}
          <span className="rounded-full bg-[#34C3AF]/20 px-3 py-1.5 font-mono text-[#7be0d0]" data-testid="round-chip">Round {roundIdx + 1} · {roundShort}</span>
          <span className="rounded-full bg-white/10 px-3 py-1.5 font-mono" data-testid="q-progress">Question {Math.min(roundQ, roundMax)} of {roundMax}</span>
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 font-mono" data-testid="timer">
            <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-coral" />{formatTime(elapsed)}
          </span>
        </div>
      </header>
      <div className="mx-4 flex h-1 gap-1 sm:mx-6" aria-label="Interview progress">
        {(rounds.length ? rounds : [{ key: 'technical', max_questions: maxQ }]).map((r, i) => {
          const before = rounds.slice(0, i).reduce((n, x) => n + x.max_questions, 0)
          const pct = Math.max(0, Math.min(100, ((qNum - before) / r.max_questions) * 100))
          return (
            <div key={r.key} className="overflow-hidden rounded bg-white/10" style={{ flex: r.max_questions }}>
              <div className="h-full bg-[#34C3AF] transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
          )
        })}
      </div>

      <main className="flex min-h-0 flex-1 gap-3 px-3 py-3 sm:px-4">
        <div className="relative min-w-0 flex-1">
          <InterviewerTile state={avatarState} levelRef={levelRef} persona={persona}>
            {captionsOn && aiCaption && <Captions who="ai" name={persona.name} text={caption.text} progress={caption.progress} />}
            {captionsOn && phase === 'listening' && <Captions who="you" text={interim} hint={placeholderHint} />}
            {banner && (
              <div className="pointer-events-none absolute inset-x-0 top-6 z-20 flex justify-center px-4" data-testid="round-banner">
                <div className="rounded-2xl border border-[#34C3AF]/40 bg-[#12151B]/90 px-6 py-3 text-center shadow-xl backdrop-blur">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-[#34C3AF]">Round {rounds.findIndex((r) => r.key === banner) + 1} of {rounds.length || 2}</p>
                  <p className="font-display text-lg font-semibold">{banner === 'resume' ? 'Resume deep-dive' : 'Technical round'}</p>
                  <p className="text-xs text-white/60">{banner === 'resume' ? 'Your experience and projects, one by one' : 'Role knowledge and fundamentals'}</p>
                </div>
              </div>
            )}
            {phase === 'ending' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm backdrop-blur-sm">Preparing your feedback report…</div>
            )}
          </InterviewerTile>
          <SelfView
            stream={media.stream}
            camOn={media.camOn}
            micOn={media.micOn}
            name={user?.name?.split(' ')[0] || 'You'}
            getLevel={media.getLevel}
            className="absolute bottom-3 right-3 z-10 h-24 w-36 sm:h-36 sm:w-56"
          />
        </div>

        {transcriptOn && (
          <aside className="hidden w-[340px] shrink-0 overflow-hidden rounded-2xl bg-[#1B2029] lg:block" aria-label="Transcript">
            <TranscriptPanel turns={turns} rounds={rounds} live={live} thinking={phase === 'thinking'} name={persona.name} />
          </aside>
        )}
      </main>

      {transcriptOn && (
        <div className="fixed inset-x-3 bottom-24 top-20 z-30 overflow-hidden rounded-2xl bg-[#1B2029] shadow-2xl lg:hidden">
          <TranscriptPanel turns={turns} rounds={rounds} live={live} thinking={phase === 'thinking'} name={persona.name} />
        </div>
      )}

      {error && (
        <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-lg bg-coral/20 px-4 py-2 text-sm text-[#FFB4A6] sm:mx-6" role="alert">
          <span>{error}</span>
          {phase === 'retry' && (
            <button onClick={() => retryRef.current?.()} className="rounded-md bg-coral px-3 py-1 text-white" data-testid="btn-retry">Retry</button>
          )}
        </div>
      )}

      {typeMode && phase === 'listening' && (
        <form onSubmit={submitTyped} className="mx-auto mb-2 flex w-full max-w-3xl gap-2 px-4" data-testid="type-form">
          <textarea
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) submitTyped(e) }}
            rows={2}
            autoFocus
            placeholder="Type your answer… (Enter to send)"
            className="flex-1 resize-none rounded-xl border border-white/15 bg-[#1B2029] px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-[#34C3AF]"
            data-testid="type-input"
          />
          <button type="submit" disabled={!typed.trim()} className="flex w-12 items-center justify-center rounded-xl bg-amber text-[#2A1600] disabled:opacity-40" aria-label="Send answer">
            <SendIcon />
          </button>
        </form>
      )}

      <footer className="px-4 pb-4 pt-1">
        <ControlBar
          micOn={media.micOn}
          camOn={media.camOn}
          captionsOn={captionsOn}
          transcriptOn={transcriptOn}
          typeMode={typeMode}
          listening={phase === 'listening'}
          micAvailable={media.state.mic === 'ok'}
          camAvailable={media.state.cam === 'ok'}
          canSkip={(phase === 'asking' || phase === 'closing') && audioStarted}
          onMic={toggleMic}
          onCam={() => media.setCam(!media.camOn)}
          onCaptions={() => setCaptionsOn((v) => !v)}
          onTranscript={() => setTranscriptOn((v) => !v)}
          onType={toggleType}
          onDone={() => listenerRef.current?.stop()}
          onSkip={() => voiceRef.current?.cancel()}
          onEnd={endCall}
        />
      </footer>
    </div>
  )
}
