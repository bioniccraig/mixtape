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
    // Optimistic insert — Realtime will also fire but we dedupe above
    const optimistic = {
      id:         crypto.randomUUID(),
      tape_id:    tapeId,
      user_id:    user.id,
      user_email: user.email,
      body:       body.trim(),
      created_at: new Date().toISOString(),
      _optimistic: true,
    };
    setComments(prev => [...prev, optimistic]);
    try {
      const saved = await addComment(tapeId, user.id, user.email, body);
      // Replace optimistic entry with the real DB row
      setComments(prev => prev.map(c => c._optimistic && c.body === body ? saved : c));
    } catch (err) {
      // Roll back
      setComments(prev => prev.filter(c => c.id !== optimistic.id));
      setError(err.message);
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
