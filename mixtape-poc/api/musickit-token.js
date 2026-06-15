// api/musickit-token.js
// Returns a signed MusicKit developer token (JWT, ES256).
// Vercel env vars required: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_MUSICKIT_PRIVATE_KEY

import crypto from 'crypto';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

export default function handler(req, res) {
  const teamId     = process.env.APPLE_TEAM_ID;
  const keyId      = process.env.APPLE_KEY_ID;
  // Vercel sometimes stores newlines as literal \n — normalise either way
  const privateKey = (process.env.APPLE_MUSICKIT_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!teamId || !keyId || !privateKey) {
    return res.status(500).json({ error: 'MusicKit credentials not configured' });
  }

  try {
    const now     = Math.floor(Date.now() / 1000);
    const header  = b64url({ alg: 'ES256', kid: keyId });
    const payload = b64url({ iss: teamId, iat: now, exp: now + 15_777_000 }); // ~6 months

    const unsigned  = `${header}.${payload}`;
    const signer    = crypto.createSign('SHA256');
    signer.update(unsigned);
    // ieee-p1363 gives r||s format (64 bytes) required by JWT — not DER
    const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');

    const token = `${unsigned}.${signature}`;

    // Cache at the CDN edge for 1 hour — token is valid for 6 months
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.json({ token });

  } catch (err) {
    console.error('MusicKit token error:', err.message);
    return res.status(500).json({ error: 'Failed to sign token', detail: err.message });
  }
}
