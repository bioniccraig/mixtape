import { useState } from 'react';
import TapeBuilder from './TapeBuilder';
import TapePlayer  from './TapePlayer';
import { getSharedTape } from './share';
import './App.css';

// Check once on load whether the URL contains a shared tape
const sharedTape = getSharedTape();

function App() {
  const [started, setStarted] = useState(false);

  // ── Shared tape player (read-only) ──────────────────────────────────────────
  if (sharedTape) {
    return (
      <TapePlayer
        tape={sharedTape}
        onMakeOwn={() => {
          // Clear hash and go to builder
          window.history.replaceState({}, '', window.location.pathname);
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
