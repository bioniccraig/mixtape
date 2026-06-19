import { useEffect, useState } from 'react';
import { loadMyTapes, getReceivedTapes, deleteTape, getReactionCounts, duplicateTape, hideReceivedTape } from './db';
import LibrarySpine from './LibrarySpine';

function shareUrl(shareId) {
  return `${window.location.origin}/t/${shareId}`;
}

// ── Main library modal ─────────────────────────────────────────────────────────
export default function MyLibrary({ user, onClose, onPlay, onEdit }) {
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

  function copyLink(tape) {
    navigator.clipboard.writeText(shareUrl(tape.share_id));
  }

  async function handleDelete(tape) {
    const { error: err } = await deleteTape(tape.id);
    if (err) { alert(`Couldn't delete: ${err}`); return; }
    setMyTapes(prev => prev.filter(t => t.id !== tape.id));
  }

  async function handleDuplicate(tape) {
    const { id, error: err } = await duplicateTape(tape, user.id);
    if (err) { alert(`Couldn't duplicate: ${err}`); return; }
    onEdit({ id });
    onClose();
  }

  async function handleRemoveReceived(tape) {
    const { error: err } = await hideReceivedTape(user.id, tape.id);
    if (err) { alert(`Couldn't remove: ${err}`); return; }
    setReceived(prev => prev.filter(t => t.id !== tape.id));
  }

  const sent   = myTapes.filter(t => t.status === 'published');
  const drafts = myTapes.filter(t => t.status === 'draft');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box lib-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        <h2 className="lib-title">My Library</h2>

        <div className="lib-list">
          {loading && <p className="lib-empty">Loading…</p>}
          {!loading && error && <p className="lib-empty" style={{ color: '#e85d75' }}>{error}</p>}

          {!loading && !error && sent.length === 0 && drafts.length === 0 && received.length === 0 && (
            <p className="lib-empty">Nothing here yet — make your first tape!</p>
          )}

          {/* ── Sent tapes ── */}
          {!loading && !error && (
            <>
              <p className="lib-section-label">
                Sent Tapes
                {sent.length > 0 && <span className="lib-count">{sent.length}</span>}
              </p>
              {sent.length === 0
                ? <p className="lib-section-empty">No sent tapes yet.</p>
                : sent.map(tape => (
                  <LibrarySpine
                    key={tape.id}
                    tape={tape}
                    kind="sent"
                    likeCount={likeCounts[tape.id] || 0}
                    onOpen={t => { onPlay(t); onClose(); }}
                    onCopyLink={copyLink}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                  />
                ))
              }
            </>
          )}

          {/* ── Drafts ── */}
          {!loading && !error && (
            <>
              <p className="lib-section-label">
                Drafts
                {drafts.length > 0 && <span className="lib-count">{drafts.length}</span>}
              </p>
              {drafts.length === 0
                ? <p className="lib-section-empty">No drafts.</p>
                : drafts.map(tape => (
                  <LibrarySpine
                    key={tape.id}
                    tape={tape}
                    kind="draft"
                    onOpen={t => { onEdit(t); onClose(); }}
                    onDelete={handleDelete}
                  />
                ))
              }
            </>
          )}

          {/* ── Received tapes ── */}
          {!loading && !error && (
            <>
              <p className="lib-section-label">
                Received Tapes
                {received.length > 0 && <span className="lib-count">{received.length}</span>}
              </p>
              {received.length === 0
                ? <p className="lib-section-empty">No received tapes yet.</p>
                : received.map(tape => (
                  <LibrarySpine
                    key={tape.id}
                    tape={tape}
                    kind="received"
                    onOpen={t => { onPlay(t); onClose(); }}
                    onRemove={handleRemoveReceived}
                  />
                ))
              }
            </>
          )}
        </div>
      </div>
    </div>
  );
}
