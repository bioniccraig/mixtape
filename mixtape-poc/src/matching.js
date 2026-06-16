// Cross-platform matching — resolves an iTunes track to a YouTube video so the
// tape can play full songs in-app (YouTube engine) for every recipient.
// Matching is done server-side via /api/odesli (ISRC-based, far more accurate
// than raw text search). Alternatives for manual swap come from /api/youtube-search.

// Resolve the best YouTube match for a track.
// Returns { youtubeId, youtubeUrl, title, artist, thumbnail } — youtubeId may be null.
// Returns match result. May include quotaExceeded:true if YouTube daily limit hit.
export async function matchTrack(track) {
  const params = new URLSearchParams();
  if (track.uri) params.set('url', track.uri);
  else params.set('id', track.id);
  // Title + artist let the server fall back to a YouTube search if Odesli misses.
  if (track.title) params.set('title', track.title);
  if (track.artist) params.set('artist', track.artist);
  const r = await fetch(`/api/odesli?${params}`);
  if (!r.ok) throw new Error(`match failed (${r.status})`);
  return r.json(); // caller should check .quotaExceeded
}

// Search YouTube for alternative matches (used by the swap UI).
// Returns { configured, items: [{ youtubeId, title, channel, thumbnail }] }.
// configured=false means no API key is set yet — fall back to manual paste.
export async function searchYouTube(query) {
  const r = await fetch(`/api/youtube-search?q=${encodeURIComponent(query)}`);
  if (!r.ok) return { configured: false, items: [] };
  const data = await r.json();
  // Fire a Sentry alert if the YouTube API daily quota is exhausted
  if (data.quotaExceeded) {
    import('./sentry.js').then(({ captureQuotaExceeded }) => captureQuotaExceeded(query));
  }
  return data;
}

// Pull an 11-char YouTube video id out of any pasted YouTube URL or bare id.
export function parseYouTubeId(input) {
  if (!input) return null;
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s; // already a bare id
  const m = s.match(/(?:v=|youtu\.be\/|\/watch\?v=|\/embed\/|music\.youtube\.com\/watch\?v=)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
