import { useState } from 'react'
import { Link } from 'react-router-dom'

// Small shared UI kit. Everything here is a thin wrapper over Tailwind classes using the tokens in tailwind.config.js.

export function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-[transform,box-shadow,background-color,border-color] duration-200 ' +
  'hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 active:translate-y-px disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55'

const VARIANTS = {
  primary: 'bg-teal text-white hover:bg-[#3947FF] hover:shadow-lg hover:shadow-teal/30',
  secondary: 'border border-line-strong bg-panel/70 text-ink hover:border-ink',
  ghost: 'text-ink hover:bg-panel2'
}
const SIZES = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base'
}

// <Button to="/x"> renders a router Link, <Button href> an anchor, otherwise a <button>.
export function Button({ to, href, variant = 'primary', size = 'md', loading = false, className = '', children, ...rest }) {
  const cls = `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`
  if (to) return <Link to={to} className={cls} {...rest}>{children}</Link>
  if (href) return <a href={href} className={cls} {...rest}>{children}</a>
  return (
    <button type="button" className={cls} disabled={loading || rest.disabled} {...rest}>
      {loading && <Spinner />}
      {children}
    </button>
  )
}

// Label + control + hint/error wired together for screen readers.
export function Field({ id, label, hint, error, as: Tag = 'input', revealable = false, className = '', ...props }) {
  const [shown, setShown] = useState(false)
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  const canReveal = revealable && props.type === 'password'
  const control = (
      <Tag
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={[hintId, errId].filter(Boolean).join(' ') || undefined}
        className={
          'h-11 w-full rounded-md border bg-panel px-3 text-base text-ink placeholder:text-muted/70 sm:text-sm ' +
          'transition-colors focus:border-teal-ink focus:outline-none focus:ring-2 focus:ring-teal-ink/25 disabled:opacity-60 ' +
          (error ? 'border-coral-ink' : 'border-line-strong hover:border-muted') + (canReveal ? ' pr-16' : '') + ' ' + className
        }
        {...props}
        type={canReveal && shown ? 'text' : props.type}
      />
  )
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      {canReveal ? (
        <div className="relative">
          {control}
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-pressed={shown}
            className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-3 text-xs font-semibold text-muted hover:text-ink"
          >
            {shown ? 'Hide' : 'Show'}<span className="sr-only"> password</span>
          </button>
        </div>
      ) : control}
      {hint && !error && <p id={hintId} className="mt-1.5 text-xs text-muted">{hint}</p>}
      {error && <p id={errId} className="mt-1.5 text-xs font-medium text-coral-ink">{error}</p>}
    </div>
  )
}

const ALERT = {
  error: 'border-coral-ink/30 bg-coral-soft text-coral-ink',
  success: 'border-teal-ink/30 bg-teal-soft text-teal-ink',
  info: 'border-line-strong bg-panel2 text-ink'
}
export function Alert({ tone = 'error', children, className = '' }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2.5 text-sm ${ALERT[tone]} ${className}`}>
      {children}
    </div>
  )
}

export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-panel2 ${className}`} />
}

// Score colour by band; always paired with the number, never colour alone.
export const scoreTone = (v) => (v >= 70 ? 'text-teal-ink' : v >= 50 ? 'text-amber-ink' : 'text-coral-ink')
