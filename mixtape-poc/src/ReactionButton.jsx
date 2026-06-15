import { useState, useEffect } from 'react';
import { getReactionState, toggleReaction } from './db';

export default function ReactionButton({ tapeId, user, onSignInRequest }) {
  const [liked,   setLiked]   = useState(false);
  const [count,   setCount]   = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tapeId) return;
    getReactionState(tapeId, user?.id || null).then(({ liked, count }) => {
      setLiked(liked);
      setCount(count);
    });
  }, [tapeId, user?.id]);

  async function handleClick() {
    if (!user) { onSignInRequest?.(); return; }
    if (loading) return;

    // Optimistic update
    const wasLiked = liked;
    const wasCount = count;
    setLiked(!wasLiked);
    setCount(c => c + (wasLiked ? -1 : 1));
    setLoading(true);

    const { liked: serverLiked, count: serverCount, error } = await toggleReaction(tapeId, user.id);

    if (error) {
      // Revert
      setLiked(wasLiked);
      setCount(wasCount);
    } else {
      setLiked(serverLiked);
      setCount(serverCount);
    }
    setLoading(false);
  }

  return (
    <button
      className={`reaction-btn ${liked ? 'liked' : ''}`}
      onClick={handleClick}
      disabled={loading}
      title={liked ? 'Unlike' : user ? 'Like this tape' : 'Sign in to like'}
    >
      <span className="reaction-heart">{liked ? '❤️' : '🤍'}</span>
      {count > 0 && <span className="reaction-count">{count}</span>}
    </button>
  );
}
