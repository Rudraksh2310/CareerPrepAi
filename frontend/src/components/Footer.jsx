import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Logo from './Logo'

const col = 'text-sm text-muted transition-colors hover:text-ink'

export default function Footer() {
  const { user } = useAuth()
  return (
    <footer className="relative">
      <div className="page" aria-hidden="true"><hr className="fade-rule" /></div>
      <div className="page grid gap-8 py-10 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">
            Voice mock interviews with a technical round and a resume round, and a report for each. Free during beta.
          </p>
        </div>
        <nav aria-label="Product">
          <p className="mb-3 font-mono text-xs uppercase tracking-wider text-muted">Product</p>
          <ul className="space-y-2">
            <li><Link to="/#how" className={col}>How it works</Link></li>
            <li><Link to="/#rounds" className={col}>The two rounds</Link></li>
            <li><Link to="/#faq" className={col}>FAQ</Link></li>
          </ul>
        </nav>
        <nav aria-label="Legal and account">
          <p className="mb-3 font-mono text-xs uppercase tracking-wider text-muted">Account and legal</p>
          <ul className="space-y-2">
            {user ? (
              <>
                <li><Link to="/dashboard" className={col}>Dashboard</Link></li>
                <li><Link to="/upload" className={col}>New interview</Link></li>
                <li><Link to="/account" className={col}>Account</Link></li>
              </>
            ) : (
              <>
                <li><Link to="/login" className={col}>Log in</Link></li>
                <li><Link to="/register" className={col}>Create an account</Link></li>
              </>
            )}
            <li><Link to="/privacy" className={col}>Privacy Policy</Link></li>
            <li><Link to="/terms" className={col}>Terms of Use</Link></li>
          </ul>
        </nav>
      </div>
      <div>
        <p className="page py-5 text-xs text-muted">Built by Rudraksh Dhasmana &amp; Shashwat Bhardwaj</p>
      </div>
    </footer>
  )
}
