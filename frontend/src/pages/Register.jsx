import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Alert, Button, Field } from '../components/ui'
import { usePageMeta } from '../lib/seo'

export default function Register() {
  const { register, loading, error } = useAuth()
  const navigate = useNavigate()
  usePageMeta({ title: 'Create your account', noindex: true })
  const [form, setForm] = useState({ name: '', email: '', password: '' })

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await register(form.name, form.email, form.password)
      navigate('/upload')
    } catch {
      // error surfaced via context state below
    }
  }

  return (
    <div className="page flex min-h-[70vh] items-center py-12">
      <div className="glass mx-auto w-full max-w-md rounded-2xl p-6 shadow-xl shadow-black/10 sm:p-8">
        <p className="eyebrow mb-2">Get started</p>
        <h1 className="h2 mb-6 sm:text-3xl">Create your account</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field id="name" name="name" label="Full name" required autoComplete="name" value={form.name} onChange={handleChange} placeholder="Your name" />
          <Field id="email" name="email" type="email" label="Email" required autoComplete="email" value={form.email} onChange={handleChange} placeholder="you@example.com" />
          <Field id="password" name="password" type="password" label="Password" required revealable minLength={8} maxLength={72} autoComplete="new-password" hint="At least 8 characters." value={form.password} onChange={handleChange} />

          {error && <Alert tone="error">{error}</Alert>}

          <Button type="submit" size="lg" loading={loading} className="w-full">
            {loading ? 'Creating account\u2026' : 'Create account'}
          </Button>
        </form>

        <p className="mt-4 text-xs text-muted">
          By creating an account you agree to the <Link to="/terms" className="underline underline-offset-2 hover:text-ink">Terms of Use</Link> and
          the <Link to="/privacy" className="underline underline-offset-2 hover:text-ink">Privacy Policy</Link>.
        </p>

        <p className="mt-6 text-sm text-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-teal-ink hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  )
}
