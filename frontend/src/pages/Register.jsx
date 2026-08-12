import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const { register, loading, error } = useAuth()
  const navigate = useNavigate()
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
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-16">
      <p className="mb-2 font-mono text-xs uppercase tracking-wide text-teal">Get started</p>
      <h1 className="mb-8 font-display text-3xl font-semibold">Create your account</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-muted" htmlFor="name">Full name</label>
          <input
            id="name"
            name="name"
            required
            value={form.name}
            onChange={handleChange}
            className="w-full rounded-lg border border-line bg-panel px-4 py-2.5 text-ink outline-none focus:border-teal"
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-muted" htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={form.email}
            onChange={handleChange}
            className="w-full rounded-lg border border-line bg-panel px-4 py-2.5 text-ink outline-none focus:border-teal"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-muted" htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={handleChange}
            className="w-full rounded-lg border border-line bg-panel px-4 py-2.5 text-ink outline-none focus:border-teal"
            placeholder="At least 8 characters"
          />
        </div>

        {error && <p className="text-sm text-coral">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-amber py-2.5 font-semibold text-[#2A1600] transition hover:brightness-105 disabled:opacity-60"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="text-teal hover:underline">Log in</Link>
      </p>
    </div>
  )
}
