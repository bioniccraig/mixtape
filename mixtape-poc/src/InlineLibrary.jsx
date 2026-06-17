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

// Pick one of the 6 case-spine colours, stable per tape id
function caseNumFor(tape) {
  const key = String(tape.id || tape.tape_name || tape.tapeName || '');
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h + key.charCodeAt(i)) % 6;
  return h + 1; // 1..6
}

function MiniCard({ tape, likeCount, onClick, badge }) {
  const name  = tape.tape_name || tape.tapeName || 'Untitled';
  const count = (Array.isArray(tape.tracks_a) ? tape.tracks_a.length : 0)
              + (Array.isArray(tape.tracks_b) ? tape.tracks_b.length : 0);
  const caseNum = caseNumFor(tape);
  const date = formatDate(tape.updated_at || tape.created_at);

  return (
    <button className="lib-spine" onClick={onClick} title={name}>
      <img className="lib-spine-img" src={`/cases/case${caseNum}.jpg`} alt="" />
      <span className="lib-spine-label">
        <span className="lib-spine-name">{name}</span>
        <span className="lib-spine-meta">
          {count} track{count !== 1 ? 's' : ''}
          {badge && ` · ${badge}`}
          {date && ` · ${date}`}
          {likeCount > 0 && ` · ❤ ${likeCount}`}
        </span>
      </span>
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
