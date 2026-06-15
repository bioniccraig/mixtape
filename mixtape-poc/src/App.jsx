import { useState, useEffect } from 'react';
import TapeBuilder  from './TapeBuilder';
import TapePlayer   from './TapePlayer';
import CassetteSVG  from './Cassette';
import AuthModal    from './AuthModal';
import MyLibrary    from './MyLibrary';
import { getSharedTape } from './share';
import { loadTapeByShareId, loadTapeById } from './db';
import { useAuth } from './useAuth';
import { supabase } from './supabase';
import './App.css';

// ── Detect /t/SHAREID path ────────────────────────────────────────────────────
function getShareIdFromPath() {
  const m = window.location.pathname.match(/^\/t\/([a-z0-9]+)$/i);
  return m ? m[1] : null;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const { user, loading: authLoading } = useAuth();

  const shareId  = getShareIdFromPath();
  const hashTape = getSharedTape();

  const [view,         setView]         = useState(() => (shareId || hashTape) ? 'player' : 'splash');
  const [tape,         setTape]         = useState(() => hashTape);
  const [editTape,     setEditTape]     = useState(null);   // tape to open in builder for editing
  const [tapeLoading,  setTapeLoading]  = useState(!!shareId);
  const [showAuth,     setShowAuth]     = useState(false);
  const [showLibrary,  setShowLibrary]  = useState(false);

  // ── Fetch DB tape for /t/SHAREID ──────────────────────────────────────────
  useEffect(() => {
    if (!shareId) return;
    setTapeLoading(true);
    loadTapeByShareId(shareId).then(({ tape: t, error }) => {
      if (t) { setTape(t); setView('player'); }
      else   { console.error('Failed to load tape:', error); setView('splash'); }
      setTapeLoading(false);
    });
  }, [shareId]); // eslint-disable-line

  // ── Sign out ──────────────────────────────────────────────────────────────
  async function signOut() {
    if (supabase) await supabase.auth.signOut();
  }

  // ── Open a tape from the library in the player ────────────────────────────
  async function openTapeInPlayer(libraryTape) {
    const id = libraryTape.id || libraryTape.dbId;
    const { tape: t, error } = await loadTapeById(id);
    if (error || !t) { alert("Couldn't load tape"); return; }
    setTape(t);
    setView('player');
  }

  // ── Open a tape from the library in the builder for editing ──────────────
  // Always fetches the full tape from DB to ensure tracks are properly converted.
  async function openTapeInBuilder(libraryTape) {
    const id = libraryTape.id || libraryTape.dbId;
    const { tape, error } = await loadTapeById(id);
    if (error || !tape) { alert("Couldn't load tape for editing"); return; }
    setEditTape(tape);
    setView('builder');
  }

  // ── Loading ───────────────────────────────────────────────────────────────
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

  // ── Tape player ───────────────────────────────────────────────────────────
  if (view === 'player' && tape) {
    return (
      <>
        <TapePlayer
          tape={tape}
          user={user}
          onSignInRequest={() => setShowAuth(true)}
          onMakeOwn={() => {
            window.history.replaceState({}, '', '/');
            setTape(null);
            setView('splash');
          }}
          onClearSaved={() => {
            localStorage.removeItem('mixtape_saved');
            setTape(null);
            setView('splash');
          }}
        />
        {showAuth    && <AuthModal    onClose={() => setShowAuth(false)} />}
        {showLibrary && <MyLibrary user={user} onClose={() => setShowLibrary(false)} onPlay={openTapeInPlayer} onEdit={openTapeInBuilder} />}
      </>
    );
  }

  // ── Tape builder ──────────────────────────────────────────────────────────
  if (view === 'builder') {
    return (
      <>
        <TapeBuilder
          user={user}
          initialTape={editTape}
          onBack={() => { setEditTape(null); setView('splash'); }}
          onSignInRequest={() => setShowAuth(true)}
          onOpenLibrary={() => setShowLibrary(true)}
        />
        {showAuth    && <AuthModal    onClose={() => setShowAuth(false)} />}
        {showLibrary && <MyLibrary user={user} onClose={() => setShowLibrary(false)} onPlay={openTapeInPlayer} onEdit={openTapeInBuilder} />}
      </>
    );
  }

  // ── Splash ────────────────────────────────────────────────────────────────
  return (
    <div className="splash">
      <div className="splash-auth-bar">
        {user ? (
          <span className="auth-status">
            <button className="btn-auth-link" onClick={() => setShowLibrary(true)}>📼 Library</button>
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
      <button className="btn-start" onClick={() => { setEditTape(null); setView('builder'); }}>
        Make a Tape
      </button>
      <p className="disclaimer">Search any song from the iTunes catalogue{user ? '' : ' — no login needed'}</p>

      {showAuth    && <AuthModal    onClose={() => setShowAuth(false)} />}
      {showLibrary && <MyLibrary user={user} onClose={() => setShowLibrary(false)} onPlay={openTapeInPlayer} onEdit={openTapeInBuilder} />}
    </div>
  );
}
