import { useEffect, useState } from 'react'
import { effectiveTheme, getStoredTheme, setTheme } from '../lib/theme'

export default function ThemeToggle({ className = '' }) {
  const [theme, setT] = useState(() => effectiveTheme())

  // follow the OS while the user has not made a choice
  useEffect(() => {
    if (getStoredTheme() || !window.matchMedia) return undefined
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => !getStoredTheme() && setT(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={() => { setTheme(next); setT(next) }}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel2 hover:text-ink ${className}`}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {theme === 'dark' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  )
}
