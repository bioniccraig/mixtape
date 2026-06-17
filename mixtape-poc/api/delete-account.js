// api/delete-account.js
// Permanently deletes the signed-in user's account and all their data.
// The caller is identified ONLY by their own access token, so a user can
// never delete anyone else's account.
//
// Vercel env vars required:
//   VITE_SUPABASE_URL            (already set — shared with the frontend)
//   SUPABASE_SERVICE_ROLE_KEY    (NEW — Supabase → Project Settings → API → service_role secret)

/* global process */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url        = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ error: 'Account deletion is not configured on the server.' });
  }

  // Caller's access token (proves who they are)
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Resolve the caller from their token — this is the only account we will delete
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Your session is invalid. Please sign in again.' });
  }
  const userId = userData.user.id;

  try {
    // 1. Remove the user's uploaded cover images (covers/<userId>/*)
    const { data: files } = await admin.storage
      .from('tape-covers')
      .list(`covers/${userId}`, { limit: 1000 });
    if (files && files.length) {
      await admin.storage
        .from('tape-covers')
        .remove(files.map(f => `covers/${userId}/${f.name}`));
    }

    // 2. Delete the user's tapes — cascades to tape_recipients, events,
    //    and reactions/comments left on those tapes.
    const { error: tapesErr } = await admin.from('tapes').delete().eq('creator_id', userId);
    if (tapesErr) return res.status(500).json({ error: tapesErr.message });

    // 3. Delete the auth user — cascades to their profile and any
    //    reactions/comments/notifications tied to them.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return res.status(500).json({ error: delErr.message });

    return res.json({ ok: true });
  } catch (err) {
    console.error('delete-account error:', err.message);
    return res.status(500).json({ error: 'Something went wrong deleting your account.' });
  }
}
