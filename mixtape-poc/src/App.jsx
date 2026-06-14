import { useState } from 'react';
import TapeBuilder from './TapeBuilder';
import TapePlayer  from './TapePlayer';
import { getSharedTape } from './share';
import './App.css';

// Check once on load whether the URL contains a shared tape
const sharedTape = getSharedTape();

// If no URL hash, check for a previously saved tape in localStorage
function getSavedTape() {
  if (sharedTape) return null; // URL always takes priority
  try {
    const raw = localStorage.getItem('mixtape_saved');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
const savedTape = getSavedTape();

function App() {
  const [started, setStarted] = useState(false);

  // ── Shared tape from URL hash ────────────────────────────────────────────────
  if (sharedTape) {
    return (
      <TapePlayer
        tape={sharedTape}
        isSaved={false}
        onMakeOwn={() => {
          window.history.replaceState({}, '', window.location.pathname);
          window.location.reload();
        }}
        onClearSaved={() => {}}
      />
    );
  }

  // ── Previously saved tape (persisted across navigation) ──────────────────────
  if (savedTape) {
    return (
      <TapePlayer
        tape={savedTape}
        isSaved={true}
        onMakeOwn={() => window.location.reload()}
        onClearSaved={() => {
          localStorage.removeItem('mixtape_saved');
          window.location.reload();
        }}
      />
    );
  }

  // ── Normal flow ─────────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="splash">
        <div className="logo">
          <span className="logo-icon">◼</span>
          <span className="logo-text">MixTape</span>
        </div>
        <p className="tagline">Say It With Music</p>
        <button className="btn-start" onClick={() => setStarted(true)}>
          Make a Tape
        </button>
        <p className="disclaimer">Search any song from the iTunes catalogue — no login needed</p>
      </div>
    );
  }

  return <TapeBuilder onBack={() => setStarted(false)} />;
}

export default App;
