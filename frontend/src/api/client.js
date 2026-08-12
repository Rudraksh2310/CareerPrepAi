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
    if (err.response?.status === 401) {
      localStorage.removeItem('cpai_token')
    }
    return Promise.reject(err)
  }
)

export default client
