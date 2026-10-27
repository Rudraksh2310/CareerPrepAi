import Avatar from './Avatar'
import { PERSONAS } from '../lib/personas'

// Choose who interviews you. A native radio group (arrow keys, one tab stop, screen-reader friendly) styled as cards.
export default function InterviewerPicker({ value, onChange }) {
  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium text-ink">Your interviewer</legend>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5" data-testid="interviewer-picker">
        {PERSONAS.map((p) => (
          <label key={p.id} className="block cursor-pointer">
            <input
              type="radio"
              name="interviewer"
              value={p.id}
              checked={value === p.id}
              onChange={() => onChange(p.id)}
              className="peer sr-only"
              data-testid={`persona-${p.id}`}
            />
            <span className="block overflow-hidden rounded-lg border border-line-strong bg-panel text-center transition-colors hover:border-muted peer-checked:border-teal-ink peer-checked:ring-2 peer-checked:ring-teal-ink/30 peer-focus-visible:ring-2 peer-focus-visible:ring-teal-ink">
              <span className="block h-24 overflow-hidden" style={{ background: 'radial-gradient(120% 90% at 50% 12%, #405169 0%, #28344a 42%, #171d29 100%)' }}>
                <Avatar persona={p} animate={false} viewBox="125 78 230 250" className="h-full w-full" />
              </span>
              <span className="block px-1.5 py-1.5">
                <span className="block text-sm font-semibold text-ink">{p.name}</span>
                <span className="block text-[11px] leading-tight text-muted">{p.tagline}</span>
              </span>
            </span>
          </label>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">Each interviewer has their own voice. The questions and scoring are the same.</p>
    </fieldset>
  )
}
