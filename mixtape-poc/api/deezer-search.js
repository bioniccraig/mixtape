// Vercel serverless function — proxies Deezer API to avoid iOS Safari CORS/ITP
// Deezer has a free, no-auth public API with excellent music search quality.

import { blockedByOrigin } from './_guard.js';

export default async function handler(req, res) {
  if (blockedByOrigin(req)) return res.status(403).json({ error: 'Forbidden' });
  const { type, q, id, limit = 50 } = req.query;
  const enc = s => encodeURIComponent(s || '');

  let url;
  switch (type) {
    case 'album':        url = `https://api.deezer.com/search/album?q=${enc(q)}&limit=${limit}`; break;
    case 'album-tracks': url = `https://api.deezer.com/album/${id}/tracks`;                      break;
    case 'artist':       url = `https://api.deezer.com/search/artist?q=${enc(q)}&limit=${limit}`; break;
    case 'artist-top':   url = `https://api.deezer.com/artist/${id}/top?limit=${limit}`;          break;
    default:             url = `https://api.deezer.com/search?q=${enc(q)}&limit=${limit}`;        break;
  }

  try {
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).json({ error: `Deezer returned ${r.status}` });
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
