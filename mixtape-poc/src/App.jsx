import { useState, useEffect } from 'react';
import TapeBuilder  from './TapeBuilder';
import TapePlayer   from './TapePlayer';
import CassetteSVG  from './Cassette';
import AuthModal    from './AuthModal';
import { getSharedTape } from './share';
import { loadTapeByShareId } from './db';
import { useAuth } from './useAuth';
import { supabase } from './supabase';
import './App.css';

// ── Detect share route ────────────────────────────────────────────────────────
// Supports two share formats:
//   1. /#tape=BASE64   — legacy hash-based share (no auth required)
//   2. /t/SHAREID      — short DB-backed share URL
function getShareIdFromPath() {
  const m = window.location.pathname.match(/^\/t\/([a-z0-9]+)$/i);
  return m ? m[1] : null;
}

function readSavedTape() {
  try {
    const raw = localStorage.getItem('mixtape_saved');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const { user, loading: authLoading } = useAuth();

  const shareId    = getShareIdFromPath();
  const hashTape   = getSharedTape();        // null if no #tape= hash

  const [view,       setView]       = useState(() => {
    if (shareId || hashTape) return 'player';
    return 'splash';
  });
  const [tape,       setTape]       = useState(() => hashTape); // hash tape loads immediately
  const [isSaved,    setIsSaved]    = useState(false);
  const [tapeLoading, setTapeLoading] = useState(!!shareId);   // true while fetching from DB
  const [showAuth,   setShowAuth]   = useState(false);

  // ── Fetch DB tape when we have a /t/SHAREID path ───────────────────────────
  useEffect(() => {
    if (!shareId) return;
    setTapeLoading(true);
    loadTapeByShareId(shareId).then(({ tape: t, error }) => {
      if (t) { setTape(t); setView('player'); }
      else {
        console.error('Failed to load tape:', error);
        // Fall back to splash — the link may be stale
        setView('splash');
      }
      setTapeLoading(false);
    });
  }, [shareId]); // eslint-disable-line

  // ── Sign out ───────────────────────────────────────────────────────────────
  async function signOut() {
    if (supabase) await supabase.auth.signOut();
  }

  // ── Loading screens ────────────────────────────────────────────────────────
  if (authLoading || tapeLoading) {
    return (
      <div className="splash">
        <div className="logo">
          <span className="logo-icon">◼</span>
          <span className="logo-text">MixTape</span>
        </div>
        <p className="tagline">Loading…</p>
      </div>
    );
  }

  // ── Tape player ────────────────────────────────────────────────────────────
  if (view === 'player' && tape) {
    return (
      <>
        <TapePlayer
          tape={tape}
          isSaved={isSaved}
          user={user}
          onMakeOwn={() => {
            window.history.replaceState({}, '', '/');
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
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </>
    );
  }

  // ── Tape builder ────────────────────────────────────────────────────────────
  if (view === 'builder') {
    return (
      <>
        <TapeBuilder
          user={user}
          onBack={() => setView('splash')}
          onSignInRequest={() => setShowAuth(true)}
        />
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </>
    );
  }

  // ── Splash ──────────────────────────────────────────────────────────────────
  const savedTape = readSavedTape();

  return (
    <div className="splash">
      {/* Auth bar */}
      <div className="splash-auth-bar">
        {user ? (
          <span className="auth-status">
            <span className="auth-email">{user.email}</span>
            <button className="btn-auth-link" onClick={signOut}>Sign out</button>
          </span>
        ) : (
          <button className="btn-auth-link" onClick={() => setShowAuth(true)}>Sign in</button>
        )}
      </div>

      <div className="splash-hero">
        <CassetteSVG skin="rainbow" title="MIXTAPE" spinning={false} />
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
      <p className="disclaimer">Search any song from the iTunes catalogue{user ? '' : ' — no login needed'}</p>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}
