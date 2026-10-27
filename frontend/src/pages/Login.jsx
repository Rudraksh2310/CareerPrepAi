import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Alert, Button, Field } from '../components/ui'
import { usePageMeta } from '../lib/seo'

export default function Login() {
  const { login, loading, error } = useAuth()
  const navigate = useNavigate()
  const notice = useLocation().state?.notice
  usePageMeta({ title: 'Log in', noindex: true })
  const [form, setForm] = useState({ email: '', password: '' })

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await login(form.email, form.password)
      navigate('/dashboard')
    } catch {
      // error is surfaced via context state below
    }
  }

  return (
    <div className="page flex min-h-[70vh] items-center py-12">
      <div className="glass mx-auto w-full max-w-md rounded-2xl p-6 shadow-xl shadow-black/10 sm:p-8">
        <p className="eyebrow mb-2">Welcome back</p>
        <h1 className="h2 mb-6 sm:text-3xl">Log in to CareerPrepAi</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field id="email" name="email" type="email" label="Email" required autoComplete="email" value={form.email} onChange={handleChange} placeholder="you@example.com" />
          <Field id="password" name="password" type="password" label="Password" required revealable autoComplete="current-password" value={form.password} onChange={handleChange} placeholder="Your password" />

          {notice && !error && <Alert tone="success">{notice}</Alert>}
          {error && <Alert tone="error">{error}</Alert>}

          <Button type="submit" size="lg" loading={loading} className="w-full">
            {loading ? 'Logging in\u2026' : 'Log in'}
          </Button>
        </form>

        <p className="mt-6 text-sm text-muted">
          New here?{' '}
          <Link to="/register" className="font-semibold text-teal-ink hover:underline">Create an account</Link>
        </p>
      </div>
    </div>
  )
}
