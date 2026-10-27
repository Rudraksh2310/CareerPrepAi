import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
// Fonts are bundled (no request to Google Fonts): faster first paint, nothing third-party to disclose or allow in a CSP.
import '@fontsource-variable/bricolage-grotesque/standard.css'
import '@fontsource/atkinson-hyperlegible-next/latin-400.css'
import '@fontsource/atkinson-hyperlegible-next/latin-600.css'
import '@fontsource/atkinson-hyperlegible-next/latin-700.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
