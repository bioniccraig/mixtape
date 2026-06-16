import { useState, useEffect } from 'react';
import TapeBuilder    from './TapeBuilder';
import TapePlayer     from './TapePlayer';
import CassetteSVG   from './Cassette';
import AuthModal     from './AuthModal';
import MyLibrary     from './MyLibrary';
import InlineLibrary from './InlineLibrary';
import Legal         from './Legal';
import { getSharedTape } from './share';
import { loadTapeByShareId, loadTapeById, recordTapeView } from './db';
import { useAuth } from './useAuth';
import { supabase } from './supabase';
import { useInstallPrompt } from './useInstallPrompt';
import './App.css';

// ── Detect /t/SHAREID path ────────────────────────────────────────────────────
function getShareIdFromPath() {
  const m = window.location.pathname.match(/^\/t\/([a-z0-9]+)$/i);
  return m ? m[1] : null;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  // Render legal page immediately — no auth or state needed
  if (window.location.pathname === '/legal') return <Legal />;
  const { user, loading: authLoading } = useAuth();
  const { canInstall, isInstalled, isIos, install } = useInstallPrompt();

  const shareId  = getShareIdFromPath();
  const hashTape = getSharedTape();

  const [view,         setView]         = useState(() => (shareId || hashTape) ? 'player' : 'splash');
  const [tape,         setTape]         = useState(() => hashTape);
  const [editTape,     setEditTape]     = useState(null);   // tape to open in builder for editing
  const [tapeLoading,  setTapeLoading]  = useState(!!shareId);
  const [showAuth,     setShowAuth]     = useState(false);
  const [showLibrary,  setShowLibrary]  = useState(false);

  // ── Fetch DB tape for /t/SHAREID (runs once per shareId) ─────────────────
  useEffect(() => {
    if (!shareId) return;
    setTapeLoading(true);
    loadTapeByShareId(shareId).then(({ tape: t, error }) => {
      if (t) {
        setTape(t);
        setView('player');
      } else {
        console.error('Failed to load tape:', error);
        setView('splash');
      }
      setTapeLoading(false);
    });
  }, [shareId]); // eslint-disable-line

  // ── Record view when user is available (sign-in after loading, or already signed in) ──
  useEffect(() => {
    if (!user || !tape?.dbId) return;
    if (tape.creatorId && tape.creatorId === user.id) return; // own tape — don't record
    recordTapeView(tape.dbId, user.id);
  }, [user?.id, tape?.dbId]); // eslint-disable-line

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

  // ── Splash — signed in ───────────────────────────────────────────────────
  if (user) {
    return (
      <div className="splash splash-home">
        {/* Top bar */}
        <div className="splash-auth-bar">
          <span className="auth-status">
            <span className="auth-email">{user.email}</span>
            <button className="btn-auth-link" onClick={signOut}>Sign out</button>
          </span>
        </div>

        {/* Two-pane home layout */}
        <div className="home-layout">

          {/* ── Left / top: Create CTA ── */}
          <div className="home-create-pane">
            <div className="splash-hero">
              <CassetteSVG skin="rainbow" title="MIXTAPE" spinning={false} />
            </div>
            <div className="logo">
              <span className="logo-icon">◼</span>
              <span className="logo-text">MixTape</span>
            </div>
            <p className="tagline">Say It With Music</p>
            <button className="btn-start" onClick={() => { setEditTape(null); setView('builder'); }}>
              + Create a Tape
            </button>
            <p className="disclaimer">Create · Personalise · Share</p>
            <div className="splash-platforms">
              <span className="splash-platform-label">Plays via</span>
              <span className="splash-platform-badge yt">▶ YouTube</span>
              <span className="splash-platform-badge am">♫ Apple Music</span>
            </div>
          </div>

          {/* ── Right / bottom: Library ── */}
          <div className="home-library-pane">
            <InlineLibrary
              user={user}
              onPlay={t => { openTapeInPlayer(t); }}
              onEdit={t => { openTapeInBuilder(t); }}
            />
          </div>

        </div>

        {/* Install prompt */}
        {!isInstalled && (canInstall || isIos) && (
          <div className="install-banner">
            {canInstall ? (
              <>
                <span className="install-banner-text">📲 Add MixTape to your home screen</span>
                <button className="install-banner-btn" onClick={install}>Install</button>
              </>
            ) : (
              <span className="install-banner-text">
                📲 To install: tap <strong>Share</strong> → <strong>Add to Home Screen</strong>
              </span>
            )}
          </div>
        )}

        <footer className="splash-footer">
          <a href="/legal#privacy">Privacy Policy</a>
          <span className="splash-footer-sep">·</span>
          <a href="/legal#terms">Terms of Service</a>
        </footer>

        {showAuth    && <AuthModal    onClose={() => setShowAuth(false)} />}
        {showLibrary && <MyLibrary user={user} onClose={() => setShowLibrary(false)} onPlay={openTapeInPlayer} onEdit={openTapeInBuilder} />}
      </div>
    );
  }

  // ── Splash — signed out ───────────────────────────────────────────────────
  return (
    <div className="splash">
      <div className="splash-hero">
        <CassetteSVG skin="rainbow" title="MIXTAPE" spinning={false} />
      </div>
      <div className="logo">
        <span className="logo-icon">◼</span>
        <span className="logo-text">MixTape</span>
      </div>
      <p className="tagline">Say It With Music</p>
      <button className="btn-start" onClick={() => setShowAuth(true)}>
        Sign in / Sign up
      </button>
      <p className="splash-email-hint">Sign in with just your email address — no password needed</p>
      <p className="disclaimer">Create, Personalise, Share</p>

      <div className="splash-platforms">
        <span className="splash-platform-label">Plays via</span>
        <span className="splash-platform-badge yt">▶ YouTube</span>
        <span className="splash-platform-badge am">♫ Apple Music</span>
      </div>

      {/* Install prompt */}
      {!isInstalled && (canInstall || isIos) && (
        <div className="install-banner">
          {canInstall ? (
            <>
              <span className="install-banner-text">📲 Add MixTape to your home screen</span>
              <button className="install-banner-btn" onClick={install}>Install</button>
            </>
          ) : (
            <span className="install-banner-text">
              📲 To install: tap <strong>Share</strong> → <strong>Add to Home Screen</strong>
            </span>
          )}
        </div>
      )}

      <footer className="splash-footer">
        <a href="/legal#privacy">Privacy Policy</a>
        <span className="splash-footer-sep">·</span>
        <a href="/legal#terms">Terms of Service</a>
      </footer>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}
