import Avatar from '../Avatar'
import { DEFAULT_PERSONA } from '../../lib/personas'

const LABEL = { speaking: 'Speaking', thinking: 'Thinking', listening: 'Listening', idle: 'Ready' }

// The main call tile: the interviewer figure on a softly blurred "office" backdrop, with a name tag,
// a speaking ring, and a status chip (speaking / thinking / listening).
export default function InterviewerTile({ state, levelRef, persona = DEFAULT_PERSONA, children }) {
  const name = persona.name
  const speaking = state === 'speaking'
  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-2xl bg-[#1B2029] transition-shadow duration-300 ${
        speaking ? 'shadow-[0_0_0_3px_#34C3AF]' : 'shadow-[0_0_0_1px_rgba(255,255,255,0.08)]'
      }`}
      data-testid="interviewer-tile"
      data-state={state}
    >
      {/* blurred office backdrop */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 50% 12%, #405169 0%, #28344a 42%, #171d29 100%)' }} />
      <div className="absolute -left-10 top-6 h-[55%] w-[22%] rounded-xl opacity-30 blur-[3px]" style={{ background: 'linear-gradient(160deg,#F5E7C4,#9DB4D3 70%)' }} />
      <div className="absolute bottom-[34%] right-[6%] flex h-[26%] w-[24%] items-end gap-1.5 opacity-25 blur-[2px]">
        {[70, 95, 60, 85, 100, 55, 80].map((h, i) => (
          <span key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: ['#C8790C', '#0E8E7E', '#8AA0C0', '#E3DDCE'][i % 4] }} />
        ))}
      </div>
      <div className="absolute bottom-[33%] right-[4%] h-1.5 w-[28%] rounded bg-white/10 blur-[1px]" />
      <div className="absolute left-1/2 top-[8%] h-[40%] w-[40%] -translate-x-1/2 rounded-full opacity-25 blur-3xl" style={{ background: '#9FD8CF' }} />

      <Avatar persona={persona} state={state} levelRef={levelRef} className="absolute bottom-0 left-1/2 w-[175%] max-w-none -translate-x-1/2 sm:h-[92%] sm:w-full sm:max-w-full" />

      {/* status chip */}
      <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-xs text-white backdrop-blur" aria-live="polite">
        {speaking && <span className="eq text-[#34C3AF]"><span /><span /><span /></span>}
        {state === 'thinking' && (
          <span className="flex gap-1 text-amber">
            <i className="think-dot h-1.5 w-1.5 rounded-full bg-current" /><i className="think-dot h-1.5 w-1.5 rounded-full bg-current" /><i className="think-dot h-1.5 w-1.5 rounded-full bg-current" />
          </span>
        )}
        {state === 'listening' && <span className="h-2 w-2 animate-pulse rounded-full bg-[#34C3AF]" />}
        <span data-testid="status-chip">{LABEL[state] || ''}</span>
      </div>

      {/* name tag */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-black/50 px-3 py-1.5 text-sm text-white backdrop-blur">
        <span className="font-medium">{name}</span>
        <span className="text-white/60">· AI Interviewer</span>
      </div>

      {children}
    </div>
  )
}
