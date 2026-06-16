// InlineLibrary — compact library panel shown on the home page for signed-in users.
// Shows Sent / Drafts / Received sections without the modal wrapper.

import { useEffect, useState } from 'react';
import { loadMyTapes, getReceivedTapes, getReactionCounts } from './db';
import { TAPE_SKINS, DEFAULT_SKIN } from './constants';

function skinThumb(skinId) {
  const skin = TAPE_SKINS.find(s => s.id === skinId) || TAPE_SKINS.find(s => s.id === DEFAULT_SKIN);
  return skin?.body || null;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function MiniCard({ tape, likeCount, onClick, badge }) {
  const thumb = skinThumb(tape.skin);
  const name  = tape.tape_name || tape.tapeName || 'Untitled';
  const count = (Array.isArray(tape.tracks_a) ? tape.tracks_a.length : 0)
              + (Array.isArray(tape.tracks_b) ? tape.tracks_b.length : 0);

  return (
    <button className="il-card" onClick={onClick}>
      <div className="il-thumb">
        {thumb
          ? <img src={thumb} alt={name} />
          : <div className="il-thumb-placeholder" />}
      </div>
      <div className="il-info">
        <span className="il-name">{name}</span>
        <span className="il-meta">
          {count} track{count !== 1 ? 's' : ''}
          {badge && <span className="il-badge">{badge}</span>}
          {likeCount > 0 && <span className="il-likes">❤️ {likeCount}</span>}
        </span>
        <span className="il-date">{formatDate(tape.updated_at || tape.created_at)}</span>
      </div>
    </button>
  );
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
            <MiniCard
              key={tape.id}
              tape={tape}
              likeCount={likeCounts[tape.id] || 0}
              onClick={() => onPlay(tape)}
            />
          ))}
        </section>
      )}

      {/* Drafts */}
      {drafts.length > 0 && (
        <section className="il-section">
          <p className="il-section-label">Drafts <span className="il-count">{drafts.length}</span></p>
          {drafts.map(tape => (
            <MiniCard
              key={tape.id}
              tape={tape}
              badge="Draft"
              onClick={() => onEdit(tape)}
            />
          ))}
        </section>
      )}

      {/* Received */}
      {received.length > 0 && (
        <section className="il-section">
          <p className="il-section-label">Received <span className="il-count">{received.length}</span></p>
          {received.map(tape => (
            <MiniCard
              key={tape.id}
              tape={tape}
              onClick={() => onPlay(tape)}
            />
          ))}
        </section>
      )}
    </div>
  );
}
