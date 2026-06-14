import { useState, useEffect, useRef } from 'react';
import CassetteSVG from './Cassette';
import JCard from './JCard';

export default function TapePlayer({ tape, onMakeOwn, isSaved, onClearSaved }) {
  const [tracksA,   setTracksA]   = useState(tape.sideA);
  const [tracksB,   setTracksB]   = useState(tape.sideB);
  const [enriched,  setEnriched]  = useState(false);
  const [playing,   setPlaying]   = useState(false);
  const [playingSide,  setPlayingSide]  = useState('A');
  const [playingIndex, setPlayingIndex] = useState(0);
  const [showJCard, setShowJCard] = useState(false);
  const [toast,     setToast]     = useState(null);
  const audioRef = useRef(null);

  const sideAMs = tape.sideA.reduce((t, x) => t + x.durationMs, 0);
  const sideBMs = tape.sideB.reduce((t, x) => t + x.durationMs, 0);

  // ── Enrich: fetch artwork + previewUrl for all tracks, save to localStorage ──
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
            artwork:    r.artworkUrl100?.replace('100x100bb', '300x300bb') || null,
            previewUrl: r.previewUrl || null,
          };
        });

        const enrich = arr => arr.map(t => ({
          ...t,
          artwork:    map[t.id]?.artwork    ?? t.artwork    ?? null,
          previewUrl: map[t.id]?.previewUrl ?? t.previewUrl ?? null,
        }));

        const a = enrich(tape.sideA);
        const b = enrich(tape.sideB);
        setTracksA(a);
        setTracksB(b);

        // Persist so the tape survives navigation
        try {
          localStorage.setItem('mixtape_saved', JSON.stringify({
            ...tape, sideA: a, sideB: b, savedAt: Date.now(),
          }));
        } catch {}
      })
      .catch(() => {})
      .finally(() => setEnriched(true));
  }, []); // eslint-disable-line

  // ── Audio playback ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) { audioRef.current?.pause(); return; }

    const tracks = playingSide === 'A' ? tracksA : tracksB;
    const track  = tracks[playingIndex];
    if (!track) { setPlaying(false); return; }

    if (!track.previewUrl) {
      showMsg(`Skipping "${track.title}" — no preview`);
      advance(playingSide, playingIndex);
      return;
    }

    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    audio.src = track.previewUrl;
    audio.play().catch(() => showMsg('Preview unavailable'));

    const onEnded = () => advance(playingSide, playingIndex);
    audio.addEventListener('ended', onEnded);
    return () => audio.removeEventListener('ended', onEnded);
  }, [playing, playingSide, playingIndex, tracksA, tracksB]); // eslint-disable-line

  useEffect(() => () => audioRef.current?.pause(), []);

  function advance(side, idx) {
    const tracks = side === 'A' ? tracksA : tracksB;
    if (idx + 1 < tracks.length) {
      setPlayingIndex(idx + 1);
    } else if (side === 'A' && tracksB.length > 0) {
      showMsg('🎵 Flipping to Side B…');
      setPlayingSide('B');
      setPlayingIndex(0);
    } else {
      setPlaying(false);
      setPlayingIndex(0);
      showMsg('🎵 End of tape');
    }
  }

  function handlePlay() {
    if (playing) {
      setPlaying(false);
      setPlayingIndex(0);
      audioRef.current?.pause();
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
              disabled={!enriched}
            >
              {!enriched ? '⟳ Loading…' : playing ? '⏹ Stop' : '▶ Play Tape'}
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
