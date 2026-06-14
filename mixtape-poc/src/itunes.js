// iTunes Store Search API — free, no auth required
// Proxied through Vercel to avoid iOS Safari cross-origin restrictions

const ITUNES_PROXY = 'https://mixtape-rho.vercel.app/itunes-search';

export function searchTracks(query) {
  if (!query.trim()) return Promise.resolve([]);

  const params = new URLSearchParams({
    term: query,
    media: 'music',
    entity: 'song',
    limit: 20,
  });

  // Use XHR instead of fetch — avoids iOS Safari ITP fetch restrictions
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `${ITUNES_PROXY}?${params}`);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(
            data.results
              .filter(t => t.trackName && t.trackTimeMillis)
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
