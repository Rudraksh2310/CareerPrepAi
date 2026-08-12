import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { interviewApi } from '../api/endpoints'

// Turn shape kept generic on purpose: { role: 'ai' | 'candidate', text: string }
export default function Interview() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [turns, setTurns] = useState(() =>
    location.state?.firstQuestion ? [{ role: 'ai', text: location.state.firstQuestion }] : []
  )
  const [answer, setAnswer] = useState('')
  const [sending, setSending] = useState(false)
  const [ending, setEnding] = useState(false)
  const [error, setError] = useState(null)
  const [elapsed, setElapsed] = useState(0)

  const questionStartRef = useRef(Date.now())
  const scrollRef = useRef(null)

  // Response timer, resets whenever a new AI question lands.
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - questionStartRef.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [turns.length])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!answer.trim() || sending) return

    const responseTime = Math.floor((Date.now() - questionStartRef.current) / 1000)
    const candidateTurn = { role: 'candidate', text: answer }
    setTurns((t) => [...t, candidateTurn])
    setAnswer('')
    setSending(true)
    setError(null)

    try {
      const { data } = await interviewApi.sendMessage(sessionId, {
        answer: candidateTurn.text,
        response_time: responseTime
      })

      if (data.finished) {
        await handleEnd()
        return
      }

      setTurns((t) => [...t, { role: 'ai', text: data.question }])
      questionStartRef.current = Date.now()
      setElapsed(0)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not send your answer. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const handleEnd = async () => {
    setEnding(true)
    try {
      await interviewApi.end(sessionId)
      navigate(`/report/${sessionId}`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not end the session.')
      setEnding(false)
    }
  }

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="mx-auto flex h-[calc(100vh-73px)] max-w-3xl flex-col px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-teal">Live session</p>
          <h1 className="font-display text-xl font-semibold">Interview in progress</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-panel px-3 py-1.5 font-mono text-xs text-ink">{formatTime(elapsed)}</span>
          <button
            onClick={handleEnd}
            disabled={ending}
            className="rounded-md border border-line px-3 py-1.5 text-xs text-muted transition hover:border-coral hover:text-coral disabled:opacity-60"
          >
            {ending ? 'Ending…' : 'End interview'}
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto rounded-card border border-line bg-panel p-5">
        {turns.length === 0 && (
          <p className="text-sm text-muted">Waiting for the first question…</p>
        )}
        {turns.map((turn, i) => (
          <div key={i} className={`flex ${turn.role === 'candidate' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
                turn.role === 'candidate'
                  ? 'bg-teal/15 text-ink'
                  : 'bg-panel2 text-ink'
              }`}
            >
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-muted">
                {turn.role === 'candidate' ? 'You' : 'AI Interviewer'}
              </span>
              {turn.text}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="mt-2 text-sm text-coral">{error}</p>}

      <form onSubmit={handleSend} className="mt-4 flex gap-3">
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend(e)
            }
          }}
          rows={2}
          placeholder="Type your answer…"
          className="flex-1 resize-none rounded-lg border border-line bg-panel px-4 py-2.5 text-sm text-ink outline-none focus:border-teal"
        />
        <button
          type="submit"
          disabled={sending || !answer.trim()}
          className="rounded-lg bg-amber px-5 font-semibold text-[#2A1600] transition hover:brightness-105 disabled:opacity-60"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  )
}
