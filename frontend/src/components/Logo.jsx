import { Link } from 'react-router-dom'

// The existing brand mark: amber dot + wordmark.
export default function Logo({ className = '' }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-ink ${className}`} aria-label="CareerPrepAi home">
      <span className="h-2.5 w-2.5 rounded-full bg-amber" aria-hidden="true" />
      CareerPrepAi
    </Link>
  )
}
