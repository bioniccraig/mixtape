// Music search — now powered by Deezer for much better results.
// Deezer is a streaming service so its search is ranked by popularity,
// not purchase intent — "blur" album returns Blur's self-titled album,
// not an obscure indie release that happens to be named "blur".

const DEEZER = '/api/deezer-search';
const lc = s => (s || '').toLowerCase();

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

  // Prefer exact title match (handles self-titled albums like Blur's "Blur")
  const exact = albums.filter(a => lc(a.title) === lc(albumName));
  const candidates = exact.length ? exact : albums;

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

  // Prefer exact artist name match
  const exact = artists.filter(a => lc(a.name) === lc(artistName));
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
    .filter(t => lc(t.artist?.name || '').includes(lc(artistName)))
    .map(formatTrack);
}

// ── Track / multi-field: Deezer advanced query syntax ────────────────────────
function searchByQuery(artist, track, album) {
  // Deezer supports: track:"harvest moon" artist:"neil young" album:"harvest"
  const parts = [];
  if (track)  parts.push(`track:"${track}"`);
  if (artist) parts.push(`artist:"${artist}"`);
  if (album)  parts.push(`album:"${album}"`);

  const q = parts.join(' ');
  return xhr(`${DEEZER}?type=track&q=${encodeURIComponent(q)}`).then(data =>
    (data.data || [])
      .filter(t => t.title && t.duration)
      .filter(t => {
        if (album  && !lc(t.album?.title).includes(lc(album)))   return false;
        if (artist && !lc(t.artist?.name).includes(lc(artist)))  return false;
        return true;
      })
      .map(formatTrack)
  );
}

// ── Main export (same signature as before — no changes needed in TapeBuilder) ─
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
