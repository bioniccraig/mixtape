import { useState, useEffect } from 'react';
import { loadMyTapes, getReceivedTapes, deleteTape } from './db';
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

// ── Single tape card ───────────────────────────────────────────────────────────
function TapeCard({ tape, onPlay, onEdit, onDelete, showEdit }) {
  const [confirming, setConfirming] = useState(false);
  const thumb = skinThumb(tape.skin);
  const name  = tape.tape_name || tape.tapeName || 'Untitled tape';
  const count = trackCount(tape);
  const isDraft = tape.status === 'draft';

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
          {isDraft && <span className="lib-draft-badge">Draft</span>}
        </span>
        <span className="lib-card-date">{formatDate(tape.updated_at || tape.created_at)}</span>
      </div>
      <div className="lib-card-actions">
        {!isDraft && (
          <button className="lib-btn lib-btn-play" onClick={() => onPlay(tape)} title="Play">
            ▶
          </button>
        )}
        {showEdit && (
          <button className="lib-btn lib-btn-edit" onClick={() => onEdit(tape)} title="Edit">
            ✏
          </button>
        )}
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

// ── Main library modal ─────────────────────────────────────────────────────────
export default function MyLibrary({ user, onClose, onPlay, onEdit }) {
  const [tab,       setTab]       = useState('mine');
  const [myTapes,   setMyTapes]   = useState([]);
  const [received,  setReceived]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      loadMyTapes(user.id),
      getReceivedTapes(user.id),
    ]).then(([mine, recv]) => {
      if (mine.error) setError(mine.error);
      setMyTapes(mine.tapes);
      setReceived(recv.tapes);
      setLoading(false);
    });
  }, [user]);

  async function handleDelete(tapeId) {
    const { error: err } = await deleteTape(tapeId);
    if (err) { alert(`Couldn't delete: ${err}`); return; }
    setMyTapes(prev => prev.filter(t => t.id !== tapeId));
  }

  const isEmpty = tab === 'mine' ? myTapes.length === 0 : received.length === 0;
  const list    = tab === 'mine' ? myTapes : received;

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
          {!loading && !error && isEmpty && (
            <p className="lib-empty">
              {tab === 'mine'
                ? "You haven't saved any tapes yet. Make one!"
                : "No received tapes yet — share your link and ask someone to send you one."}
            </p>
          )}
          {!loading && !error && list.map(tape => (
            <TapeCard
              key={tape.id}
              tape={tape}
              onPlay={t => { onPlay(t); onClose(); }}
              onEdit={t => { onEdit(t); onClose(); }}
              onDelete={handleDelete}
              showEdit={tab === 'mine'}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
