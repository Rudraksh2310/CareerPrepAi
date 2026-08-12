import { createContext, useContext, useState, useCallback } from 'react'
import { authApi } from '../api/endpoints'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('cpai_user')
    return stored ? JSON.parse(stored) : null
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const persistSession = (token, userData) => {
    if (token) localStorage.setItem('cpai_token', token)
    if (userData) localStorage.setItem('cpai_user', JSON.stringify(userData))
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
      setError(err.response?.data?.detail || 'Login failed. Check your credentials.')
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
      setError(err.response?.data?.detail || 'Registration failed.')
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('cpai_token')
    localStorage.removeItem('cpai_user')
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
