// iTunes Store Search API — free, no auth required
// Proxied through Vercel to avoid iOS Safari cross-origin restrictions

const ITUNES_SEARCH = '/api/itunes-search';
const ITUNES_LOOKUP = '/api/itunes-lookup';

const lc = s => (s || '').toLowerCase();

// ── Low-level XHR helper ──────────────────────────────────────────────────────
// Uses XHR instead of fetch — avoids iOS Safari ITP fetch restrictions.
function xhr(url) {
  return new Promise((resolve, reject) => {
    const req = new XMLHttpRequest();
    req.open('GET', url);
    req.timeout = 10000;
    req.onload = () => {
      if (req.status >= 200 && req.status < 300) {
        try { resolve(JSON.parse(req.responseText)); }
        catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
      } else {
        reject(new Error(`API error ${req.status}`));
      }
    };
    req.onerror   = () => reject(new Error('XHR network error'));
    req.ontimeout = () => reject(new Error('XHR timeout'));
    req.send();
  });
}

// ── Album-only two-step search ────────────────────────────────────────────────
// Why two steps? iTunes albumTerm is only valid for entity=album, not entity=song.
// Passing it with entity=song makes iTunes ignore it and search by song title instead.
async function searchByAlbum(albumName) {
  // Step 1: find albums whose name matches
  const albumParams = new URLSearchParams({
    term: albumName,
    media: 'music',
    entity: 'album',
    attribute: 'albumTerm',
    limit: 10,
  });
  const albumData = await xhr(`${ITUNES_SEARCH}?${albumParams}`);
  const albums = (albumData.results || []).filter(r => r.collectionType === 'Album');
  if (!albums.length) return [];

  // Prefer exact album name match — critical for self-titled albums like "Blur" by Blur.
  // Fall back to all candidates if no exact match (e.g. "Harvest Moon" → "Harvest Moon EP").
  const exactMatches = albums.filter(a => lc(a.collectionName) === lc(albumName));
  const candidates = exactMatches.length > 0 ? exactMatches : albums;

  // Step 2: look up songs from the best matching album(s) — cap at 2 to avoid noise
  const ids = candidates.slice(0, 2).map(a => a.collectionId).join(',');
  const trackData = await xhr(`${ITUNES_LOOKUP}?id=${ids}&entity=song`);

  return (trackData.results || [])
    .filter(r => r.wrapperType === 'track' && r.trackName && r.trackTimeMillis)
    // Use includes (not ===) — iTunes may append "(Deluxe Edition)" etc. to collectionName
    .filter(r => lc(r.collectionName).includes(lc(albumName)))
    .map(formatTrack);
}

// ── Artist-only two-step search ───────────────────────────────────────────────
// artistTerm on entity=song is unreliable for short/common words (e.g. "blur").
// Find the artist entity first, then look up their songs by artistId.
async function searchByArtist(artistName) {
  // Step 1: find the artist
  const artistParams = new URLSearchParams({
    term: artistName,
    media: 'music',
    entity: 'musicArtist',
    attribute: 'artistTerm',
    limit: 5,
  });
  const artistData = await xhr(`${ITUNES_SEARCH}?${artistParams}`);
  const artists = (artistData.results || []).filter(r => r.wrapperType === 'artist');
  if (!artists.length) return [];

  // Prefer exact artist name match
  const exactMatches = artists.filter(a => lc(a.artistName) === lc(artistName));
  const candidates = exactMatches.length > 0 ? exactMatches : artists;

  // Step 2: look up songs by artistId
  const ids = candidates.slice(0, 2).map(a => a.artistId).join(',');
  const trackData = await xhr(`${ITUNES_LOOKUP}?id=${ids}&entity=song`);

  return (trackData.results || [])
    .filter(r => r.wrapperType === 'track' && r.trackName && r.trackTimeMillis)
    .filter(r => lc(r.artistName).includes(lc(artistName)))
    .map(formatTrack);
}

// ── Main export ───────────────────────────────────────────────────────────────
export function searchTracks({ artist = '', track = '', album = '' } = {}) {
  const a = artist.trim(), t = track.trim(), al = album.trim();
  if (!a && !t && !al) return Promise.resolve([]);

  // Single-field searches: use two-step lookups for reliable results
  if (al && !a && !t) return searchByAlbum(al);
  if (a  && !t && !al) return searchByArtist(a);

  // Track-only or multi-field: standard search with client-side filtering
  let term, attribute;
  const filled = [a, t, al].filter(Boolean);
  if (filled.length === 1) {
    // Track-only
    term = t;
    attribute = 'songTerm';
  } else {
    // Multiple fields — combine into one query
    term = filled.join(' ');
  }

  const params = new URLSearchParams({
    term,
    media: 'music',
    entity: 'song',
    limit: 50,
    ...(attribute ? { attribute } : {}),
  });

  return xhr(`${ITUNES_SEARCH}?${params}`).then(data =>
    (data.results || [])
      .filter(r => r.trackName && r.trackTimeMillis)
      // Client-side: enforce any album/artist constraints not handled by iTunes
      .filter(r => {
        if (al && !lc(r.collectionName).includes(lc(al))) return false;
        if (a  && !lc(r.artistName).includes(lc(a)))      return false;
        return true;
      })
      .map(formatTrack)
  );
}

// ── Format raw iTunes result into our track shape ─────────────────────────────
function formatTrack(track) {
  const ms = track.trackTimeMillis || 0;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = (total % 60).toString().padStart(2, '0');
  return {
    id:            String(track.trackId),
    uri:           track.trackViewUrl || '',
    title:         track.trackName,
    artist:        track.artistName,
    album:         track.collectionName || '',
    artwork:       track.artworkUrl100?.replace('100x100bb', '300x300bb') || track.artworkUrl100,
    durationMs:    ms,
    durationLabel: `${m}:${s}`,
    previewUrl:    track.previewUrl || null,
  };
}
