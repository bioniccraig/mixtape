import { useState, useEffect, useRef } from 'react';
import { searchTracks } from './itunes';
import { TAPE_THEMES, MAX_SIDE_MS } from './constants';
import CassetteSVG from './Cassette';
import JCard from './JCard';
import { buildShareUrl } from './share';

// ── Helpers ───────────────────────────────────────────────────────────────────
function msToMinutes(ms) {
  return (ms / 60000).toFixed(1);
}

// ── Time bar ──────────────────────────────────────────────────────────────────
function TimeBar({ usedMs, label }) {
  const pct       = Math.min((usedMs / MAX_SIDE_MS) * 100, 100);
  const colour    = pct > 90 ? '#e74c3c' : pct > 70 ? '#f39c12' : '#1abc9c';
  const remaining = MAX_SIDE_MS - usedMs;
  return (
    <div className="time-bar-wrap">
      <div className="time-bar-header">
        <span className="side-label">{label}</span>
        <span className="time-used">{msToMinutes(usedMs)} / 45 min</span>
        {remaining > 0
          ? <span className="time-left">{msToMinutes(remaining)} min left</span>
          : <span className="time-left full">Side full!</span>}
      </div>
      <div className="time-bar-bg">
        <div className="time-bar-fill" style={{ width: `${pct}%`, background: colour }} />
      </div>
    </div>
  );
}

// ── Track row (search results) ────────────────────────────────────────────────
function TrackRow({ track, onAdd, disabled }) {
  return (
    <div className="track-row">
      {track.artwork && <img src={track.artwork} alt="" className="track-art" />}
      <div className="track-info">
        <span className="track-title">{track.title}</span>
        <span className="track-artist">{track.artist}</span>
      </div>
      <span className="track-dur">{track.durationLabel}</span>
      <div className="track-actions">
        <button className="add-btn"           onClick={() => onAdd(track, 'A')} disabled={disabled.A} title="Add to Side A">A</button>
        <button className="add-btn add-btn-b" onClick={() => onAdd(track, 'B')} disabled={disabled.B} title="Add to Side B">B</button>
      </div>
    </div>
  );
}

// ── Tape track (on the tape) ──────────────────────────────────────────────────
function TapeTrack({ track, index, onRemove, onMove, total, isPlaying }) {
  return (
    <div className={`tape-track ${isPlaying ? 'tape-track-playing' : ''}`}>
      <span className="tape-track-num">{isPlaying ? '▶' : index + 1}</span>
      <div className="tape-track-info">
        <span className="tape-track-title">{track.title}</span>
        <span className="tape-track-artist">{track.artist}</span>
      </div>
      <span className="tape-track-dur">{track.durationLabel}</span>
      <div className="tape-track-controls">
        <button onClick={() => onMove(index, -1)} disabled={index === 0}           className="move-btn">↑</button>
        <button onClick={() => onMove(index,  1)} disabled={index === total - 1}   className="move-btn">↓</button>
        <button onClick={() => onRemove(index)}                                     className="remove-btn">✕</button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TapeBuilder({ onBack }) {
  const [theme,        setTheme]        = useState('yellow');
  const [tapeName,     setTapeName]     = useState('');
  const [note,         setNote]         = useState('');
  const [activeSide,   setActiveSide]   = useState('A');
  const [sideA,        setSideA]        = useState([]);
  const [sideB,        setSideB]        = useState([]);
  const [search,       setSearch]       = useState('');
  const [results,      setResults]      = useState([]);
  const [searching,    setSearching]    = useState(false);
  const [playing,      setPlaying]      = useState(false);
  const [playingSide,  setPlayingSide]  = useState('A');
  const [playingIndex, setPlayingIndex] = useState(0);
  const [showJCard,    setShowJCard]    = useState(false);
  const [toast,        setToast]        = useState(null);
  const searchTimer = useRef(null);
  const audioRef    = useRef(null);

  const sideAMs = sideA.reduce((t, x) => t + x.durationMs, 0);
  const sideBMs = sideB.reduce((t, x) => t + x.durationMs, 0);

  // ── Audio playback ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) {
      audioRef.current?.pause();
      return;
    }
    const tracks = playingSide === 'A' ? sideA : sideB;
    const track  = tracks[playingIndex];
    if (!track) { setPlaying(false); return; }

    if (!track.previewUrl) {
      showToast(`No preview for "${track.title}" — skipping`);
      advanceTrack(playingSide, playingIndex, sideA, sideB);
      return;
    }

    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    audio.src = track.previewUrl;
    audio.play().catch(() => showToast('Preview unavailable'));

    const onEnded = () => advanceTrack(playingSide, playingIndex, sideA, sideB);
    audio.addEventListener('ended', onEnded);
    return () => audio.removeEventListener('ended', onEnded);
  }, [playing, playingSide, playingIndex]); // eslint-disable-line

  // Cleanup audio on unmount
  useEffect(() => () => audioRef.current?.pause(), []);

  function advanceTrack(side, index, a, b) {
    const tracks = side === 'A' ? a : b;
    if (index + 1 < tracks.length) {
      setPlayingIndex(index + 1);
    } else {
      setPlaying(false);
      setPlayingIndex(0);
      showToast(`End of Side ${side}`);
    }
  }

  function handlePlay() {
    if (playing) {
      setPlaying(false);
      setPlayingIndex(0);
      audioRef.current?.pause();
    } else {
      const tracks = activeSide === 'A' ? sideA : sideB;
      if (tracks.length === 0) { showToast('Add some tracks first!'); return; }
      setPlayingSide(activeSide);
      setPlayingIndex(0);
      setPlaying(true);
    }
  }

  // ── Search ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchTracks(search);
        setResults(r);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [search]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  function addTrack(track, side) {
    const current = side === 'A' ? sideA : sideB;
    const usedMs  = current.reduce((t, x) => t + x.durationMs, 0);
    if (current.find(t => t.id === track.id)) {
      showToast(`"${track.title}" is already on Side ${side}`); return;
    }
    if (usedMs + track.durationMs > MAX_SIDE_MS) {
      showToast(`Side ${side} is full — remove a track or try the other side`); return;
    }
    if (side === 'A') setSideA(p => [...p, track]);
    else              setSideB(p => [...p, track]);
    setActiveSide(side);
    showToast(`Added "${track.title}" to Side ${side}`);
  }

  function removeTrack(side, index) {
    if (playing && side === playingSide) { setPlaying(false); audioRef.current?.pause(); }
    if (side === 'A') setSideA(p => p.filter((_, i) => i !== index));
    else              setSideB(p => p.filter((_, i) => i !== index));
  }

  function moveTrack(side, index, dir) {
    const arr = side === 'A' ? [...sideA] : [...sideB];
    const tgt = index + dir;
    if (tgt < 0 || tgt >= arr.length) return;
    [arr[index], arr[tgt]] = [arr[tgt], arr[index]];
    if (side === 'A') setSideA(arr);
    else              setSideB(arr);
  }

  async function handleShare() {
    const url = buildShareUrl({ tapeName, theme, sideA, sideB, note });
    try {
      await navigator.clipboard.writeText(url);
      showToast('🔗 Link copied to clipboard!');
    } catch {
      window.prompt('Copy this link:', url);
    }
  }

  const [mobilePanel, setMobilePanel] = useState('search');

  const trackList        = activeSide === 'A' ? sideA : sideB;
  const disabled         = { A: sideAMs >= MAX_SIDE_MS, B: sideBMs >= MAX_SIDE_MS };
  const hasTracks        = sideA.length > 0 || sideB.length > 0;
  const nowPlayingTrack  = playing ? (playingSide === 'A' ? sideA : sideB)[playingIndex] : null;
  const totalTracks      = sideA.length + sideB.length;

  return (
    <div className="builder">
      {/* ── Header ── */}
      <header className="builder-header">
        <div className="header-logo">
          <span className="logo-icon">◼</span>
          <span className="logo-text">MixTape</span>
        </div>
        <div className="header-actions">
          {hasTracks && (
            <button className="share-btn" onClick={handleShare} title="Share this tape">
              Share Tape 🔗
            </button>
          )}
          <button className="logout-btn" onClick={onBack}>← Back</button>
        </div>
      </header>

      <div className="builder-body">
        {/* ── Mobile tab bar (hidden on desktop via CSS) ── */}
        <div className="mobile-tabs">
          <button
            className={`mobile-tab ${mobilePanel === 'tape' ? 'active' : ''}`}
            onClick={() => setMobilePanel('tape')}
          >
            ◼ My Tape{totalTracks > 0 ? ` (${totalTracks})` : ''}
          </button>
          <button
            className={`mobile-tab ${mobilePanel === 'search' ? 'active' : ''}`}
            onClick={() => setMobilePanel('search')}
          >
            🔍 Search
          </button>
        </div>

        {/* ── Left: Tape visual + tracklist ── */}
        <div className={`panel panel-tape ${mobilePanel !== 'tape' ? 'mobile-hide' : ''}`}>

          <input
            className="tape-name-input"
            value={tapeName}
            onChange={e => setTapeName(e.target.value)}
            placeholder="Name your tape…"
            maxLength={40}
          />

          <div className="view-toggle">
            <button className={`view-btn ${!showJCard ? 'active' : ''}`} onClick={() => setShowJCard(false)}>◼ Tape</button>
            <button className={`view-btn ${showJCard  ? 'active' : ''}`} onClick={() => setShowJCard(true)}>📋 Sleeve</button>
          </div>

          {showJCard ? (
            <JCard
              tapeName={tapeName}
              theme={theme}
              sideA={sideA}
              sideB={sideB}
              note={note}
              onNoteChange={setNote}
              readOnly={false}
            />
          ) : (
            <>
              <div className="cassette-wrap">
                <CassetteSVG
                  theme={theme}
                  sideAMs={sideAMs}
                  sideBMs={sideBMs}
                  title={tapeName.toUpperCase() || 'MY MIXTAPE'}
                  spinning={playing}
                />
              </div>

              {/* Now playing ticker */}
              {playing && nowPlayingTrack && (
                <div className="now-playing">
                  <span className="now-playing-dot">●</span>
                  <span className="now-playing-text">
                    {nowPlayingTrack.title} — {nowPlayingTrack.artist}
                  </span>
                  <span className="now-playing-side">Side {playingSide}</span>
                </div>
              )}

              <div className="play-row">
                <button
                  className={`play-btn ${playing ? 'playing' : ''}`}
                  onClick={handlePlay}
                >
                  {playing ? '⏹ Stop' : `▶ Play Side ${activeSide}`}
                </button>
              </div>

              <div className="theme-picker">
                {TAPE_THEMES.map(t => (
                  <button
                    key={t.id}
                    className={`theme-dot ${theme === t.id ? 'active' : ''}`}
                    style={{ background: t.body, border: `3px solid ${theme === t.id ? '#e85d75' : 'transparent'}` }}
                    onClick={() => setTheme(t.id)}
                    title={t.label}
                  />
                ))}
              </div>

              <TimeBar usedMs={sideAMs} label="Side A" />
              <TimeBar usedMs={sideBMs} label="Side B" />
            </>
          )}

          <div className="side-toggle">
            <button className={`side-btn ${activeSide === 'A' ? 'active' : ''}`} onClick={() => setActiveSide('A')}>
              Side A · {sideA.length} track{sideA.length !== 1 ? 's' : ''}
            </button>
            <button className={`side-btn ${activeSide === 'B' ? 'active' : ''}`} onClick={() => setActiveSide('B')}>
              Side B · {sideB.length} track{sideB.length !== 1 ? 's' : ''}
            </button>
          </div>

          <div className="tape-tracklist">
            {trackList.length === 0
              ? <p className="empty-side">Side {activeSide} is empty — search for tracks to add</p>
              : trackList.map((t, i) => (
                <TapeTrack
                  key={t.id + i}
                  track={t}
                  index={i}
                  total={trackList.length}
                  isPlaying={playing && playingSide === activeSide && playingIndex === i}
                  onRemove={idx => removeTrack(activeSide, idx)}
                  onMove={(idx, dir) => moveTrack(activeSide, idx, dir)}
                />
              ))
            }
          </div>
        </div>

        {/* ── Right: Search ── */}
        <div className={`panel panel-search ${mobilePanel !== 'search' ? 'mobile-hide' : ''}`}>
          <div className="search-header">
            <input
              className="search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search for a song or artist…"
              autoFocus
            />
            {searching && <span className="searching-spinner">⟳</span>}
          </div>

          <div className="track-list">
            {results.length === 0 && !searching && (
              <p className="empty-search">
                {search ? 'No results found.' : 'Start typing to search millions of songs…'}
              </p>
            )}
            {results.map(track => (
              <TrackRow key={track.id} track={track} onAdd={addTrack} disabled={disabled} />
            ))}
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
