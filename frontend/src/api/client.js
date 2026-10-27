import axios from 'axios'

// Set VITE_API_BASE_URL in .env (see .env.example). Falls back to same-origin /api
// so the Vite dev proxy (vite.config.js) can forward to the FastAPI backend locally.
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

const client = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' }
})

// Attach auth token if present. Backend contract (per blueprint) is expected
// to return a bearer token from /auth/login and /auth/register.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('cpai_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Central place to react to auth failures without repeating logic per-page.
client.interceptors.response.use(
  (res) => res,
  (err) => {
    // 401 = expired/invalid token; 403 "Not authenticated" = no token at all (e.g. it was cleared but the
    // saved user was not). Either way the session is gone: clear both and send the user to log in again.
    const status = err.response?.status
    const detail = err.response?.data?.detail
    const isAuthUrl = /\/auth\//.test(err.config?.url || '')
    if (!isAuthUrl && (status === 401 || (status === 403 && detail === 'Not authenticated'))) {
      localStorage.removeItem('cpai_token')
      localStorage.removeItem('cpai_user')
      if (!window.location.pathname.startsWith('/login')) window.location.assign('/login')
    }
    return Promise.reject(err)
  }
)

export default client
