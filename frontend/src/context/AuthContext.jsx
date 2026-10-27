import { createContext, useContext, useState, useCallback } from 'react'
import { authApi } from '../api/endpoints'
import { errorMessage } from '../lib/errors'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('cpai_user')
      // a saved user without a token is a stale session: treat as logged out
      return stored && localStorage.getItem('cpai_token') ? JSON.parse(stored) : null
    } catch {
      return null // blocked storage or a corrupted value: start logged out instead of crashing
    }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const persistSession = (token, userData) => {
    try {
      if (token) localStorage.setItem('cpai_token', token)
      if (userData) localStorage.setItem('cpai_user', JSON.stringify(userData))
    } catch {
      /* storage blocked: the session works until the tab is closed */
    }
    setUser(userData || null)
  }

  const login = useCallback(async (email, password) => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await authApi.login({ email, password })
      persistSession(data.token, data.user)
      return data
    } catch (err) {
      setError(errorMessage(err, 'Login failed. Check your credentials.'))
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const register = useCallback(async (name, email, password) => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await authApi.register({ name, email, password })
      persistSession(data.token, data.user)
      return data
    } catch (err) {
      setError(errorMessage(err, 'Registration failed.'))
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    try {
      localStorage.removeItem('cpai_token')
      localStorage.removeItem('cpai_user')
    } catch {
      /* ignore */
    }
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, error, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
