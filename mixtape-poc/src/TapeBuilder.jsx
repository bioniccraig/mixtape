import { useState, useEffect, useRef } from 'react';
import { searchTracks } from './itunes';
import { matchTrack } from './matching';
import { TAPE_THEMES, MAX_SIDE_MS } from './constants';
import CassetteSVG from './Cassette';
import JCard from './JCard';
import MatchModal from './MatchModal';
import { useYouTube } from './useYouTube';
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

// ── Match badge — shows the YouTube-match state of a track ──────────────────────
function MatchBadge({ track, onCheck }) {
  const status = track.ytStatus || 'pending';
  let cls = 'match-badge', icon, title;
  if (status === 'none') { cls += ' none'; icon = '!'; title = 'No match — tap to fix'; }
  else if (status === 'error') { cls += ' none'; icon = '↻'; title = 'Match failed — tap to retry'; }
  else if (status === 'ok' && track.ytConfirmed) { cls += ' confirmed'; icon = '✓'; title = 'Match confirmed'; }
  else if (status === 'ok') { cls += ' ok'; icon = '✓'; title = 'Matched — tap to check'; }
  else { cls += ' pending'; icon = '⟳'; title = 'Finding a match…'; }
  return (
    <button
      className={cls}
      title={title}
      onClick={onCheck}
      disabled={status === 'pending'}
    >{icon}</button>
  );
}

// ── Tape track (on the tape) ──────────────────────────────────────────────────
function TapeTrack({ track, index, onRemove, onMove, total, isPlaying, onCheck }) {
  return (
    <div className={`tape-track ${isPlaying ? 'tape-track-playing' : ''}`}>
      <span className="tape-track-num">{isPlaying ? '▶' : index + 1}</span>
      <div className="tape-track-info">
        <span className="tape-track-title">{track.title}</span>
        <span className="tape-track-artist">{track.artist}</span>
      </div>
      <MatchBadge track={track} onCheck={onCheck} />
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
  const [reviewing,    setReviewing]    = useState(null); // { side, id }
  const searchTimer = useRef(null);

  const sideAMs = sideA.reduce((t, x) => t + x.durationMs, 0);
  const sideBMs = sideB.reduce((t, x) => t + x.durationMs, 0);

  // ── Advance (kept in a ref so the YouTube onEnded callback sees fresh state) ──
  const advanceRef = useRef(() => {});
  useEffect(() => {
    advanceRef.current = () => {
      const tracks = playingSide === 'A' ? sideA : sideB;
      if (playingIndex + 1 < tracks.length) {
        setPlayingIndex(playingIndex + 1);
      } else {
        setPlaying(false);
        setPlayingIndex(0);
        showToast(`End of Side ${playingSide}`);
      }
    };
  });

  const yt = useYouTube({
    elementId: 'yt-player-builder',
    onEnded: () => advanceRef.current(),
  });

  // ── YouTube playback ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) { yt.stop(); return; }
    const track = (playingSide === 'A' ? sideA : sideB)[playingIndex];
    if (!track) { setPlaying(false); return; }
    if (!track.ytId) {
      showToast(`Skipping "${track.title}" — no match yet`);
      advanceRef.current();
      return;
    }
    yt.play(track.ytId);
  }, [playing, playingSide, playingIndex, sideA, sideB]); // eslint-disable-line

  function handlePlay() {
    if (playing) {
      setPlaying(false);
      setPlayingIndex(0);
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
      } catch (err) {
        showToast(`${err.name}: ${err.message}`);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [search]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 6000);
  }

  // Update the match fields of one track on a given side (by track id).
  function patchTrack(side, id, fields) {
    const setter = side === 'A' ? setSideA : setSideB;
    setter(p => p.map(t => (t.id === id ? { ...t, ...fields } : t)));
  }

  // Resolve a track to its YouTube match in the background, then store the result.
  async function resolveMatch(track, side) {
    try {
      const m = await matchTrack(track);
      patchTrack(side, track.id, {
        ytId: m.youtubeId || null,
        ytTitle: m.title || '',
        ytChannel: m.artist || '',
        ytStatus: m.youtubeId ? 'ok' : 'none',
        ytConfirmed: false,
      });
    } catch {
      patchTrack(side, track.id, { ytStatus: 'error' });
    }
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
    const withMatch = { ...track, ytStatus: 'pending', ytConfirmed: false };
    if (side === 'A') setSideA(p => [...p, withMatch]);
    else              setSideB(p => [...p, withMatch]);
    setActiveSide(side);
    showToast(`Added "${track.title}" to Side ${side}`);
    resolveMatch(track, side);
  }

  // Retry matching for a track that errored, before opening the review modal.
  function openReview(side, track) {
    if (track.ytStatus === 'error') resolveMatch(track, side);
    setReviewing({ side, id: track.id });
  }

  const reviewingTrack = reviewing
    ? (reviewing.side === 'A' ? sideA : sideB).find(t => t.id === reviewing.id)
    : null;

  // Count tracks that still need attention before a clean send.
  const needsAttention = [...sideA, ...sideB].filter(
    t => t.ytStatus === 'none' || t.ytStatus === 'error'
  ).length;

  function removeTrack(side, index) {
    if (playing && side === playingSide) { setPlaying(false); }
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
    if (needsAttention > 0) {
      const ok = window.confirm(
        `${needsAttention} track${needsAttention !== 1 ? 's' : ''} ${needsAttention !== 1 ? 'don’t' : 'doesn’t'} have a playable match yet and won’t play for the recipient. Tap the ! badge to fix, or share anyway?`
      );
      if (!ok) return;
    }
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

              {/* YouTube screen — visible while playing (kept in DOM so the player can attach) */}
              <div className={`yt-frame ${playing ? 'show' : ''}`}>
                <div id="yt-player-builder" />
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
                  disabled={!yt.ready && !playing}
                >
                  {!yt.ready && !playing ? '⟳ Loading…' : playing ? '⏹ Stop' : `▶ Play Side ${activeSide}`}
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
                  onCheck={() => openReview(activeSide, t)}
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

      {reviewingTrack && (
        <MatchModal
          track={reviewingTrack}
          side={reviewing.side}
          onClose={() => setReviewing(null)}
          onConfirm={fields => {
            patchTrack(reviewing.side, reviewing.id, fields);
            setReviewing(null);
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
