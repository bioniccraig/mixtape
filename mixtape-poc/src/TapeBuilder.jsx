import { useState, useEffect, useRef } from 'react';
import { searchTracks } from './itunes';
import { matchTrack } from './matching';
import { TAPE_SKINS, DEFAULT_SKIN, MAX_SIDE_MS } from './constants';
import CassetteSVG from './Cassette';
import JCard from './JCard';
import MatchModal from './MatchModal';
import { useYouTube } from './useYouTube';
import { useAppleMusic } from './useAppleMusic';
import EngineToggle from './EngineToggle';
import { upsertTape } from './db';
import AppleMatchModal from './AppleMatchModal';

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

// ── Apple Music match badge ───────────────────────────────────────────────────
function AppleMusicBadge({ track, onCheck }) {
  const status = track.appleStatus || 'pending';
  let cls = 'match-badge apple-badge', icon, title;
  if (status === 'none')  { cls += ' none';    icon = '!'; title = 'No Apple Music match — tap to fix'; }
  else if (status === 'error') { cls += ' none'; icon = '↻'; title = 'Apple Music lookup failed — tap to retry'; }
  else if (status === 'ok')    { cls += ' ok';   icon = ''; title = `Apple Music: ${track.appleTitle || 'matched'} — tap to change`; }
  else                         { cls += ' pending'; icon = '⟳'; title = 'Finding Apple Music version…'; }
  return (
    <button className={cls} title={title} onClick={onCheck} disabled={status === 'pending'}>
      {icon || ''}
    </button>
  );
}

// ── Tape track (on the tape) ──────────────────────────────────────────────────
function TapeTrack({ track, index, onRemove, onMove, total, isPlaying, onCheck, onAppleCheck }) {
  return (
    <div className={`tape-track ${isPlaying ? 'tape-track-playing' : ''}`}>
      <span className="tape-track-num">{isPlaying ? '▶' : index + 1}</span>
      <div className="tape-track-info">
        <span className="tape-track-title">{track.title}</span>
        <span className="tape-track-artist">{track.artist}</span>
      </div>
      <MatchBadge track={track} onCheck={onCheck} />
      <AppleMusicBadge track={track} onCheck={onAppleCheck} />
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
// initialTape: optional tape object loaded from library (for editing drafts/published)
export default function TapeBuilder({ onBack, user, onSignInRequest, onOpenLibrary, initialTape }) {
  const [skin,         setSkin]         = useState(initialTape?.skin || initialTape?.theme || DEFAULT_SKIN);
  const [tapeName,     setTapeName]     = useState(initialTape?.tapeName || '');
  const [note,         setNote]         = useState(initialTape?.note || '');
  const [activeSide,   setActiveSide]   = useState('A');
  const [sideA,        setSideA]        = useState(initialTape?.sideA || []);
  const [sideB,        setSideB]        = useState(initialTape?.sideB || []);
  const [searchArtist, setSearchArtist] = useState('');
  const [searchTrack,  setSearchTrack]  = useState('');
  const [searchAlbum,  setSearchAlbum]  = useState('');
  const [results,      setResults]      = useState([]);
  const [searching,    setSearching]    = useState(false);
  const [playing,      setPlaying]      = useState(false);
  const [paused,       setPaused]       = useState(false);
  const [playingSide,  setPlayingSide]  = useState('A');
  const [playingIndex, setPlayingIndex] = useState(0);
  const [showJCard,    setShowJCard]    = useState(false);
  const [toast,        setToast]        = useState(null);
  const [reviewing,      setReviewing]      = useState(null); // { side, id } — YouTube review
  const [reviewingApple, setReviewingApple] = useState(null); // { side, id } — Apple Music review
  const [engine,       setEngine]       = useState('youtube'); // 'youtube' | 'apple'

  // DB state — populated when tape has been saved
  const [dbTapeId,  setDbTapeId]  = useState(initialTape?.dbId   || null);
  const [shareId,   setShareId]   = useState(initialTape?.shareId || null);
  const [saveLabel, setSaveLabel] = useState('Save');      // 'Save' | 'Saving…' | 'Saved ✓' | 'Error'
  const [shareLabel, setShareLabel] = useState('Share 🔗'); // 'Share 🔗' | 'Saving…' | 'Copied! 🔗'

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
    onError: () => { showToast("Skipping — this track can't play here"); advanceRef.current(); },
  });

  const am = useAppleMusic({
    onEnded: () => advanceRef.current(),
    onError: () => { showToast("Skipping — Apple Music can't play this track"); advanceRef.current(); },
  });

  // Only (re)load on an actual track change — not on pause/resume or match updates.
  const loadedIdRef = useRef(null);

  // ── Reset loaded track when engine switches ───────────────────────────────
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
    const track = (playingSide === 'A' ? sideA : sideB)[playingIndex];
    if (!track) { setPlaying(false); return; }

    if (engine === 'apple') {
      const amKey = `am:${track.title}|${track.artist}`;
      if (loadedIdRef.current === amKey) return;
      loadedIdRef.current = amKey;
      am.play(track.title, track.artist, track.appleId || null);
    } else {
      if (!track.ytId) {
        showToast(`Skipping "${track.title}" — no match yet`);
        advanceRef.current();
        return;
      }
      if (loadedIdRef.current === `yt:${track.ytId}`) return;
      loadedIdRef.current = `yt:${track.ytId}`;
      yt.play(track.ytId);
    }
  }, [playing, playingSide, playingIndex, sideA, sideB, engine]); // eslint-disable-line

  function togglePlayPause() {
    if (!playing) {
      const tracks = activeSide === 'A' ? sideA : sideB;
      if (tracks.length === 0) { showToast('Add some tracks first!'); return; }
      setPlayingSide(activeSide);
      setPlayingIndex(0);
      setPaused(false);
      setPlaying(true);
    } else if (paused) {
      engine === 'apple' ? am.resume() : yt.resume();
      setPaused(false);
    } else {
      engine === 'apple' ? am.pause() : yt.pause();
      setPaused(true);
    }
  }

  function stopPlay() {
    setPlaying(false);
    setPaused(false);
    setPlayingIndex(0);
  }

  function next() {
    if (!playing) return;
    setPaused(false);
    advanceRef.current();
  }

  function prev() {
    if (!playing) return;
    setPaused(false);
    if (playingIndex > 0) {
      setPlayingIndex(playingIndex - 1);
    } else {
      // Restart first track — clear loadedIdRef so the effect reloads it
      loadedIdRef.current = null;
    }
  }

  // ── Search ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const hasQuery = searchArtist.trim() || searchTrack.trim() || searchAlbum.trim();
    if (!hasQuery) { setResults([]); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchTracks({ artist: searchArtist, track: searchTrack, album: searchAlbum });
        setResults(r);
      } catch (err) {
        showToast(`${err.name}: ${err.message}`);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [searchArtist, searchTrack, searchAlbum]);

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

  // Resolve Apple Music catalog ID in the background — same scoring as useAppleMusic
  // but stored on the track so the user can review/swap it before sharing.
  async function resolveAppleMatch(track, side) {
    try {
      const params = new URLSearchParams({
        term: `${track.title} ${track.artist}`,
        media: 'music',
        entity: 'song',
        limit: 10,
      });
      const res     = await fetch(`/api/itunes-search?${params}`);
      const data    = await res.json();
      const results = data.results || [];
      const lc      = s => (s || '').toLowerCase();

      function score(r) {
        const tn = lc(r.trackName), an = lc(r.artistName);
        const t  = lc(track.title), a  = lc(track.artist);
        let s = 0;
        if (an === a)                        s += 10; else if (an.includes(a) || a.includes(an)) s += 5;
        if (tn === t)                        s += 10; else if (tn.includes(t) || t.includes(tn)) s += 5;
        if (/\(live[\s,)]|\blive\b at/i.test(r.trackName))              s -= 8;
        if (/\(remix|remaster|acoustic|radio.?edit|demo\b/i.test(r.trackName)) s -= 4;
        return s;
      }

      const match = results
        .map(r => ({ r, s: score(r) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s)[0]?.r || results[0];

      if (match) {
        patchTrack(side, track.id, {
          appleId:     String(match.trackId),
          appleTitle:  match.trackName,
          appleAlbum:  match.collectionName || '',
          appleStatus: 'ok',
        });
      } else {
        patchTrack(side, track.id, { appleStatus: 'none' });
      }
    } catch {
      patchTrack(side, track.id, { appleStatus: 'error' });
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
    const withMatch = { ...track, ytStatus: 'pending', ytConfirmed: false, appleStatus: 'pending', appleId: null, appleTitle: '' };
    if (side === 'A') setSideA(p => [...p, withMatch]);
    else              setSideB(p => [...p, withMatch]);
    setActiveSide(side);
    showToast(`Added "${track.title}" to Side ${side}`);
    resolveMatch(track, side);
    resolveAppleMatch(track, side);
  }

  // Retry matching for a track that errored, before opening the review modal.
  function openReview(side, track) {
    if (track.ytStatus === 'error') resolveMatch(track, side);
    setReviewing({ side, id: track.id });
  }

  function openAppleReview(side, track) {
    if (track.appleStatus === 'error') resolveAppleMatch(track, side);
    setReviewingApple({ side, id: track.id });
  }

  const reviewingTrack = reviewing
    ? (reviewing.side === 'A' ? sideA : sideB).find(t => t.id === reviewing.id)
    : null;

  const reviewingAppleTrack = reviewingApple
    ? (reviewingApple.side === 'A' ? sideA : sideB).find(t => t.id === reviewingApple.id)
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

  // ── Save (draft) ────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!user) { onSignInRequest(); return; }
    setSaveLabel('Saving…');
    const { id, shareId: sid, error } = await upsertTape({
      id: dbTapeId, tapeName, skin, note, sideA, sideB,
      creatorId: user.id, status: 'draft',
    });
    if (error) {
      setSaveLabel('Error');
      showToast(`Couldn't save: ${error}`);
      setTimeout(() => setSaveLabel('Save'), 2000);
      return;
    }
    setDbTapeId(id);
    setShareId(sid);
    setSaveLabel('Saved ✓');
    setTimeout(() => setSaveLabel('Save'), 2000);
  }

  // ── Share (publish + copy link) ──────────────────────────────────────────────
  async function handleShare() {
    if (needsAttention > 0) {
      const ok = window.confirm(
        `${needsAttention} track${needsAttention !== 1 ? 's' : ''} ${needsAttention !== 1 ? "don't" : "doesn't"} have a playable match yet and won't play for the recipient. Tap the ! badge to fix, or share anyway?`
      );
      if (!ok) return;
    }

    // Not signed in — prompt sign in (no guest sharing)
    if (!user) {
      onSignInRequest();
      showToast('Sign in to share your tape and get a link.');
      return;
    }

    // Signed in — upsert as published and copy short link
    setShareLabel('Saving…');
    const { id, shareId: sid, error } = await upsertTape({
      id: dbTapeId, tapeName, skin, note, sideA, sideB,
      creatorId: user.id, status: 'published',
    });
    if (error) {
      setShareLabel('Share 🔗');
      showToast(`Couldn't save tape: ${error}`);
      return;
    }
    setDbTapeId(id);
    setShareId(sid);
    const url = `${window.location.origin}/t/${sid}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this link:', url);
    }
    setShareLabel('Copied! 🔗');
    setTimeout(() => setShareLabel('Share 🔗'), 2500);
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
          {user ? (
            <>
              <button className="btn-library" onClick={onOpenLibrary} title="My Library">
                📼 Library
              </button>
              <span className="auth-status-small">{user.email}</span>
            </>
          ) : (
            <button className="btn-auth-link" onClick={onSignInRequest} title="Sign in to save tapes">
              Sign in
            </button>
          )}
          {hasTracks && user && (
            <button className="save-btn" onClick={handleSave} title="Save as draft">
              {saveLabel}
            </button>
          )}
          {hasTracks && (
            <button className="share-btn" onClick={handleShare} title="Copy share link">
              {shareLabel}
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
                  skin={skin}
                  title={tapeName.toUpperCase() || 'MY MIXTAPE'}
                  spinning={playing}
                />
              </div>

              {/* YouTube screen — only shown when using YouTube engine */}
              <div className={`yt-frame ${playing && engine === 'youtube' ? 'show' : ''}`}>
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

              <div className="transport">
                <button className="tp-btn" onClick={prev} disabled={!playing} title="Previous track">⏮</button>
                <button
                  className="tp-btn tp-main"
                  onClick={togglePlayPause}
                  disabled={engine === 'apple' ? (!am.ready && !playing) : (!yt.ready && !playing)}
                  title={!playing ? `Play Side ${activeSide}` : paused ? 'Resume' : 'Pause'}
                >
                  {(!yt.ready && engine === 'youtube' && !playing) || (!am.ready && engine === 'apple' && !playing) ? '⟳' : !playing ? '▶' : paused ? '▶' : '⏸'}
                </button>
                <button className="tp-btn" onClick={next} disabled={!playing} title="Next track">⏭</button>
                <button className="tp-btn" onClick={stopPlay} disabled={!playing} title="Stop">⏹</button>
              </div>

              <EngineToggle engine={engine} onEngineChange={setEngine} am={am} />

              <div className="skin-picker">
                {TAPE_SKINS.map(sk => (
                  <button
                    key={sk.id}
                    className={`skin-thumb ${skin === sk.id ? 'active' : ''}`}
                    onClick={() => setSkin(sk.id)}
                    title={sk.name}
                  >
                    <img src={sk.body} alt={sk.name} draggable="false" />
                  </button>
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
                  onAppleCheck={() => openAppleReview(activeSide, t)}
                />
              ))
            }
          </div>
        </div>

        {/* ── Right: Search ── */}
        <div className={`panel panel-search ${mobilePanel !== 'search' ? 'mobile-hide' : ''}`}>
          <div className="search-header">
            <div className="search-fields">
              <div className="search-field">
                <label className="search-field-label">Artist</label>
                <input
                  className="search-input"
                  value={searchArtist}
                  onChange={e => setSearchArtist(e.target.value)}
                  placeholder="e.g. Neil Young"
                  autoFocus
                />
              </div>
              <div className="search-field">
                <label className="search-field-label">Track</label>
                <input
                  className="search-input"
                  value={searchTrack}
                  onChange={e => setSearchTrack(e.target.value)}
                  placeholder="e.g. Harvest Moon"
                />
              </div>
              <div className="search-field">
                <label className="search-field-label">Album</label>
                <input
                  className="search-input"
                  value={searchAlbum}
                  onChange={e => setSearchAlbum(e.target.value)}
                  placeholder="e.g. Harvest"
                />
              </div>
            </div>
            {searching && <span className="searching-spinner">⟳</span>}
          </div>

          <div className="track-list">
            {results.length === 0 && !searching && (
              <p className="empty-search">
                {(searchArtist || searchTrack || searchAlbum) ? 'No results found.' : 'Fill in any field above to search…'}
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

      {reviewingAppleTrack && (
        <AppleMatchModal
          track={reviewingAppleTrack}
          side={reviewingApple.side}
          onClose={() => setReviewingApple(null)}
          onConfirm={fields => {
            patchTrack(reviewingApple.side, reviewingApple.id, fields);
            setReviewingApple(null);
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
