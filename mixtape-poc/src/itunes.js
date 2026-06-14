// iTunes Store Search API — free, no auth required

// Proxied through Vercel to avoid iOS Safari cross-origin blocking
const ITUNES_API = '/itunes-search';

export async function searchTracks(query) {
  if (!query.trim()) return [];

  const params = new URLSearchParams({
    term: query,
    media: 'music',
    entity: 'song',
    limit: 20,
  });

  const res = await fetch(`${ITUNES_API}?${params}`);
  if (!res.ok) throw new Error(`iTunes API error: ${res.status}`);
  const data = await res.json();
  return data.results
    .filter(t => t.trackName && t.trackTimeMillis)
    .map(formatTrack);
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
