// Vercel serverless function — resolves a track to its YouTube equivalent via Odesli.
// Odesli matches on ISRC + metadata, which is far more precise than a raw text search.
// Free to use; an API key (ODESLI_API_KEY) raises the rate limit but is optional.
//
// Query: ?url=<iTunes/Apple Music trackViewUrl>   (preferred — carries ISRC identity)
//    or: ?id=<iTunes track id>&country=<2-letter>  (fallback)
//
// Returns: { youtubeId, youtubeUrl, title, artist, thumbnail } or { youtubeId: null }

/* global process */

function extractYouTubeId(url) {
  if (!url) return null;
  // Handles youtube.com/watch?v=ID, youtu.be/ID, music.youtube.com/watch?v=ID
  const m = url.match(/(?:v=|youtu\.be\/|\/watch\?v=)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  const { url, id, country = 'US' } = req.query;

  let songUrl = url;
  if (!songUrl && id) {
    songUrl = `https://music.apple.com/${country.toLowerCase()}/song/${id}`;
  }
  if (!songUrl) {
    return res.status(400).json({ error: 'url or id required' });
  }

  const params = new URLSearchParams({
    url: songUrl,
    userCountry: country,
    songIfSingle: 'true',
  });
  if (process.env.ODESLI_API_KEY) params.set('key', process.env.ODESLI_API_KEY);

  const endpoint = `https://api.song.link/v1-alpha.1/links?${params}`;

  try {
    const r = await fetch(endpoint);
    if (!r.ok) {
      // 429 = rate limited; surface it so the client can back off / retry later
      return res.status(r.status).json({ error: `Odesli returned ${r.status}`, youtubeId: null });
    }
    const data = await r.json();

    const yt = data.linksByPlatform?.youtube || data.linksByPlatform?.youtubeMusic;
    const youtubeUrl = yt?.url || null;
    const youtubeId = extractYouTubeId(youtubeUrl);

    let title = null, artist = null, thumbnail = null;
    const entityId = yt?.entityUniqueId;
    if (entityId && data.entitiesByUniqueId?.[entityId]) {
      const e = data.entitiesByUniqueId[entityId];
      title = e.title || null;
      artist = e.artistName || null;
      thumbnail = e.thumbnailUrl || null;
    }

    // Cache hard — a track's cross-platform match effectively never changes
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    res.json({ youtubeId, youtubeUrl, title, artist, thumbnail });
  } catch (err) {
    res.status(502).json({ error: err.message, youtubeId: null });
  }
}
