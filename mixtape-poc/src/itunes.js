// Music search — now powered by Deezer for much better results.
// Deezer is a streaming service so its search is ranked by popularity,
// not purchase intent — "blur" album returns Blur's self-titled album,
// not an obscure indie release that happens to be named "blur".

const DEEZER = '/api/deezer-search';
const lc = s => (s || '').toLowerCase();

// Normalise a name for comparison so cosmetic differences never filter a result out:
//   "&" ↔ "and", hyphens/punctuation → spaces, collapse spaces, drop leading "the".
// This is why "Mumford and Sons" matches "Mumford & Sons" and "blink 182" matches
// "blink-182" — the differences that broke search before are erased here.
function normalizeArtist(s) {
  return lc(s)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the\s+/, '');
}

// Loose artist match: normalize both sides, then check if either contains the other.
// Handles "The" prefix omissions and partial matches ("Simz" ≈ "Simz").
// We intentionally don't filter OUT results here — trust Deezer's ranking.
function artistMatch(resultName, queryName) {
  if (!queryName) return true;
  const r = normalizeArtist(resultName);
  const q = normalizeArtist(queryName);
  return r.includes(q) || q.includes(r);
}

// ── XHR helper (avoids iOS Safari ITP fetch restrictions) ────────────────────
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
    req.onerror   = () => reject(new Error('Network error'));
    req.ontimeout = () => reject(new Error('Request timed out'));
    req.send();
  });
}

// ── Album-only: find album, fetch its tracks ──────────────────────────────────
async function searchByAlbum(albumName) {
  const data = await xhr(`${DEEZER}?type=album&q=${encodeURIComponent(albumName)}`);
  const albums = data.data || [];
  if (!albums.length) return [];

  // Deezer already returns the canonical / most-popular album first (e.g. searching
  // "Let It Be" puts The Beatles' album top). We must NOT prefer an exact title match:
  // the real album is often titled "Let It Be (Remastered)" / "Blur (Special Edition)",
  // so `title === query` would skip it and pick an obscure single named exactly like
  // the album by a different artist. Instead, just drop 1-track "single" covers so they
  // can't outrank the real LP, and trust Deezer's popularity order.
  const real = albums.filter(a => a.record_type === 'album' && (a.nb_tracks || 0) > 1);
  const candidates = real.length ? real : albums;

  // Fetch tracks from up to 2 matching albums in parallel
  const groups = await Promise.all(
    candidates.slice(0, 2).map(album =>
      xhr(`${DEEZER}?type=album-tracks&id=${album.id}`)
        .then(d => (d.data || []).map(t => ({
          ...t,
          // album-tracks endpoint omits the album object — inject it
          album: { id: album.id, title: album.title, cover_medium: album.cover_medium },
          // use album artist as fallback if track artist is missing
          artist: t.artist || album.artist,
        })))
        .catch(() => [])
    )
  );

  return groups.flat()
    .filter(t => t.title && t.duration)
    .filter(t => lc(t.album.title).includes(lc(albumName)))
    .map(formatTrack);
}

// ── Artist-only: find artist, fetch top tracks ────────────────────────────────
async function searchByArtist(artistName) {
  const data = await xhr(`${DEEZER}?type=artist&q=${encodeURIComponent(artistName)}`);
  const artists = data.data || [];
  if (!artists.length) return [];

  // Prefer exact (normalized) artist name match, fall back to all results
  const exact = artists.filter(a => normalizeArtist(a.name) === normalizeArtist(artistName));
  const candidates = exact.length ? exact : artists;

  const groups = await Promise.all(
    candidates.slice(0, 2).map(artist =>
      xhr(`${DEEZER}?type=artist-top&id=${artist.id}`)
        .then(d => (d.data || []).map(t => ({
          ...t,
          artist: t.artist || { name: artist.name },
        })))
        .catch(() => [])
    )
  );

  return groups.flat()
    .filter(t => t.title && t.duration)
    .filter(t => artistMatch(t.artist?.name, artistName))
    .map(formatTrack);
}

// ── Track / multi-field search ───────────────────────────────────────────────
// We DON'T use Deezer's quoted advanced syntax (track:"..." artist:"...") here.
// Its quoted operator does a strict phrase match that silently returns ZERO results
// for titles carrying a version suffix or numerals — e.g. track:"One After 909"
// matches nothing because the catalogue title is "One After 909 (Remastered 2009)".
// A plain free-text query (track + artist + album words) is fuzzy AND popularity-ranked,
// so the canonical recording comes out on top. We then keep precise client-side
// filtering on artist/album so a supplied artist still narrows the list.
function searchByQuery(artist, track, album) {
  const q = [track, artist, album].filter(Boolean).join(' ').trim();
  return xhr(`${DEEZER}?type=track&q=${encodeURIComponent(q)}`).then(data =>
    (data.data || [])
      .filter(t => t.title && t.duration)
      .filter(t => {
        if (album  && !lc(t.album?.title).includes(lc(album))) return false;
        if (artist && !artistMatch(t.artist?.name, artist))    return false;
        return true;
      })
      .map(formatTrack)
  );
}

// ── Single-box general search ─────────────────────────────────────────────────
// The whole query goes to Deezer's general /search, which is fuzzy + popularity-
// ranked and handles "&"/"and", numbers and hyphens well on its own. We do NOT
// apply any client-side artist/album filtering here — that filtering is exactly
// what used to drop valid results — so we simply trust Deezer's ranking.
export function searchGeneral(query) {
  const q = (query || '').replace(/\s+/g, ' ').trim();
  if (!q) return Promise.resolve([]);
  return xhr(`${DEEZER}?type=track&q=${encodeURIComponent(q)}`).then(data =>
    (data.data || [])
      .filter(t => t.title && t.duration)
      .map(formatTrack)
  );
}

// ── Advanced multi-field export (kept for the optional Advanced search panel) ─
export function searchTracks({ artist = '', track = '', album = '' } = {}) {
  const a = artist.trim(), t = track.trim(), al = album.trim();
  if (!a && !t && !al) return Promise.resolve([]);

  if (al && !a && !t) return searchByAlbum(al);
  if (a  && !t && !al) return searchByArtist(a);
  return searchByQuery(a, t, al);
}

// ── Format Deezer track → internal shape ─────────────────────────────────────
function formatTrack(track) {
  const secs  = track.duration || 0;
  const m     = Math.floor(secs / 60);
  const s     = (secs % 60).toString().padStart(2, '0');
  return {
    id:            String(track.id),
    uri:           track.link || '',
    title:         track.title_short || track.title,
    artist:        track.artist?.name || '',
    album:         track.album?.title || '',
    artwork:       track.album?.cover_medium || null,
    durationMs:    secs * 1000,
    durationLabel: `${m}:${s}`,
    previewUrl:    track.preview || null,
  };
}
