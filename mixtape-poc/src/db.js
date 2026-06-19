// Database helpers — all Supabase operations go here.
// Every function returns null / falls back silently if supabase is not initialised.

import { supabase } from './supabase';


// ── Cover photo upload ────────────────────────────────────────────────────────
// Resizes to max 800px client-side (canvas) then uploads to Supabase Storage.
// Bucket "tape-covers" must exist and be public in your Supabase project.
async function _resizeImage(file, maxPx = 800) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
    };
    img.src = URL.createObjectURL(file);
  });
}

export async function uploadCoverPhoto(file, userId) {
  if (!supabase) return { url: null, error: 'Supabase not configured' };
  const blob = await _resizeImage(file);
  const path = `covers/${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from('tape-covers')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) return { url: null, error: error.message };
  const { data } = supabase.storage.from('tape-covers').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

// ── Track serialisation ───────────────────────────────────────────────────────
function trackToRow(t) {
  return {
    id:            t.id,
    title:         t.title,
    artist:        t.artist,
    artwork:       t.artwork      || null, // persist so recipients get auto-art without re-enrichment
    durationMs:    t.durationMs,
    durationLabel: t.durationLabel,
    platform_ids: {
      youtube:     t.ytId      || null,
      apple_music: t.appleId   || null,
      apple_title: t.appleTitle || null,
      apple_album: t.appleAlbum || null,
    },
    ytConfirmed: !!t.ytConfirmed,
  };
}

function rowToTrack(r) {
  const appleId = r.platform_ids?.apple_music || null;
  return {
    id:            r.id,
    title:         r.title,
    artist:        r.artist,
    album:         r.album        || '',
    artwork:       r.artwork      || null,
    durationMs:    r.durationMs,
    durationLabel: r.durationLabel,
    ytId:          r.platform_ids?.youtube || null,
    ytStatus:      r.platform_ids?.youtube ? 'ok' : 'none',
    ytConfirmed:   !!r.ytConfirmed,
    appleId,
    appleTitle:    r.platform_ids?.apple_title || null,
    appleAlbum:    r.platform_ids?.apple_album || null,
    appleStatus:   appleId ? 'ok' : 'none',
    previewUrl:    null,
  };
}


// ── Upsert tape ───────────────────────────────────────────────────────────────
// Creates a new tape (if no id) or updates an existing one (if id provided).
// status: 'draft' | 'published'
// Returns { id, shareId, error }
export async function upsertTape({ id, tapeName, skin, note, sideA, sideB, creatorId, status = 'draft', coverImageUrl, coverColor, allowForward = false }) {
  if (!supabase) return { id: null, shareId: null, error: 'Supabase not configured' };

  const payload = {
    tape_name:       tapeName       || '',
    skin:            skin           || 'rainbow',
    note:            note           || '',
    tracks_a:        sideA.map(trackToRow),
    tracks_b:        sideB.map(trackToRow),
    status,
    cover_image_url: coverImageUrl  || null,
    cover_color:     coverColor     || null,
    allow_forward:   !!allowForward,
  };

  if (id) {
    // Update existing tape
    const { data, error } = await supabase
      .from('tapes')
      .update(payload)
      .eq('id', id)
      .select('id, share_id')
      .single();
    if (error) return { id: null, shareId: null, error: error.message };
    return { id: data.id, shareId: data.share_id, error: null };
  } else {
    // Insert new tape
    const { data, error } = await supabase
      .from('tapes')
      .insert({ ...payload, creator_id: creatorId })
      .select('id, share_id')
      .single();
    if (error) return { id: null, shareId: null, error: error.message };
    return { id: data.id, shareId: data.share_id, error: null };
  }
}


// ── Legacy saveTape (kept for backwards compat) ───────────────────────────────
export async function saveTape({ tapeName, skin, note, sideA, sideB, creatorId }) {
  return upsertTape({ tapeName, skin, note, sideA, sideB, creatorId, status: 'published' });
}


// ── Delete tape ───────────────────────────────────────────────────────────────
export async function deleteTape(tapeId) {
  if (!supabase) return { error: 'Supabase not configured' };
  // `.select()` returns the rows actually deleted. If the database refuses the
  // delete (e.g. a missing permission rule), there's no error but ZERO rows come
  // back — so we check that and report it instead of pretending it worked.
  const { data, error } = await supabase
    .from('tapes')
    .delete()
    .eq('id', tapeId)
    .select('id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Tape wasn't deleted — you may not have permission, or it no longer exists." };
  }
  return { error: null };
}

// ── Delete account (permanent) ────────────────────────────────────────────────
// Calls the server function, which is the only place allowed to remove the user.
export async function deleteAccount() {
  if (!supabase) return { ok: false, error: 'Supabase not configured' };
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, error: 'You are not signed in.' };
  try {
    const res = await fetch('/api/delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error || 'Failed to delete account.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Network error — please try again.' };
  }
}


// ── Load tape by share ID (for recipient links) ───────────────────────────────
export async function loadTapeByShareId(shareId) {
  if (!supabase) return { tape: null, error: 'Supabase not configured' };

  const { data, error } = await supabase
    .from('tapes')
    .select('*')
    .eq('share_id', shareId)
    .eq('status', 'published')
    .single();

  if (error) return { tape: null, error: error.message };
  return { tape: _rowToTape(data), error: null };
}


// ── Load tape by DB id (for editing drafts / published tapes) ────────────────
export async function loadTapeById(id) {
  if (!supabase) return { tape: null, error: 'Supabase not configured' };

  const { data, error } = await supabase
    .from('tapes')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return { tape: null, error: error.message };
  return { tape: _rowToTape(data), error: null };
}


// ── Load tapes by creator (My Tapes library) ─────────────────────────────────
export async function loadMyTapes(creatorId) {
  if (!supabase) return { tapes: [], error: 'Supabase not configured' };

  const { data, error } = await supabase
    .from('tapes')
    .select('id, share_id, tape_name, skin, status, created_at, updated_at, tracks_a, tracks_b, note')
    .eq('creator_id', creatorId)
    .order('updated_at', { ascending: false });

  if (error) return { tapes: [], error: error.message };
  return { tapes: data || [], error: null };
}


// ── Record that a signed-in user opened a shared tape ─────────────────────────
export async function recordTapeView(tapeId, userId) {
  if (!supabase || !tapeId || !userId) return;
  await supabase.from('events').insert({
    tape_id:    tapeId,
    event_type: 'tape_opened',
    viewer_id:  userId,
  });
}

// ── Load received tapes (tapes this user opened that someone else made) ───────
// Uses the events table — no schema change needed.
export async function getReceivedTapes(userId) {
  if (!supabase) return { tapes: [], error: 'Supabase not configured' };

  const { data, error } = await supabase
    .from('events')
    .select('created_at, tape:tapes(id, share_id, tape_name, skin, creator_id, status, created_at, tracks_a, tracks_b)')
    .eq('event_type', 'tape_opened')
    .eq('viewer_id', userId)
    .eq('tapes.status', 'published')
    .order('created_at', { ascending: false });

  if (error) return { tapes: [], error: error.message };

  // Tapes this user has removed from their library ("Remove from my library")
  const { data: hidden } = await supabase
    .from('hidden_received_tapes')
    .select('tape_id')
    .eq('user_id', userId);
  const hiddenIds = new Set((hidden || []).map(h => h.tape_id));

  // Deduplicate by tape id (user may have opened same tape multiple times)
  const seen = new Set();
  const tapes = (data || [])
    .map(row => row.tape)
    .filter(t => t && t.creator_id !== userId && !hiddenIds.has(t.id) && !seen.has(t.id) && seen.add(t.id));

  return { tapes, error: null };
}

// ── Remove a received tape from MY library (hide; doesn't delete the creator's tape) ──
export async function hideReceivedTape(userId, tapeId) {
  if (!supabase) return { error: 'Supabase not configured' };
  if (!userId || !tapeId) return { error: 'Missing user or tape id' };
  const { error } = await supabase
    .from('hidden_received_tapes')
    .insert({ user_id: userId, tape_id: tapeId });
  // A duplicate hide (already removed) is fine — treat as success.
  if (error && error.code !== '23505') return { error: error.message };
  return { error: null };
}


// ── Internal: convert a DB tape row to the standard app tape format ───────────
function _rowToTape(data) {
  return {
    dbId:          data.id,
    shareId:       data.share_id,
    creatorId:     data.creator_id,
    tapeName:      data.tape_name,
    theme:         data.skin,
    skin:          data.skin,
    note:          data.note,
    status:        data.status,
    createdAt:     data.created_at || null,
    coverImageUrl: data.cover_image_url || null,
    coverColor:    data.cover_color     || null,
    allowForward:  !!data.allow_forward,
    sideA:         (data.tracks_a || []).map(rowToTrack),
    sideB:         (data.tracks_b || []).map(rowToTrack),
  };
}


// ── Duplicate tape (creates a new draft copy) ─────────────────────────────────
export async function duplicateTape(tape, creatorId) {
  // tape is a raw DB row (from loadMyTapes) or a mapped tape object
  const sideA = (tape.tracks_a || tape.sideA || []).map(t =>
    // support both raw DB rows and already-mapped track objects
    t.platform_ids ? rowToTrack(t) : t
  );
  const sideB = (tape.tracks_b || tape.sideB || []).map(t =>
    t.platform_ids ? rowToTrack(t) : t
  );
  return upsertTape({
    tapeName:      (tape.tape_name || tape.tapeName || 'Untitled') + ' (copy)',
    skin:          tape.skin,
    note:          tape.note || '',
    sideA,
    sideB,
    creatorId,
    status:        'draft',
    coverImageUrl: tape.cover_image_url || tape.coverImageUrl || null,
    coverColor:    tape.cover_color     || tape.coverColor     || null,
  });
}


// ── Reactions (likes) ─────────────────────────────────────────────────────────

// Toggle a ❤️ on a tape. Returns the new liked state + total count.
export async function toggleReaction(tapeId, userId) {
  if (!supabase) return { liked: false, count: 0, error: 'Supabase not configured' };
  // Guard: a tape opened from a #tape= hash link has no DB id, so a like can't be
  // persisted (the reactions.tape_id FK would be null). Fail loudly, don't pretend.
  if (!tapeId) return { liked: false, count: 0, error: 'This tape has no saved id, so likes cannot be saved.' };
  if (!userId) return { liked: false, count: 0, error: 'Sign in to like.' };

  const { data: existing, error: selErr } = await supabase
    .from('reactions')
    .select('id')
    .eq('tape_id', tapeId)
    .eq('user_id', userId)
    .maybeSingle();
  if (selErr) return { liked: false, count: 0, error: selErr.message };

  // IMPORTANT: previously the insert/delete error was discarded, so a failed write
  // (null tape_id, missing profile row, RLS denial) looked like a success — the
  // heart filled in but nothing was saved, then "disappeared" on reload. Check it.
  let writeErr;
  if (existing) {
    ({ error: writeErr } = await supabase.from('reactions').delete().eq('id', existing.id));
  } else {
    ({ error: writeErr } = await supabase.from('reactions').insert({ tape_id: tapeId, user_id: userId }));
  }
  if (writeErr) return { liked: !!existing, count: 0, error: writeErr.message };

  const { count } = await supabase
    .from('reactions')
    .select('id', { count: 'exact', head: true })
    .eq('tape_id', tapeId);

  return { liked: !existing, count: count || 0, error: null };
}

// Get reaction state for a single tape — total count + whether this user liked it.
export async function getReactionState(tapeId, userId) {
  if (!supabase) return { liked: false, count: 0 };

  const [countRes, userRes] = await Promise.all([
    supabase
      .from('reactions')
      .select('id', { count: 'exact', head: true })
      .eq('tape_id', tapeId),
    userId
      ? supabase
          .from('reactions')
          .select('id')
          .eq('tape_id', tapeId)
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return { liked: !!userRes.data, count: countRes.count || 0 };
}

// Get like counts for multiple tapes at once (for My Library creator view).
// Returns { [tapeId]: count }
export async function getReactionCounts(tapeIds) {
  if (!supabase || !tapeIds.length) return {};

  const { data } = await supabase
    .from('reactions')
    .select('tape_id')
    .in('tape_id', tapeIds);

  const counts = {};
  (data || []).forEach(r => {
    counts[r.tape_id] = (counts[r.tape_id] || 0) + 1;
  });
  return counts;
}


// ── Comments ──────────────────────────────────────────────────────────────────

export async function getComments(tapeId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('comments')
    .select('id, body, created_at, user_id, author_name')
    .eq('tape_id', tapeId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addComment(tapeId, userId, userEmail, body) {
  if (!supabase) return null;
  // Privacy: store ONLY a display name (the part before "@"), never the raw email.
  // The comments table is readable by anyone, so the email must not be persisted.
  const authorName = (userEmail || '').split('@')[0] || 'Someone';
  const { data, error } = await supabase
    .from('comments')
    .insert({ tape_id: tapeId, user_id: userId, author_name: authorName, body: body.trim() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteComment(commentId) {
  if (!supabase) return;
  const { error } = await supabase.from('comments').delete().eq('id', commentId);
  if (error) throw error;
}


// ── Log analytics event ───────────────────────────────────────────────────────
export async function logEvent({ tapeId = null, eventType, sessionId, viewerId = null, metadata = {} }) {
  // tapeId may be null — builder-funnel events fire before a tape row exists.
  if (!supabase || !eventType) return;
  await supabase.from('events').insert({
    tape_id:    tapeId,
    event_type: eventType,
    session_id: sessionId || null,
    viewer_id:  viewerId  || null,
    metadata,
  });
}


// ── Get tape DB id by share_id ────────────────────────────────────────────────
export async function getTapeId(shareId) {
  if (!supabase) return null;
  const { data } = await supabase
    .from('tapes')
    .select('id')
    .eq('share_id', shareId)
    .single();
  return data?.id || null;
}
