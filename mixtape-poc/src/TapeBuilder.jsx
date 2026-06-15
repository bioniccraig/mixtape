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
import { upsertTape, uploadCoverPhoto } from './db';
import AppleMatchModal from './AppleMatchModal';
import FrontCover from './FrontCover';

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

// ── Match badge — shows YouTube or Apple Music match state with a text label ──
// Rendered as a small "YouTube ✓" / "Apple Music !" chip so users know what it does.

function MatchBadge({ track, onCheck }) {
  const status = track.ytStatus || 'pending';
  let cls = 'match-badge', icon, tip;
  if (status === 'none')                       { cls += ' none';      icon = '!'; tip = 'No YouTube match found — tap to search manually'; }
  else if (status === 'error')                 { cls += ' none';      icon = '↻'; tip = 'YouTube match failed — tap to retry'; }
  else if (status === 'ok' && track.ytConfirmed) { cls += ' confirmed'; icon = '✓'; tip = 'YouTube version confirmed'; }
  else if (status === 'ok')                    { cls += ' ok';        icon = '✓'; tip = 'YouTube version found — tap to review or change'; }
  else                                         { cls += ' pending';   icon = '⟳'; tip = 'Finding YouTube version…'; }
  return (
    <button className={cls} title={tip} onClick={onCheck} disabled={status === 'pending'}>
      <span className="badge-service">YouTube</span>
      <span className="badge-icon">{icon}</span>
    </button>
  );
}

function AppleMusicBadge({ track, onCheck }) {
  const status = track.appleStatus || 'pending';
  let cls = 'match-badge apple-badge', icon, tip;
  if (status === 'none')        { cls += ' none';    icon = '!'; tip = 'No Apple Music version found — tap to search manually'; }
  else if (status === 'error')  { cls += ' none';    icon = '↻'; tip = 'Apple Music lookup failed — tap to retry'; }
  else if (status === 'ok')     { cls += ' ok';      icon = '✓'; tip = `Apple Music version: ${track.appleTitle || 'found'} — tap to review or change`; }
  else                          { cls += ' pending'; icon = '⟳'; tip = 'Finding Apple Music version…'; }
  return (
    <button className={cls} title={tip} onClick={onCheck} disabled={status === 'pending'}>
      <span className="badge-service">Apple Music</span>
      <span className="badge-icon">{icon}</span>
    </button>
  );
}

// ── Tape track (on the tape) ──────────────────────────────────────────────────
// Only shows the badge for the active engine so the UI stays uncluttered.
function TapeTrack({ track, index, onRemove, onMove, total, isPlaying, onCheck, onAppleCheck, engine }) {
  return (
    <div className={`tape-track ${isPlaying ? 'tape-track-playing' : ''}`}>
      <span className="tape-track-num">{isPlaying ? '▶' : index + 1}</span>
      <div className="tape-track-info">
        <span className="tape-track-title">{track.title}</span>
        <span className="tape-track-artist">{track.artist}</span>
      </div>
      {engine === 'youtube' && <MatchBadge      track={track} onCheck={onCheck} />}
      {engine === 'apple'   && <AppleMusicBadge track={track} onCheck={onAppleCheck} />}
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
  const [attentionPanel, setAttentionPanel] = useState(null); // null | { tracks, onProceed }

  // Cover state
  const [coverImageUrl, setCoverImageUrl] = useState(initialTape?.coverImageUrl || null);
  const [coverColor,    setCoverColor]    = useState(initialTape?.coverColor    || null);
  const [coverUploading, setCoverUploading] = useState(false);

  // DB state — populated when tape has been saved
  const [dbTapeId,  setDbTapeId]  = useState(initialTape?.dbId   || null);
  const [shareId,   setShareId]   = useState(initialTape?.shareId || null);
  const [saveLabel,   setSaveLabel]   = useState('Save');
  const [shareLabel,  setShareLabel]  = useState('Copy link 🔗');
  const [nativeLabel, setNativeLabel] = useState('Share 📤');

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
  const { storefront } = am; // user's iTunes store country — used in Apple Music searches

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

  // Auto-art: first track artwork from iTunes search results
  const autoArtUrl = [...sideA, ...sideB].find(t => t.artwork)?.artwork || null;

  // Cover photo upload handler
  async function handleCoverPhoto(file) {
    if (!file) { setCoverImageUrl(null); return; }
    if (!user) { onSignInRequest(); return; }
    setCoverUploading(true);
    showToast('Uploading cover photo…');
    const { url, error } = await uploadCoverPhoto(file, user.id);
    setCoverUploading(false);
    if (error) { showToast(`Upload failed: ${error}`); return; }
    setCoverImageUrl(url);
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

  // Resolve Apple Music catalog ID in the background using the Apple Music Catalog API
  // (same backend as the Apple Music app — returns studio versions reliably).
  async function resolveAppleMatch(track, side) {
    try {
      const params = new URLSearchParams({ term: track.title, storefront, limit: 20 });
      const res    = await fetch(`/api/apple-search?${params}`);
      const data   = await res.json();
      const songs  = data.songs || [];
      const lc     = s => (s || '').toLowerCase();

      function score(r) {
        const tn = lc(r.name), an = lc(r.artistName);
        const t  = lc(track.title), a  = lc(track.artist);
        const artistScore = an === a ? 10 : (an.includes(a) || a.includes(an)) ? 5 : -99;
        if (artistScore < 0) return -99;
        let s = artistScore;
        if (tn === t)                        s += 10; else if (tn.includes(t) || t.includes(tn)) s += 5;
        if (/\(live[\s,)]|\blive\b at/i.test(r.name))                    s -= 8;
        if (/\(remix|remaster|acoustic|radio.?edit|demo\b/i.test(r.name)) s -= 4;
        return s;
      }

      const match = songs
        .map(r => ({ r, s: score(r) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s)[0]?.r || songs[0];

      if (match) {
        patchTrack(side, track.id, {
          appleId:     String(match.id),
          appleTitle:  match.name,
          appleAlbum:  match.albumName || '',
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
  // Only flag mismatches for the currently active playback engine.
  const needsAttention = [...sideA, ...sideB].filter(t =>
    engine === 'youtube'
      ? (t.ytStatus === 'none' || t.ytStatus === 'error')
      : (t.appleStatus === 'none' || t.appleStatus === 'error')
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
      creatorId: user.id, status: 'draft', coverImageUrl, coverColor,
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
  // ── Shared publish helper — saves tape and returns the share URL ──────────
  async function publishTape() {
    if (needsAttention > 0) {
      // Build list of problem tracks with their side label
      const problemTracks = [
        ...sideA.map(t => ({ ...t, side: 'A' })),
        ...sideB.map(t => ({ ...t, side: 'B' })),
      ].filter(t =>
        engine === 'youtube'
          ? (t.ytStatus === 'none' || t.ytStatus === 'error')
          : (t.appleStatus === 'none' || t.appleStatus === 'error')
      );
      // Show panel and wait for user decision
      const ok = await new Promise(resolve => {
        setAttentionPanel({ tracks: problemTracks, onProceed: resolve });
      });
      setAttentionPanel(null);
      if (!ok) return null;
    }
    if (!user) {
      onSignInRequest();
      showToast('Sign in to share your tape.');
      return null;
    }
    const { id, shareId: sid, error } = await upsertTape({
      id: dbTapeId, tapeName, skin, note, sideA, sideB,
      creatorId: user.id, status: 'published', coverImageUrl, coverColor,
    });
    if (error) { showToast(`Couldn't save tape: ${error}`); return null; }
    setDbTapeId(id);
    setShareId(sid);
    return `${window.location.origin}/t/${sid}`;
  }

  async function handleShare() {
    setShareLabel('Saving…');
    const url = await publishTape();
    if (!url) { setShareLabel('Copy link 🔗'); return; }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this link:', url);
    }
    setShareLabel('Copied! 🔗');
    setTimeout(() => setShareLabel('Copy link 🔗'), 2500);
  }

  async function handleNativeShare() {
    setNativeLabel('Saving…');
    const url = await publishTape();
    if (!url) { setNativeLabel('Share 📤'); return; }
    const name = tapeName ? `"${tapeName}"` : 'a mixtape';
    if (navigator.share) {
      try {
        await navigator.share({
          title: name,
          text: `I made you ${name} 🎵`,
          url,
        });
      } catch (e) {
        // user cancelled — do nothing
      }
    } else {
      // fallback: open WhatsApp (desktop where Web Share API isn't supported)
      const text = `I made you ${name} 🎵 Listen here: ${url}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
    setNativeLabel('Share 📤');
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
            <button className="save-btn hide-mobile" onClick={handleSave} title="Save as draft">
              {saveLabel}
            </button>
          )}
          {hasTracks && (
            <button className="share-btn hide-mobile" onClick={handleShare} title="Copy share link">
              {shareLabel}
            </button>
          )}
          {hasTracks && (
            <button className="native-share-btn hide-mobile" onClick={handleNativeShare} title="Share">
              {nativeLabel}
            </button>
          )}
          <button className="logout-btn hide-mobile" onClick={onBack}>← Back</button>
        </div>
      </header>

      {/* ── Mobile bottom action bar ── */}
      <div className="mobile-action-bar">
        <button className="mob-back-btn" onClick={onBack}>← Back</button>
        {hasTracks && user && (
          <button className="save-btn" onClick={handleSave}>{saveLabel}</button>
        )}
        {hasTracks && (
          <button className="share-btn" onClick={handleShare}>{shareLabel}</button>
        )}
        {hasTracks && (
          <button className="native-share-btn" onClick={handleNativeShare}>{nativeLabel}</button>
        )}
      </div>

      <div className="builder-body">
        {/* ── Mobile tab bar (hidden on desktop via CSS) ── */}
        <div className="mobile-tabs">
          <button
            className={`mobile-tab ${mobilePanel === 'tape' ? 'active' : ''} ${hasTracks ? 'has-tracks' : ''}`}
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

          {/* ── Front cover — always visible ── */}
          <FrontCover
            tapeName={tapeName}
            skin={skin}
            coverImageUrl={coverUploading ? null : coverImageUrl}
            coverColor={coverColor}
            autoArtUrl={autoArtUrl}
            editable={true}
            onPhotoChange={handleCoverPhoto}
            onColorChange={setCoverColor}
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
                  engine={engine}
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
          storefront={storefront}
          onClose={() => setReviewingApple(null)}
          onConfirm={fields => {
            patchTrack(reviewingApple.side, reviewingApple.id, fields);
            setReviewingApple(null);
          }}
        />
      )}

      {attentionPanel && (
        <div className="attention-overlay">
          <div className="attention-modal">
            <h3>⚠️ Unmatched tracks</h3>
            <p>These tracks don't have a playable {engine === 'youtube' ? 'YouTube' : 'Apple Music'} match. Tap a track to jump to it and fix the badge, or share anyway.</p>
            <ul className="attention-track-list">
              {attentionPanel.tracks.map(t => (
                <li key={t.id} className="attention-track-item"
                  onClick={() => {
                    setActiveSide(t.side);
                    attentionPanel.onProceed(false);
                  }}
                >
                  <span className="attention-side-badge">Side {t.side}</span>
                  <span className="attention-track-name">{t.title}</span>
                  <span className="attention-track-artist">{t.artist}</span>
                </li>
              ))}
            </ul>
            <div className="attention-actions">
              <button className="attention-fix-btn" onClick={() => {
                setActiveSide(attentionPanel.tracks[0].side);
                attentionPanel.onProceed(false);
              }}>
                Go fix
              </button>
              <button className="attention-share-btn" onClick={() => attentionPanel.onProceed(true)}>
                Share anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
