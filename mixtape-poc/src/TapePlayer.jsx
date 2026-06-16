import { useState, useEffect, useRef } from 'react';
import JCard from './JCard';
import FrontCover from './FrontCover';
import CassetteSVG from './Cassette';
import ReactionButton from './ReactionButton';
import CommentsPanel from './CommentsPanel';
import { getReactionState } from './db';
import { useYouTube } from './useYouTube';
import { useAppleMusic } from './useAppleMusic';
import EngineToggle from './EngineToggle';
import MatchModal from './MatchModal';
import AppleMatchModal from './AppleMatchModal';
import NotificationBell from './NotificationBell';
import { logEvent, getTapeId, loadTapeById } from './db';
import { searchYouTube } from './matching';

// ── Interactive match badge for received tapes ───────────────────────────────
function PlayerBadge({ track, engine, onClick }) {
  const status = engine === 'apple' ? (track.appleStatus || 'pending') : (track.ytStatus || 'pending');
  const service = engine === 'apple' ? 'Apple Music' : 'YouTube';

  if (status === 'pending') return null;

  let cls = 'match-badge' + (engine === 'apple' ? ' apple-badge' : '');
  let icon, tip;
  if (status === 'ok') {
    cls += ' ok';
    icon = '✓';
    tip = `${service} match found — tap to review or change`;
  } else if (status === 'none' || status === 'error') {
    cls += ' none';
    icon = '!';
    tip = `No ${service} match — tap to find one`;
  } else {
    return null;
  }

  return (
    <button className={cls} title={tip} onClick={onClick}>
      <span className="badge-service">{service}</span>
      <span className="badge-icon">{icon}</span>
    </button>
  );
}

// Generate (or reuse) a session UUID stored in sessionStorage.
// Groups multiple events from the same browser session together in analytics.
function getSessionId() {
  const key = 'mixtape_session_id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export default function TapePlayer({ tape, onMakeOwn, isSaved, onClearSaved, user, onSignInRequest }) {
  const [tracksA,   setTracksA]   = useState(tape.sideA);
  const [tracksB,   setTracksB]   = useState(tape.sideB);
  const [enriched,  setEnriched]  = useState(false);
  const [playing,   setPlaying]   = useState(false);
  const [paused,    setPaused]    = useState(false);
  const [playingSide,  setPlayingSide]  = useState('A');
  const [playingIndex, setPlayingIndex] = useState(0);
  const [showJCard,    setShowJCard]    = useState(true);   // sleeve visible by default
  const [showComments, setShowComments] = useState(true);
  const [toast,        setToast]        = useState(null);
  const [engine,       setEngine]       = useState('youtube'); // 'youtube' | 'apple'
  const [creatorLikes, setCreatorLikes] = useState(0); // like count shown to creator (read-only)
  const [reviewingYt,    setReviewingYt]    = useState(null); // { track, side }
  const [reviewingApple, setReviewingApple] = useState(null); // { track, side }
  const [shareCopied,    setShareCopied]    = useState(false);

  // ── Load like count for creator's own tape view (read-only) ──────────────────
  const isCreator = !!(user && tape.creatorId && tape.creatorId === user.id);
  useEffect(() => {
    if (!isCreator || !tape.dbId) return;
    getReactionState(tape.dbId, null).then(({ count }) => setCreatorLikes(count));
  }, [isCreator, tape.dbId]); // eslint-disable-line

  // ── Show "saved" toast when user signs in while viewing a received tape ─────
  // prevUserRef is initialised with the current user so first-render is skipped.
  const prevUserRef = useRef(user);
  useEffect(() => {
    const prevUser = prevUserRef.current;
    prevUserRef.current = user;
    if (user && !prevUser && tape?.dbId && tape.creatorId !== user.id) {
      showMsg('✅ Tape saved to your library!');
    }
  }, [user]); // eslint-disable-line

  // ── Analytics: fire tape_opened on mount ─────────────────────────────────
  useEffect(() => {
    if (!tape.shareId) return; // hash-based shares don't have a DB id yet
    const sessionId = getSessionId();
    getTapeId(tape.shareId).then(tapeId => {
      if (!tapeId) return;
      logEvent({
        tapeId,
        eventType: 'tape_opened',
        sessionId,
        viewerId: user?.id || null,
      });
    });
  }, []); // eslint-disable-line

  // ── Advance: kept in a ref so the YouTube onEnded callback always sees fresh state ──
  const advanceRef = useRef(() => {});
  useEffect(() => {
    advanceRef.current = () => {
      const tracks = playingSide === 'A' ? tracksA : tracksB;
      if (playingIndex + 1 < tracks.length) {
        setPlayingIndex(playingIndex + 1);
      } else if (playingSide === 'A' && tracksB.length > 0) {
        showMsg('🎵 Flipping to Side B…');
        setPlayingSide('B');
        setPlayingIndex(0);
      } else {
        setPlaying(false);
        setPlayingIndex(0);
        showMsg('🎵 End of tape');
        // Analytics: tape_completed
        if (tape.shareId) {
          getTapeId(tape.shareId).then(tapeId => {
            if (tapeId) logEvent({ tapeId, eventType: 'tape_completed', sessionId: getSessionId(), viewerId: user?.id || null });
          });
        }
      }
    };
  });

  // ── YouTube error handling with auto-retry on embedding-disabled (150/101) ──
  // Codes 150 & 101 = owner/Vevo disabled embedding. Instead of just skipping,
  // search for an embeddable alternative version and swap it in. Each track is
  // only retried once per session to avoid loops.
  const retriedRef = useRef(new Set());
  const ytErrorRef = useRef(() => {});
  useEffect(() => {
    ytErrorRef.current = async (code) => {
      const embedBlocked = code === 150 || code === 101;
      const tracks = playingSide === 'A' ? tracksA : tracksB;
      const track  = tracks[playingIndex];
      if (embedBlocked && track && !retriedRef.current.has(track.id)) {
        retriedRef.current.add(track.id);
        showMsg('Finding another version…');
        try {
          const { items } = await searchYouTube(`${track.artist} ${track.title}`);
          const alt = (items || []).find(it => it.youtubeId && it.youtubeId !== track.ytId);
          if (alt) {
            const setter = playingSide === 'A' ? setTracksA : setTracksB;
            setter(arr => arr.map((t, i) => i === playingIndex ? { ...t, ytId: alt.youtubeId } : t));
            loadedIdRef.current = `yt:${alt.youtubeId}`;
            yt.play(alt.youtubeId);
            return;
          }
        } catch { /* fall through to skip */ }
      }
      showMsg("Skipping — this track can't play here");
      advanceRef.current();
    };
  });

  const yt = useYouTube({
    elementId: 'yt-player-recipient',
    onEnded: () => advanceRef.current(),
    onError: (code) => ytErrorRef.current(code),
  });

  const am = useAppleMusic({
    onEnded: () => advanceRef.current(),
    onError: () => { showMsg("Skipping — Apple Music can't play this track"); advanceRef.current(); },
  });

  // Tracks the currently-loaded video so we only (re)load on an actual track change —
  // not on pause/resume or unrelated re-renders.
  const loadedIdRef = useRef(null);

  // ── Enrich: fetch artwork for the J-card (playback no longer needs previews) ──
  useEffect(() => {
    const all = [...tape.sideA, ...tape.sideB];
    const ids = all.map(t => t.id).filter(Boolean).join(',');
    if (!ids) { setEnriched(true); return; }

    fetch(`/api/itunes-lookup?id=${ids}`)
      .then(r => r.json())
      .then(({ results = [] }) => {
        const map = {};
        results.forEach(r => {
          map[String(r.trackId)] = {
            artwork: r.artworkUrl100?.replace('100x100bb', '300x300bb') || null,
          };
        });
        const enrich = arr => arr.map(t => ({ ...t, artwork: map[t.id]?.artwork ?? t.artwork ?? null }));
        const a = enrich(tape.sideA);
        const b = enrich(tape.sideB);
        setTracksA(a);
        setTracksB(b);
        try {
          localStorage.setItem('mixtape_saved', JSON.stringify({ ...tape, sideA: a, sideB: b, savedAt: Date.now() }));
        } catch { /* storage full / disabled */ }
      })
      .catch(() => {})
      .finally(() => setEnriched(true));
  }, []); // eslint-disable-line

  // ── Reset loaded track when engine switches so the new engine reloads it ──
  useEffect(() => {
    loadedIdRef.current = null;
    yt.stop();
    am.stop();
  }, [engine]); // eslint-disable-line

  // ── Drive the active engine off playback state ────────────────────────────
  useEffect(() => {
    if (!playing) {
      yt.stop();
      am.stop();
      loadedIdRef.current = null;
      return;
    }
    const track = (playingSide === 'A' ? tracksA : tracksB)[playingIndex];
    if (!track) { setPlaying(false); return; }

    if (engine === 'apple') {
      const amKey = `am:${track.title}|${track.artist}`;
      if (loadedIdRef.current === amKey) return;
      loadedIdRef.current = amKey;
      am.play(track.title, track.artist);
    } else {
      // YouTube
      if (!track.ytId) {
        showMsg(`Skipping "${track.title}" — no match`);
        advanceRef.current();
        return;
      }
      if (loadedIdRef.current === `yt:${track.ytId}`) return;
      loadedIdRef.current = `yt:${track.ytId}`;
      yt.play(track.ytId);
    }
  }, [playing, playingSide, playingIndex, tracksA, tracksB, engine]); // eslint-disable-line

  // Start, or pause/resume keeping position (no reload, so the spot is kept).
  function togglePlayPause() {
    if (!playing) {
      setPlayingSide('A');
      setPlayingIndex(0);
      setPaused(false);
      setPlaying(true);
      // Analytics: tape_played (first press of play)
      if (tape.shareId) {
        getTapeId(tape.shareId).then(tapeId => {
          if (tapeId) logEvent({ tapeId, eventType: 'tape_played', sessionId: getSessionId(), viewerId: user?.id || null });
        });
      }
    } else if (paused) {
      engine === 'apple' ? am.resume() : yt.resume();
      setPaused(false);
    } else {
      engine === 'apple' ? am.pause() : yt.pause();
      setPaused(true);
    }
  }

  function stop() {
    setPlaying(false);
    setPaused(false);
    setPlayingIndex(0);
    setPlayingSide('A');
  }

  function next() {
    if (!playing) return;
    setPaused(false);
    advanceRef.current();
  }

  function prev() {
    if (!playing) return;
    setPaused(false);
    if (playingIndex > 0) setPlayingIndex(playingIndex - 1);
    else if (playingSide === 'B' && tracksA.length > 0) {
      setPlayingSide('A');
      setPlayingIndex(tracksA.length - 1);
    } else {
      // restart the first track
      yt.play((playingSide === 'A' ? tracksA : tracksB)[0]?.ytId);
    }
  }

  function showMsg(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const nowPlaying = playing
    ? (playingSide === 'A' ? tracksA : tracksB)[playingIndex]
    : null;
  const canPlay = enriched && (engine === 'apple' ? am.ready : yt.ready);

  // Auto-art: first track with artwork after enrichment
  const autoArtUrl = enriched
    ? [...tracksA, ...tracksB].find(t => t.artwork)?.artwork || null
    : null;

  // ── Share: native share sheet on mobile, clipboard fallback ─────────────────
  async function handleShare() {
    const url = tape.shareId
      ? `${window.location.origin}/t/${tape.shareId}`
      : window.location.href;
    const title = tape.tapeName ? `MixTape: ${tape.tapeName}` : 'Someone sent you a MixTape';
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; } catch { /* user cancelled */ }
    }
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    });
  }

  // Count unmatched tracks for the active engine so we can show a banner
  const unmatchedCount = [...tracksA, ...tracksB].filter(t =>
    engine === 'apple'
      ? (t.appleStatus === 'none' || t.appleStatus === 'error')
      : (t.ytStatus === 'none' || t.ytStatus === 'error')
  ).length;

  return (
    <div className="player">
      {/* ── Header ── */}
      <header className="builder-header">
        <button className="header-logo header-logo-btn" onClick={onMakeOwn} title="Back to home">
          <span className="logo-icon">◼</span>
          <span className="logo-text">MixTape</span>
        </button>
        <div className="header-actions">
          {!user && onSignInRequest && (
            <button className="btn-auth-link" onClick={onSignInRequest}>Sign in / Sign up</button>
          )}
          {user && <NotificationBell user={user} onOpenTape={async id => {
            const { tape: t } = await loadTapeById(id);
            if (t) { onMakeOwn(); setTimeout(() => window.location.assign(`/t/${t.shareId}`), 50); }
          }} />}
          {user && (
            <span className="auth-status-small">{user.email}</span>
          )}
          <button className="share-btn player-share-btn" onClick={handleShare} title="Share this tape">
            {shareCopied ? '✓ Copied!' : '⬆ Share'}
          </button>
          {tape.allowForward && (
            <button className="share-btn player-make-own-desktop" onClick={onMakeOwn}>
              Make Your Own ✦
            </button>
          )}
        </div>
      </header>

      <div className="player-body">
        <div className="player-card">

          {isSaved && (
            <div className="saved-banner">
              📼 Your saved tape
              <button className="clear-saved-btn" onClick={onClearSaved}>✕ Clear</button>
            </div>
          )}

          <p className="player-intro">
            {isCreator
              ? `You shared this${tape.createdAt ? ` on ${new Date(tape.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`
              : 'Someone sent you a tape'}
          </p>

          {/* Front cover — always visible */}
          <FrontCover
            tapeName={tape.tapeName}
            coverImageUrl={tape.coverImageUrl}
            coverColor={tape.coverColor}
            autoArtUrl={autoArtUrl}
            editable={false}
          />

          {/* Cassette — shown below front cover */}
          <div className="cassette-wrap">
            <CassetteSVG
              skin={tape.skin || tape.theme}
              title={tape.tapeName}
              spinning={playing && !paused}
            />
          </div>

          {/* Reaction — toggle for recipients, read-only count for creator */}
          {isCreator ? (
            <div className="creator-likes">
              <span>❤️</span>
              <span className="creator-likes-count">
                {creatorLikes === 0
                  ? 'No likes yet'
                  : `${creatorLikes} ${creatorLikes === 1 ? 'person loved' : 'people loved'} this tape`}
              </span>
            </div>
          ) : (
            <ReactionButton
              tapeId={tape.dbId}
              user={user}
              onSignInRequest={onSignInRequest}
            />
          )}

          {/* YouTube screen — only shown when using YouTube engine */}
          <div className={`yt-frame ${playing && engine === 'youtube' ? 'show' : ''}`}>
            <div id="yt-player-recipient" />
          </div>

          {/* Now playing */}
          {nowPlaying && (
            <div className="now-playing">
              <span className="now-playing-dot">●</span>
              <span className="now-playing-text">
                {nowPlaying.title} — {nowPlaying.artist}
              </span>
              <span className="now-playing-side">Side {playingSide}</span>
            </div>
          )}

          {/* Unmatched tracks warning */}
          {enriched && unmatchedCount > 0 && (
            <div className="player-match-warning">
              ⚠️ {unmatchedCount} track{unmatchedCount !== 1 ? 's' : ''} marked with ! won't play on {engine === 'apple' ? 'Apple Music' : 'YouTube'} — try switching engine below
            </div>
          )}

          {/* Transport controls */}
          <div className="transport">
            <button className="tp-btn" onClick={prev} disabled={!playing} title="Previous track">⏮</button>
            <button
              className="tp-btn tp-main"
              onClick={togglePlayPause}
              disabled={!canPlay}
              title={!playing ? 'Play tape' : paused ? 'Resume' : 'Pause'}
            >
              {!canPlay ? '⟳' : !playing ? '▶' : paused ? '▶' : '⏸'}
            </button>
            <button className="tp-btn" onClick={next} disabled={!playing} title="Next track">⏭</button>
            <button className="tp-btn" onClick={stop} disabled={!playing} title="Stop">⏹</button>
          </div>

          {/* Prominent Apple Music prompt — shown to subscribers not yet connected.
              Once authorised, EngineToggle auto-switches to Apple and this hides. */}
          {am.mkReady && engine !== 'apple' && !(am.authorized && am.isSubscriber) && (
            <div className="apple-connect-prompt">
              <span className="apple-connect-text">
                🎧 Have Apple Music? Connect for full-quality, official audio.
              </span>
              <button
                className="apple-connect-btn"
                onClick={() => am.authorize()}
                disabled={am.authorizing}
              >
                {am.authorizing ? 'Connecting…' : 'Connect Apple Music'}
              </button>
              {am.authError && <span className="apple-connect-err">{am.authError}</span>}
            </div>
          )}

          <EngineToggle engine={engine} onEngineChange={setEngine} am={am} />

          {!user && onSignInRequest && (
            <div className="player-signin-nudge">
              <span>Sign in to save this tape to your library</span>
              <button className="btn-auth-link" onClick={onSignInRequest}>Sign in / Sign up</button>
            </div>
          )}

          {/* View controls — Sleeve and Comments as toggles */}
          <div className="player-controls">
            <button
              className={`view-btn ${showJCard ? 'active' : ''}`}
              onClick={() => setShowJCard(v => !v)}
            >
              {showJCard ? '◼ Hide Sleeve' : '📋 View Sleeve'}
            </button>
            <button
              className={`view-btn ${showComments ? 'active' : ''}`}
              onClick={() => setShowComments(v => !v)}
            >
              💬 {showComments ? 'Hide Comments' : 'Comments'}
            </button>
          </div>

          {/* Comments — inline, right below the buttons */}
          {showComments && tape.dbId && (
            <CommentsPanel
              tapeId={tape.dbId}
              user={user}
              onSignInRequest={onSignInRequest}
            />
          )}

          {/* J-card (read-only) */}
          {showJCard && (
            <JCard
              tapeName={tape.tapeName}
              sideA={tracksA}
              sideB={tracksB}
              note={tape.note}
              readOnly={true}
            />
          )}

          {/* Track list — shown when sleeve is hidden */}
          {!showJCard && (
            <div className="player-sides">
              {[
                { side: 'A', items: tracksA },
                { side: 'B', items: tracksB },
              ].map(({ side, items }) => (
                <div key={side} className="player-side">
                  <div className="jcard-side-header">
                    <span className="jcard-side-label">Side {side}</span>
                  </div>
                  {items.length === 0
                    ? <p className="jcard-empty">Empty</p>
                    : items.map((t, i) => (
                      <div
                        key={t.id + i}
                        className={`jcard-track ${playing && playingSide === side && playingIndex === i ? 'tape-track-playing' : ''}`}
                      >
                        {t.artwork
                          ? <img src={t.artwork} alt="" className="track-art" style={{ width: 36, height: 36, borderRadius: 4, flexShrink: 0 }} />
                          : <span className="jcard-num">{i + 1}.</span>
                        }
                        <div className="jcard-track-info">
                          <span className="jcard-track-title">{t.title}</span>
                          <span className="jcard-track-artist">{t.artist}</span>
                        </div>
                        <PlayerBadge
                          track={t}
                          engine={engine}
                          onClick={() => {
                            if (engine === 'apple') setReviewingApple({ track: t, side });
                            else setReviewingYt({ track: t, side });
                          }}
                        />
                        <span className="jcard-track-dur">{t.durationLabel}</span>
                      </div>
                    ))
                  }
                </div>
              ))}
            </div>
          )}

        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {/* ── Persistent footer ── */}
      <footer className="player-footer">
        <button className="player-footer-btn" onClick={onMakeOwn}>← Home</button>
        <button className="player-footer-btn" onClick={handleShare}>
          {shareCopied ? '✓ Copied!' : '⬆ Share'}
        </button>
        {tape.allowForward && (
          <button className="player-footer-btn player-footer-make-own" onClick={onMakeOwn}>
            Make Your Own ✦
          </button>
        )}
      </footer>

      {/* YouTube version review modal (local-only, not saved to DB) */}
      {reviewingYt && (
        <MatchModal
          track={reviewingYt.track}
          side={reviewingYt.side}
          onClose={() => setReviewingYt(null)}
          onConfirm={update => {
            const { side: s, track: orig } = reviewingYt;
            const apply = arr => arr.map(t =>
              t === orig ? { ...t, ...update } : t
            );
            if (s === 'A') setTracksA(apply(tracksA));
            else           setTracksB(apply(tracksB));
            setReviewingYt(null);
          }}
        />
      )}

      {/* Apple Music version review modal (local-only, not saved to DB) */}
      {reviewingApple && (
        <AppleMatchModal
          track={reviewingApple.track}
          side={reviewingApple.side}
          storefront={am.storefront}
          onClose={() => setReviewingApple(null)}
          onConfirm={update => {
            const { side: s, track: orig } = reviewingApple;
            const apply = arr => arr.map(t =>
              t === orig ? { ...t, ...update } : t
            );
            if (s === 'A') setTracksA(apply(tracksA));
            else           setTracksB(apply(tracksB));
            setReviewingApple(null);
          }}
        />
      )}
    </div>
  );
}
