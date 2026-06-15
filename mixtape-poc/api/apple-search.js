// api/apple-search.js
// Searches the Apple Music Catalog API — the same backend the Apple Music app uses.
// The legacy iTunes Search API consistently misses studio album versions for some
// artists (e.g. Rage Against the Machine), whereas this endpoint returns them correctly.
//
// GET /api/apple-search?term=Bulls+On+Parade&storefront=gb&limit=20
//
// Response: { songs: [ { id, name, artistName, albumName, artworkUrl, durationMs } ] }

import crypto from 'crypto';

function makeDevToken() {
  const teamId     = process.env.APPLE_TEAM_ID;
  const keyId      = process.env.APPLE_KEY_ID;
  const privateKey = (process.env.APPLE_MUSICKIT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!teamId || !keyId || !privateKey) throw new Error('MusicKit credentials not configured');

  const b64url  = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const now     = Math.floor(Date.now() / 1000);
  const header  = b64url({ alg: 'ES256', kid: keyId });
  const payload = b64url({ iss: teamId, iat: now, exp: now + 3600 });
  const unsigned  = `${header}.${payload}`;
  const signer    = crypto.createSign('SHA256');
  signer.update(unsigned);
  const sig = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${unsigned}.${sig}`;
}

export default async function handler(req, res) {
  const { term, storefront = 'gb', limit = 20 } = req.query;
  if (!term) return res.status(400).json({ error: 'term required' });

  try {
    const token  = makeDevToken();
    const params = new URLSearchParams({ term, types: 'songs', limit });
    const url    = `https://api.music.apple.com/v1/catalog/${storefront}/search?${params}`;

    const r    = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await r.json();

    // Normalise to a flat array so callers don't need to know the AM API shape
    const raw  = data?.results?.songs?.data || [];
    const songs = raw.map(s => ({
      id:          s.id,
      name:        s.attributes?.name        || '',
      artistName:  s.attributes?.artistName  || '',
      albumName:   s.attributes?.albumName   || '',
      // artwork url uses {w}x{h} template — replace with 100x100
      artworkUrl:  (s.attributes?.artwork?.url || '').replace('{w}', '100').replace('{h}', '100'),
      durationMs:  s.attributes?.durationInMillis || 0,
    }));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    res.json({ songs });
  } catch (err) {
    console.error('apple-search error:', err.message);
    res.status(502).json({ error: err.message, songs: [] });
  }
}
