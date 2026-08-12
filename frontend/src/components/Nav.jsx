import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Nav() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold">
          <span className="h-2.5 w-2.5 rounded-full bg-amber" />
          CareerPrepAi
        </Link>
        <div className="flex items-center gap-6 text-sm text-muted">
          {user ? (
            <>
              <Link to="/dashboard" className="hover:text-ink transition-colors">Dashboard</Link>
              <Link to="/upload" className="hover:text-ink transition-colors">New interview</Link>
              <button onClick={handleLogout} className="rounded-md border border-line px-3 py-1.5 text-ink hover:border-muted transition-colors">
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="hover:text-ink transition-colors">Log in</Link>
              <Link to="/register" className="rounded-md bg-amber px-4 py-1.5 font-semibold text-[#2A1600] hover:brightness-105 transition">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
