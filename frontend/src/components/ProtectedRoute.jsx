import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { user } = useAuth()
  let hasToken = false
  try {
    hasToken = Boolean(localStorage.getItem('cpai_token'))
  } catch {
    /* blocked storage: treat as signed out */
  }

  if (!user && !hasToken) {
    return <Navigate to="/login" replace />
  }
  return children
}
