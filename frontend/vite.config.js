import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Frontend talks to the FastAPI backend via VITE_API_BASE_URL (see .env.example).
// Proxy is kept here too so `npm run dev` works even before .env is set up.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
