// iTunes Store Search API — free, no auth required
// Proxied through Vercel to avoid iOS Safari cross-origin restrictions

// Relative URL — works on any domain, handled by Vercel serverless function
const ITUNES_PROXY = '/api/itunes-search';

// Search by structured fields: { artist, track, album }
// Uses iTunes attribute narrowing when only one field is filled.
export function searchTracks({ artist = '', track = '', album = '' } = {}) {
  const a = artist.trim(), t = track.trim(), al = album.trim();
  if (!a && !t && !al) return Promise.resolve([]);

  // Pick the most specific attribute when only one field is filled
  let term, attribute;
  const filled = [a, t, al].filter(Boolean);
  if (filled.length === 1) {
    term = filled[0];
    if (a)  attribute = 'artistTerm';
    if (t)  attribute = 'songTerm';
    if (al) attribute = 'albumTerm';
  } else {
    // Multiple fields — combine them into one query (iTunes handles it well)
    term = [a, t, al].filter(Boolean).join(' ');
  }

  const params = new URLSearchParams({
    term,
    media: 'music',
    entity: 'song',
    limit: 50,
    ...(attribute ? { attribute } : {}),
  });

  // Use XHR instead of fetch — avoids iOS Safari ITP fetch restrictions
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `${ITUNES_PROXY}?${params}`);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          const lc = s => (s || '').toLowerCase();
          resolve(
            data.results
              .filter(r => r.trackName && r.trackTimeMillis)
              // Client-side enforcement: iTunes attribute search leaks results
              // where the term appears in other fields (e.g. album search returns
              // tracks whose title matches). We re-filter strictly here.
              .filter(r => {
                if (al && !lc(r.collectionName).includes(lc(al))) return false;
                if (a  && !lc(r.artistName).includes(lc(a)))      return false;
                return true;
              })
              .map(formatTrack)
          );
        } catch (e) {
          reject(new Error('JSON parse error: ' + e.message));
        }
      } else {
        reject(new Error(`API error ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('XHR network error'));
    xhr.ontimeout = () => reject(new Error('XHR timeout'));
    xhr.timeout = 10000;
    xhr.send();
  });
}

function formatTrack(track) {
  const ms = track.trackTimeMillis || 0;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = (total % 60).toString().padStart(2, '0');
  return {
    id: String(track.trackId),
    uri: track.trackViewUrl || '',
    title: track.trackName,
    artist: track.artistName,
    album: track.collectionName || '',
    artwork: track.artworkUrl100?.replace('100x100bb', '300x300bb') || track.artworkUrl100,
    durationMs: ms,
    durationLabel: `${m}:${s}`,
    previewUrl: track.previewUrl || null,
  };
}
