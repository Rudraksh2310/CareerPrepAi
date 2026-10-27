import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Logo from './Logo'
import SearchDialog from './SearchDialog'
import ThemeToggle from './ThemeToggle'
import { Button } from './ui'

const linkCls = ({ isActive }) =>
  `relative py-1 text-sm font-medium transition-colors ${
    isActive ? 'text-ink after:absolute after:inset-x-0 after:-bottom-[17px] after:h-0.5 after:bg-amber' : 'text-muted hover:text-ink'
  }`

const mobileLinkCls = ({ isActive }) =>
  `block rounded-md px-3 py-3 text-base font-medium ${isActive ? 'bg-panel2 text-ink' : 'text-ink hover:bg-panel2'}`

const anchorCls = 'text-sm font-medium text-muted transition-colors hover:text-ink'

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  )
}

export default function Nav() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname, hash } = useLocation()
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const btnRef = useRef(null)
  const inCall = pathname.startsWith('/interview/')

  // close the menu on navigation and on Escape (returning focus to the toggle)
  useEffect(() => { setOpen(false) }, [pathname, hash])
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Ctrl/Cmd+K opens site search (not while in the live call room)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !inCall) {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [inCall])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const onHome = pathname === '/'

  return (
    <header className="site-header sticky top-0 z-50 border-b border-line/70">
      <div className="page flex h-16 items-center justify-between gap-4">
        <Logo />

        {/* Desktop */}
        <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
          {user ? (
            <>
              <NavLink to="/dashboard" className={linkCls}>Dashboard</NavLink>
              <NavLink to="/upload" className={linkCls}>New interview</NavLink>
              <NavLink to="/account" className={linkCls}>Account</NavLink>
            </>
          ) : (
            <>
              {onHome && (
                <>
                  <Link to="/#how" className={anchorCls}>How it works</Link>
                  <Link to="/#rounds" className={anchorCls}>Rounds</Link>
                  <Link to="/#faq" className={anchorCls}>FAQ</Link>
                </>
              )}
              <NavLink to="/login" className={linkCls}>Log in</NavLink>
            </>
          )}
          <span className="h-5 w-px bg-line-strong" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel2 hover:text-ink"
            aria-label="Search the site"
            aria-keyshortcuts="Control+K Meta+K"
            title="Search (Ctrl+K)"
          >
            <SearchIcon />
          </button>
          <ThemeToggle />
          {user ? (
            <Button variant="secondary" size="sm" onClick={handleLogout}>Log out</Button>
          ) : (
            <Button to="/register" size="sm">Get started</Button>
          )}
        </nav>

        {/* Mobile toggle */}
        <button
          ref={btnRef}
          type="button"
          className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-ink hover:bg-panel2 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {/* Mobile panel */}
      {open && (
        <nav id="mobile-menu" aria-label="Main" className="absolute inset-x-0 top-full border-b border-line bg-bg shadow-md md:hidden">
          <div className="page space-y-1 py-3">
            {user ? (
              <>
                <NavLink to="/dashboard" className={mobileLinkCls}>Dashboard</NavLink>
                <NavLink to="/upload" className={mobileLinkCls}>New interview</NavLink>
                <NavLink to="/account" className={mobileLinkCls}>Account</NavLink>
              </>
            ) : (
              <>
                {onHome && (
                  <>
                    <Link to="/#how" className={mobileLinkCls({ isActive: false })}>How it works</Link>
                    <Link to="/#rounds" className={mobileLinkCls({ isActive: false })}>Rounds</Link>
                    <Link to="/#faq" className={mobileLinkCls({ isActive: false })}>FAQ</Link>
                  </>
                )}
                <NavLink to="/login" className={mobileLinkCls}>Log in</NavLink>
              </>
            )}
            <button
              type="button"
              onClick={() => { setOpen(false); setSearchOpen(true) }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-3 text-left text-base font-medium text-ink hover:bg-panel2"
            >
              <SearchIcon /> Search
            </button>
            <div className="flex items-center justify-between gap-3 border-t border-line px-3 pt-3">
              <span className="flex items-center gap-2 text-sm text-muted">Theme <ThemeToggle /></span>
              {user ? (
                <Button variant="secondary" size="sm" onClick={handleLogout}>Log out</Button>
              ) : (
                <Button to="/register" size="sm">Get started</Button>
              )}
            </div>
          </div>
        </nav>
      )}

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  )
}
