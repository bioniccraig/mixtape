import { useState } from 'react';
import TapeBuilder from './TapeBuilder';
import TapePlayer  from './TapePlayer';
import CassetteSVG from './Cassette';
import { getSharedTape } from './share';
import './App.css';

function readSavedTape() {
  try {
    const raw = localStorage.getItem('mixtape_saved');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function App() {
  // Determine initial view from URL hash (checked once on mount)
  const [view,    setView]    = useState(() => getSharedTape() ? 'player' : 'splash');
  const [tape,    setTape]    = useState(() => getSharedTape());
  const [isSaved, setIsSaved] = useState(false);

  // ── Tape player (shared link OR saved tape) ──────────────────────────────────
  if (view === 'player' && tape) {
    return (
      <TapePlayer
        tape={tape}
        isSaved={isSaved}
        onMakeOwn={() => {
          // Strip hash from URL without reloading, go back to splash
          window.history.replaceState({}, '', window.location.pathname);
          setTape(null);
          setIsSaved(false);
          setView('splash');
        }}
        onClearSaved={() => {
          localStorage.removeItem('mixtape_saved');
          setTape(null);
          setIsSaved(false);
          setView('splash');
        }}
      />
    );
  }

  // ── Tape builder ─────────────────────────────────────────────────────────────
  if (view === 'builder') {
    return <TapeBuilder onBack={() => setView('splash')} />;
  }

  // ── Splash ───────────────────────────────────────────────────────────────────
  const savedTape = readSavedTape();

  return (
    <div className="splash">
      <div className="splash-hero">
        <CassetteSVG theme="yellow" sideAMs={20 * 60 * 1000} sideBMs={14 * 60 * 1000} title="MIXTAPE" spinning={false} />
      </div>
      <div className="logo">
        <span className="logo-icon">◼</span>
        <span className="logo-text">MixTape</span>
      </div>
      <p className="tagline">Say It With Music</p>
      <button className="btn-start" onClick={() => setView('builder')}>
        Make a Tape
      </button>
      {savedTape && (
        <button
          className="btn-saved-tape"
          onClick={() => { setTape(savedTape); setIsSaved(true); setView('player'); }}
        >
          📼 View your saved tape
        </button>
      )}
      <p className="disclaimer">Search any song from the iTunes catalogue — no login needed</p>
    </div>
  );
}

export default App;
