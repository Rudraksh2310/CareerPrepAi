import { useEffect, useRef, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Nav from './components/Nav'
import Footer from './components/Footer'
import LiveBackground from './components/LiveBackground'
import ScrollProgress from './components/ScrollProgress'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import ResumeUpload from './pages/ResumeUpload'
import Interview from './pages/Interview'
import Report from './pages/Report'
import Dashboard from './pages/Dashboard'
import Account from './pages/Account'
import Admin from './pages/Admin'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import NotFound from './pages/NotFound'

// SPA navigation: reset scroll, move focus to the page and announce the new title to screen readers.
function RouteAnnouncer() {
  const { pathname, hash } = useLocation()
  const first = useRef(true)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (first.current) {
      first.current = false
      return undefined
    }
    if (!hash) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    const t = setTimeout(() => {
      setMessage(document.title)
      if (!hash) document.getElementById('main')?.focus({ preventScroll: true })
    }, 60)
    return () => clearTimeout(t)
  }, [pathname, hash])
  return <div aria-live="polite" role="status" className="sr-only">{message}</div>
}

export default function App() {
  // the live call room is a full-screen overlay: no footer under it
  const { pathname } = useLocation()
  const inCall = pathname.startsWith('/interview/')
  return (
    <div className={`flex min-h-screen flex-col font-body text-ink`}>
      {!inCall && <LiveBackground />}
      {!inCall && <ScrollProgress />}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-inverse focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-inverse"
      >
        Skip to content
      </a>
      <Nav />
      <RouteAnnouncer />
      <main id="main" key={pathname} tabIndex={-1} className={`${inCall ? "" : "page-enter"} flex-1 focus:outline-none`}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/upload"
          element={
            <ProtectedRoute>
              <ResumeUpload />
            </ProtectedRoute>
          }
        />
        <Route
          path="/interview/:sessionId"
          element={
            <ProtectedRoute>
              <Interview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/report/:sessionId"
          element={
            <ProtectedRoute>
              <Report />
            </ProtectedRoute>
          }
        />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route
          path="/account"
          element={
            <ProtectedRoute>
              <Account />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Admin />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </main>
      {!inCall && <Footer />}
    </div>
  )
}
