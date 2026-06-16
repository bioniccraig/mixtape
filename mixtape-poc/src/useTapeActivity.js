// Realtime comments for a tape.
// Fetches existing comments on mount, then keeps the list live via Supabase Realtime.
// Caller: CommentsPanel.jsx

import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { getComments, addComment, deleteComment } from './db.js';

export function useTapeActivity(tapeId, user) {
  const [comments, setComments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  // ── Initial load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tapeId) { setLoading(false); return; }
    setLoading(true);
    getComments(tapeId)
      .then(data  => { setComments(data); setLoading(false); })
      .catch(err  => { setError(err.message); setLoading(false); });
  }, [tapeId]);

  // ── Realtime subscription ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!tapeId || !supabase) return;

    const channel = supabase
      .channel(`tape-comments-${tapeId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `tape_id=eq.${tapeId}` },
        payload => setComments(prev => {
          // Avoid duplicates (optimistic insert + realtime echo)
          if (prev.some(c => c.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        })
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'comments', filter: `tape_id=eq.${tapeId}` },
        payload => setComments(prev => prev.filter(c => c.id !== payload.old.id))
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tapeId]);

  // ── Post a comment ────────────────────────────────────────────────────────────
  const post = useCallback(async (body) => {
    if (!user || !tapeId) return;
    try {
      const saved = await addComment(tapeId, user.id, user.email, body);
      if (saved) {
        // Add the real DB row; Realtime may also fire but dedup by ID handles it
        setComments(prev =>
          prev.some(c => c.id === saved.id) ? prev : [...prev, saved]
        );
      } else {
        // INSERT succeeded but SELECT blocked (RLS) — reload from DB as fallback
        const fresh = await getComments(tapeId);
        setComments(fresh);
      }
    } catch (err) {
      setError(err.message);
      throw err; // re-throw so CommentsPanel can surface it
    }
  }, [tapeId, user]);

  // ── Delete a comment ──────────────────────────────────────────────────────────
  const remove = useCallback(async (commentId) => {
    setComments(prev => prev.filter(c => c.id !== commentId));
    try {
      await deleteComment(commentId);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  return { comments, loading, error, post, remove };
}
