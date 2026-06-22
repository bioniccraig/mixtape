// InlineLibrary — compact library panel shown on the home page for signed-in users.
// Shows Sent / Drafts / Received sections as cassette-case spines, each with its
// own action cluster (shared with the Library modal via LibrarySpine).

import { useEffect, useState } from 'react';
import { loadMyTapes, getReceivedTapes, getReactionCounts, deleteTape, duplicateTape, hideReceivedTape, logEvent } from './db';
import { copyToClipboard } from './share';
import { getSessionId } from './session';
import LibrarySpine from './LibrarySpine';

function shareUrl(shareId) {
  return `${window.location.origin}/t/${shareId}`;
}

export default function InlineLibrary({ user, onPlay, onEdit }) {
  const [myTapes,    setMyTapes]    = useState([]);
  const [received,   setReceived]   = useState([]);
  const [likeCounts, setLikeCounts] = useState({});
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([loadMyTapes(user.id), getReceivedTapes(user.id)])
      .then(async ([mine, recv]) => {
        setMyTapes(mine.tapes || []);
        setReceived(recv.tapes || []);
        const ids = (mine.tapes || []).filter(t => t.status === 'published').map(t => t.id);
        if (ids.length) setLikeCounts(await getReactionCounts(ids));
        setLoading(false);
      });
  }, [user]);

  async function copyLink(tape) {
    const ok = await copyToClipboard(shareUrl(tape.share_id));
    alert(ok ? 'Link copied to clipboard' : `Couldn't copy automatically. Here's the link:\n\n${shareUrl(tape.share_id)}`);
    logEvent({ tapeId: tape.id, eventType: 'share_initiated', sessionId: getSessionId(), viewerId: user.id, metadata: { method: 'copy_link' } });
  }

  async function handleDelete(tape) {
    const { error } = await deleteTape(tape.id);
    if (error) { alert(`Couldn't delete: ${error}`); return; }
    setMyTapes(prev => prev.filter(t => t.id !== tape.id));
  }

  async function handleDuplicate(tape) {
    const { id, error } = await duplicateTape(tape, user.id);
    if (error) { alert(`Couldn't duplicate: ${error}`); return; }
    onEdit({ id });
  }

  async function handleRemoveReceived(tape) {
    const { error } = await hideReceivedTape(user.id, tape.id);
    if (error) { alert(`Couldn't remove: ${error}`); return; }
    setReceived(prev => prev.filter(t => t.id !== tape.id));
  }

  const sent   = myTapes.filter(t => t.status === 'published');
  const drafts = myTapes.filter(t => t.status === 'draft');
  const total  = sent.length + drafts.length + received.length;

  if (loading) return <div className="il-loading">Loading library…</div>;

  return (
    <div className="inline-library">
      <h2 className="il-heading">My Library</h2>

      {total === 0 && (
        <p className="il-empty">Your library is empty — make your first tape!</p>
      )}

      {/* Sent tapes */}
      {sent.length > 0 && (
        <section className="il-section">
          <p className="il-section-label">Sent Tapes <span className="il-count">{sent.length}</span></p>
          {sent.map(tape => (
            <LibrarySpine
              key={tape.id}
              tape={tape}
              kind="sent"
              likeCount={likeCounts[tape.id] || 0}
              onOpen={onPlay}
              onCopyLink={copyLink}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
            />
          ))}
        </section>
      )}

      {/* Drafts */}
      {drafts.length > 0 && (
        <section className="il-section">
          <p className="il-section-label">Drafts <span className="il-count">{drafts.length}</span></p>
          {drafts.map(tape => (
            <LibrarySpine
              key={tape.id}
              tape={tape}
              kind="draft"
              onOpen={onEdit}
              onDelete={handleDelete}
            />
          ))}
        </section>
      )}

      {/* Received */}
      {received.length > 0 && (
        <section className="il-section">
          <p className="il-section-label">Received <span className="il-count">{received.length}</span></p>
          {received.map(tape => (
            <LibrarySpine
              key={tape.id}
              tape={tape}
              kind="received"
              onOpen={onPlay}
              onRemove={handleRemoveReceived}
            />
          ))}
        </section>
      )}
    </div>
  );
}
