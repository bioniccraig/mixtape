// Vercel serverless function — looks up iTunes tracks by ID (comma-separated)
// Used by TapePlayer to fetch artwork + previewUrls after loading a shared tape

import { blockedByOrigin } from './_guard.js';

export default async function handler(req, res) {
  if (blockedByOrigin(req)) return res.status(403).json({ error: 'Forbidden' });
  const { id, entity } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });

  const params = new URLSearchParams({ id });
  if (entity) params.set('entity', entity);
  const url = `https://itunes.apple.com/lookup?${params}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).json({ error: `iTunes returned ${r.status}` });
    const data = await r.json();
    // Cache aggressively — track metadata barely changes
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
