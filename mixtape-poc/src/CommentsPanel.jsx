// CommentsPanel — shown on TapePlayer below the track list.
// Anyone with the link can read comments; you must be signed in to post.
// Comments appear live via Supabase Realtime (no reload needed).

import { useState, useRef } from 'react';
import { useTapeActivity } from './useTapeActivity.js';

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function CommentsPanel({ tapeId, user, onSignInRequest }) {
  const { comments, loading, error: hookError, post, remove } = useTapeActivity(tapeId, user);
  const [draft,     setDraft]     = useState('');
  const [posting,   setPosting]   = useState(false);
  const [postError, setPostError] = useState(null);
  const bottomRef = useRef(null);

  // No auto-scroll — panel is inline, page scroll is handled naturally

  async function handleSubmit(e) {
    e.preventDefault();
    if (!draft.trim() || posting) return;
    const body = draft.trim();
    setPosting(true);
    setDraft('');
    setPostError(null);
    try {
      await post(body);
    } catch (err) {
      setPostError(err.message || 'Failed to post — please try again.');
      setDraft(body); // restore so user can retry
    } finally {
      setPosting(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <div className="comments-panel" id="comments-panel">
      <h3 className="comments-heading">
        💬 Comments {!loading && comments.length > 0 && <span className="comments-count">({comments.length})</span>}
      </h3>

      {(hookError || postError) && (
        <p className="comments-error">{hookError || postError}</p>
      )}

      {loading && <p className="comments-loading">Loading…</p>}

      {!loading && comments.length === 0 && (
        <p className="comments-empty">No comments yet — be the first!</p>
      )}

      {comments.length > 0 && (
        <div className="comments-list">
          {comments.map(c => (
            <div key={c.id} className="comment">
              <div className="comment-meta">
                <span className="comment-author">{c.author_name || 'Someone'}</span>
                <span className="comment-time">{timeAgo(c.created_at)}</span>
                {user && c.user_id === user.id && (
                  <button
                    className="comment-delete"
                    onClick={() => remove(c.id)}
                    title="Delete comment"
                  >✕</button>
                )}
              </div>
              <p className="comment-body">{c.body}</p>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {user ? (
        <form onSubmit={handleSubmit} className="comment-form">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Say something… (Enter to post)"
            maxLength={500}
            disabled={posting}
            autoComplete="off"
          />
          <button type="submit" disabled={!draft.trim() || posting}>
            {posting ? '…' : 'Post'}
          </button>
        </form>
      ) : (
        <p className="comment-signin">
          <button className="btn btn-ghost btn-sm" onClick={onSignInRequest}>Sign in</button>
          {' '}to leave a comment.
        </p>
      )}
    </div>
  );
}
