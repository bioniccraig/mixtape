import { useState, useEffect } from 'react';
import { loadMyTapes, getReceivedTapes, deleteTape, getReactionCounts } from './db';
import { TAPE_SKINS, DEFAULT_SKIN } from './constants';

function skinThumb(skinId) {
  const skin = TAPE_SKINS.find(s => s.id === skinId) || TAPE_SKINS.find(s => s.id === DEFAULT_SKIN);
  return skin?.body || null;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function trackCount(tape) {
  const a = Array.isArray(tape.tracks_a) ? tape.tracks_a.length : (tape.sideA?.length || 0);
  const b = Array.isArray(tape.tracks_b) ? tape.tracks_b.length : (tape.sideB?.length || 0);
  return a + b;
}

function shareUrl(shareId) {
  return `${window.location.origin}/t/${shareId}`;
}

// ── Sent tape card (published, locked) ────────────────────────────────────────
function SentCard({ tape, onPreview, onDelete, likeCount }) {
  const [confirming, setConfirming] = useState(false);
  const [copied,     setCopied]     = useState(false);
  const thumb = skinThumb(tape.skin);
  const name  = tape.tape_name || tape.tapeName || 'Untitled tape';
  const count = trackCount(tape);

  function copyLink() {
    navigator.clipboard.writeText(shareUrl(tape.share_id));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="lib-card lib-card-sent">
      <div className="lib-card-thumb" onClick={() => onPreview(tape)} style={{ cursor: 'pointer' }}>
        {thumb
          ? <img src={thumb} alt={name} />
          : <div className="lib-card-thumb-placeholder" />}
      </div>
      <div className="lib-card-info" onClick={() => onPreview(tape)} style={{ cursor: 'pointer' }}>
        <span className="lib-card-name">{name}</span>
        <span className="lib-card-meta">
          {count} track{count !== 1 ? 's' : ''}
          {likeCount > 0 && <span className="lib-like-count">❤️ {likeCount}</span>}
        </span>
        <span className="lib-card-date">{formatDate(tape.updated_at || tape.created_at)}</span>
      </div>
      <div className="lib-card-actions">
        <button className="lib-btn lib-btn-play" onClick={() => onPreview(tape)} title="Preview as recipient">▶</button>
        <button className="lib-btn lib-btn-copy" onClick={copyLink} title="Copy share link">
          {copied ? '✓' : '🔗'}
        </button>
        {confirming ? (
          <>
            <button className="lib-btn lib-btn-confirm-del" onClick={() => onDelete(tape.id)}>Yes, delete</button>
            <button className="lib-btn lib-btn-cancel" onClick={() => setConfirming(false)}>Cancel</button>
          </>
        ) : (
          <button className="lib-btn lib-btn-del" onClick={() => setConfirming(true)} title="Delete">✕</button>
        )}
      </div>
    </div>
  );
}

// ── Draft tape card (editable) ────────────────────────────────────────────────
function DraftCard({ tape, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const thumb = skinThumb(tape.skin);
  const name  = tape.tape_name || tape.tapeName || 'Untitled tape';
  const count = trackCount(tape);

  return (
    <div className="lib-card">
      <div className="lib-card-thumb">
        {thumb
          ? <img src={thumb} alt={name} />
          : <div className="lib-card-thumb-placeholder" />}
      </div>
      <div className="lib-card-info">
        <span className="lib-card-name">{name}</span>
        <span className="lib-card-meta">
          {count} track{count !== 1 ? 's' : ''}
          <span className="lib-draft-badge">Draft</span>
        </span>
        <span className="lib-card-date">{formatDate(tape.updated_at || tape.created_at)}</span>
      </div>
      <div className="lib-card-actions">
        <button className="lib-btn lib-btn-edit" onClick={() => onEdit(tape)} title="Edit">✏</button>
        {confirming ? (
          <>
            <button className="lib-btn lib-btn-confirm-del" onClick={() => onDelete(tape.id)}>Yes, delete</button>
            <button className="lib-btn lib-btn-cancel" onClick={() => setConfirming(false)}>Cancel</button>
          </>
        ) : (
          <button className="lib-btn lib-btn-del" onClick={() => setConfirming(true)} title="Delete">✕</button>
        )}
      </div>
    </div>
  );
}

// ── Received tape card ────────────────────────────────────────────────────────
function ReceivedCard({ tape, onPlay }) {
  const thumb = skinThumb(tape.skin);
  const name  = tape.tape_name || tape.tapeName || 'Untitled tape';
  const count = trackCount(tape);

  return (
    <div className="lib-card" onClick={() => onPlay(tape)} style={{ cursor: 'pointer' }}>
      <div className="lib-card-thumb">
        {thumb
          ? <img src={thumb} alt={name} />
          : <div className="lib-card-thumb-placeholder" />}
      </div>
      <div className="lib-card-info">
        <span className="lib-card-name">{name}</span>
        <span className="lib-card-meta">{count} track{count !== 1 ? 's' : ''}</span>
        <span className="lib-card-date">{formatDate(tape.updated_at || tape.created_at)}</span>
      </div>
      <div className="lib-card-actions">
        <button className="lib-btn lib-btn-play" onClick={e => { e.stopPropagation(); onPlay(tape); }} title="Play">▶</button>
      </div>
    </div>
  );
}

// ── Main library modal ─────────────────────────────────────────────────────────
export default function MyLibrary({ user, onClose, onPlay, onEdit }) {
  const [tab,        setTab]        = useState('mine');
  const [myTapes,    setMyTapes]    = useState([]);
  const [received,   setReceived]   = useState([]);
  const [likeCounts, setLikeCounts] = useState({});
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      loadMyTapes(user.id),
      getReceivedTapes(user.id),
    ]).then(async ([mine, recv]) => {
      if (mine.error) setError(mine.error);
      setMyTapes(mine.tapes);
      setReceived(recv.tapes);

      // Fetch like counts for published tapes
      const publishedIds = mine.tapes
        .filter(t => t.status === 'published')
        .map(t => t.id);
      if (publishedIds.length) {
        const counts = await getReactionCounts(publishedIds);
        setLikeCounts(counts);
      }

      setLoading(false);
    });
  }, [user]);

  async function handleDelete(tapeId) {
    const { error: err } = await deleteTape(tapeId);
    if (err) { alert(`Couldn't delete: ${err}`); return; }
    setMyTapes(prev => prev.filter(t => t.id !== tapeId));
  }

  const sent   = myTapes.filter(t => t.status === 'published');
  const drafts = myTapes.filter(t => t.status === 'draft');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box lib-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        <h2 className="lib-title">My Library</h2>

        <div className="lib-tabs">
          <button
            className={`lib-tab ${tab === 'mine' ? 'active' : ''}`}
            onClick={() => setTab('mine')}
          >
            My Tapes {myTapes.length > 0 && <span className="lib-count">{myTapes.length}</span>}
          </button>
          <button
            className={`lib-tab ${tab === 'received' ? 'active' : ''}`}
            onClick={() => setTab('received')}
          >
            Received {received.length > 0 && <span className="lib-count">{received.length}</span>}
          </button>
        </div>

        <div className="lib-list">
          {loading && <p className="lib-empty">Loading…</p>}
          {!loading && error && <p className="lib-empty" style={{ color: '#e85d75' }}>{error}</p>}

          {/* ── My Tapes tab ── */}
          {!loading && !error && tab === 'mine' && (
            <>
              {sent.length === 0 && drafts.length === 0 && (
                <p className="lib-empty">You haven't saved any tapes yet. Make one!</p>
              )}

              {sent.length > 0 && (
                <>
                  <p className="lib-section-label">Sent</p>
                  {sent.map(tape => (
                    <SentCard
                      key={tape.id}
                      tape={tape}
                      onPreview={t => { onPlay(t); onClose(); }}
                      onDelete={handleDelete}
                      likeCount={likeCounts[tape.id] || 0}
                    />
                  ))}
                </>
              )}

              {drafts.length > 0 && (
                <>
                  <p className="lib-section-label">Drafts</p>
                  {drafts.map(tape => (
                    <DraftCard
                      key={tape.id}
                      tape={tape}
                      onEdit={t => { onEdit(t); onClose(); }}
                      onDelete={handleDelete}
                    />
                  ))}
                </>
              )}
            </>
          )}

          {/* ── Received tab ── */}
          {!loading && !error && tab === 'received' && (
            <>
              {received.length === 0 && (
                <p className="lib-empty">No received tapes yet — share your link and ask someone to send you one.</p>
              )}
              {received.map(tape => (
                <ReceivedCard
                  key={tape.id}
                  tape={tape}
                  onPlay={t => { onPlay(t); onClose(); }}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
