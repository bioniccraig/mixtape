// Database helpers — all Supabase operations go here.
// Every function returns null / falls back silently if supabase is not initialised
// (e.g. missing env vars in local dev).

import { supabase } from './supabase';

// ── Track serialisation ───────────────────────────────────────────────────────
// Converts the internal track shape to the DB storage format.
// We store platform_ids as a JSON object so adding Apple Music later is trivial.
function trackToRow(t) {
  return {
    id:            t.id,
    title:         t.title,
    artist:        t.artist,
    durationMs:    t.durationMs,
    durationLabel: t.durationLabel,
    platform_ids: {
      youtube:     t.ytId || null,
      // apple_music: null  ← slot ready for M2b
    },
    ytConfirmed:   !!t.ytConfirmed,
  };
}

// Converts a DB track row back to the internal TapePlayer/TapeBuilder shape.
function rowToTrack(r) {
  return {
    id:            r.id,
    title:         r.title,
    artist:        r.artist,
    album:         r.album   || '',
    artwork:       r.artwork || null,
    durationMs:    r.durationMs,
    durationLabel: r.durationLabel,
    ytId:          r.platform_ids?.youtube || null,
    ytStatus:      r.platform_ids?.youtube ? 'ok' : 'none',
    ytConfirmed:   !!r.ytConfirmed,
    previewUrl:    null,
  };
}


// ── Save tape ─────────────────────────────────────────────────────────────────
// Inserts a new tape row and returns { shareId, error }.
// shareId is the short 8-char ID used in /t/<shareId> URLs.
export async function saveTape({ tapeName, skin, note, sideA, sideB, creatorId }) {
  if (!supabase) return { shareId: null, error: 'Supabase not configured' };

  const { data, error } = await supabase
    .from('tapes')
    .insert({
      tape_name:  tapeName || '',
      skin:       skin     || 'rainbow',
      note:       note     || '',
      tracks_a:   sideA.map(trackToRow),
      tracks_b:   sideB.map(trackToRow),
      creator_id: creatorId || null,
      status:     'published',
    })
    .select('share_id')
    .single();

  if (error) return { shareId: null, error: error.message };
  return { shareId: data.share_id, error: null };
}


// ── Load tape by share ID ─────────────────────────────────────────────────────
// Returns { tape, error } where tape is in the standard app format.
export async function loadTapeByShareId(shareId) {
  if (!supabase) return { tape: null, error: 'Supabase not configured' };

  const { data, error } = await supabase
    .from('tapes')
    .select('*')
    .eq('share_id', shareId)
    .eq('status', 'published')
    .single();

  if (error) return { tape: null, error: error.message };

  return {
    tape: {
      tapeName: data.tape_name,
      theme:    data.skin,
      note:     data.note,
      sideA:    (data.tracks_a || []).map(rowToTrack),
      sideB:    (data.tracks_b || []).map(rowToTrack),
      shareId:  data.share_id,
    },
    error: null,
  };
}


// ── Load tapes by creator ─────────────────────────────────────────────────────
// Returns { tapes, error } — the creator's saved tape library.
export async function loadMyTapes(creatorId) {
  if (!supabase) return { tapes: [], error: 'Supabase not configured' };

  const { data, error } = await supabase
    .from('tapes')
    .select('id, share_id, tape_name, skin, created_at, status')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false });

  if (error) return { tapes: [], error: error.message };
  return { tapes: data || [], error: null };
}


// ── Log event ─────────────────────────────────────────────────────────────────
// Fires-and-forgets an analytics event row.
// eventType: 'tape_opened' | 'tape_played' | 'tape_completed'
export async function logEvent({ tapeId, eventType, sessionId, viewerId = null, metadata = {} }) {
  if (!supabase || !tapeId) return;

  await supabase.from('events').insert({
    tape_id:    tapeId,
    event_type: eventType,
    session_id: sessionId || null,
    viewer_id:  viewerId  || null,
    metadata,
  });
  // We swallow errors — analytics should never break the UX.
}


// ── Get tape DB id by share_id (needed for logEvent) ─────────────────────────
export async function getTapeId(shareId) {
  if (!supabase) return null;
  const { data } = await supabase
    .from('tapes')
    .select('id')
    .eq('share_id', shareId)
    .single();
  return data?.id || null;
}
