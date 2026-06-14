import { useState, useEffect, useRef } from 'react';
import CassetteSVG from './Cassette';
import JCard from './JCard';
import { useYouTube } from './useYouTube';

export default function TapePlayer({ tape, onMakeOwn, isSaved, onClearSaved }) {
  const [tracksA,   setTracksA]   = useState(tape.sideA);
  const [tracksB,   setTracksB]   = useState(tape.sideB);
  const [enriched,  setEnriched]  = useState(false);
  const [playing,   setPlaying]   = useState(false);
  const [playingSide,  setPlayingSide]  = useState('A');
  const [playingIndex, setPlayingIndex] = useState(0);
  const [showJCard, setShowJCard] = useState(false);
  const [toast,     setToast]     = useState(null);

  const sideAMs = tape.sideA.reduce((t, x) => t + x.durationMs, 0);
  const sideBMs = tape.sideB.reduce((t, x) => t + x.durationMs, 0);

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
      }
    };
  });

  const yt = useYouTube({
    elementId: 'yt-player-recipient',
    onEnded: () => advanceRef.current(),
  });

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

  // ── Drive the YouTube engine off playback state ──
  useEffect(() => {
    if (!playing) { yt.stop(); return; }
    const track = (playingSide === 'A' ? tracksA : tracksB)[playingIndex];
    if (!track) { setPlaying(false); return; }
    if (!track.ytId) {
      showMsg(`Skipping "${track.title}" — no match`);
      advanceRef.current();
      return;
    }
    yt.play(track.ytId);
  }, [playing, playingSide, playingIndex, tracksA, tracksB]); // eslint-disable-line

  function handlePlay() {
    if (playing) {
      setPlaying(false);
      setPlayingIndex(0);
    } else {
      setPlayingSide('A');
      setPlayingIndex(0);
      setPlaying(true);
    }
  }

  function showMsg(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const nowPlaying = playing
    ? (playingSide === 'A' ? tracksA : tracksB)[playingIndex]
    : null;
  const canPlay = enriched && yt.ready;

  return (
    <div className="player">
      {/* ── Header ── */}
      <header className="builder-header">
        <div className="header-logo">
          <span className="logo-icon">◼</span>
          <span className="logo-text">MixTape</span>
        </div>
        <button className="share-btn" onClick={onMakeOwn}>
          Make Your Own ✦
        </button>
      </header>

      <div className="player-body">
        <div className="player-card">

          {isSaved && (
            <div className="saved-banner">
              📼 Your saved tape
              <button className="clear-saved-btn" onClick={onClearSaved}>✕ Clear</button>
            </div>
          )}

          <p className="player-intro">Someone sent you a tape</p>

          {/* Cassette */}
          <div className="cassette-wrap" style={{ maxWidth: 360, margin: '0 auto' }}>
            <CassetteSVG
              theme={tape.theme}
              sideAMs={sideAMs}
              sideBMs={sideBMs}
              title={(tape.tapeName || 'MIXTAPE').toUpperCase()}
              spinning={playing}
            />
          </div>

          {/* YouTube screen — visible while playing (kept in DOM so the player can attach) */}
          <div className={`yt-frame ${playing ? 'show' : ''}`}>
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

          {/* Controls */}
          <div className="player-controls">
            <button
              className={`play-btn ${playing ? 'playing' : ''}`}
              onClick={handlePlay}
              disabled={!canPlay}
            >
              {!canPlay ? '⟳ Loading…' : playing ? '⏹ Stop' : '▶ Play Tape'}
            </button>
            <button
              className={`view-btn ${showJCard ? 'active' : ''}`}
              onClick={() => setShowJCard(v => !v)}
              style={{ flex: 1 }}
            >
              {showJCard ? '◼ Hide Sleeve' : '📋 View Sleeve'}
            </button>
          </div>

          {/* J-card (read-only) */}
          {showJCard && (
            <JCard
              tapeName={tape.tapeName}
              theme={tape.theme}
              sideA={tracksA}
              sideB={tracksB}
              note={tape.note}
              readOnly={true}
            />
          )}

          {/* Track list */}
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
    </div>
  );
}
