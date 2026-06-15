import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initSentry, Sentry } from './sentry.js'

// Initialise Sentry before React renders so any startup errors are caught.
initSentry();

createRoot(document.getElementById('root')).render(
  <Sentry.ErrorBoundary
    fallback={
      <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif', color: '#e85d75' }}>
        <p>Something went wrong — please refresh the page.</p>
      </div>
    }
  >
    <App />
  </Sentry.ErrorBoundary>
)
