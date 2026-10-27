import { useLocation } from 'react-router-dom'
import { Button } from '../components/ui'
import { usePageMeta } from '../lib/seo'
import { useAuth } from '../context/AuthContext'

export default function NotFound() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  usePageMeta({ title: 'Page not found', noindex: true })
  return (
    <div className="page flex min-h-[60vh] items-center py-16">
      <div className="max-w-lg">
        <p className="eyebrow mb-2">Error 404</p>
        <h1 className="h2 sm:text-3xl">We can&apos;t find that page</h1>
        <p className="mt-3 text-muted">
          Nothing lives at <code className="break-all rounded bg-panel2 px-1.5 py-0.5 font-mono text-sm text-ink">{pathname}</code>. The link may be
          mistyped or the page may have moved.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button to="/">Go to the homepage</Button>
          {user ? <Button to="/dashboard" variant="secondary">Open your dashboard</Button> : <Button to="/login" variant="secondary">Log in</Button>}
        </div>
      </div>
    </div>
  )
}
