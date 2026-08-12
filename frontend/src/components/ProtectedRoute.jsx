import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { user } = useAuth()
  const hasToken = Boolean(localStorage.getItem('cpai_token'))

  if (!user && !hasToken) {
    return <Navigate to="/login" replace />
  }
  return children
}
