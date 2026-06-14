// Vercel serverless function — resolves a track to its YouTube equivalent.
//
// Two-stage matching for resilience:
//   1. Odesli (ISRC + metadata) — most precise, gets the right *version*. Free,
//      but the keyless tier is rate-limited, so it can come back empty under load.
//   2. YouTube Data API search (artist + title) — fallback so a findable song
//      never returns a dead match. Less version-precise, which is exactly what the
//      confirm-at-build step is there to catch.
//
// Query: ?url=<iTunes/Apple Music trackViewUrl>&title=<t>&artist=<a>
//    or: ?id=<iTunes track id>&title=<t>&artist=<a>&country=<2-letter>
//
// Returns: { youtubeId, youtubeUrl, title, artist, thumbnail, via } (via: 'odesli'|'youtube'|null)

/* global process */

function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|\/watch\?v=|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function tryOdesli(songUrl, country) {
  const params = new URLSearchParams({
    url: songUrl,
    userCountry: country,
    songIfSingle: 'true',
  });
  if (process.env.ODESLI_API_KEY) params.set('key', process.env.ODESLI_API_KEY);

  const r = await fetch(`https://api.song.link/v1-alpha.1/links?${params}`);
  if (!r.ok) return null; // 429 / 4xx → let the caller fall back
  const data = await r.json();

  const yt = data.linksByPlatform?.youtube || data.linksByPlatform?.youtubeMusic;
  const youtubeId = extractYouTubeId(yt?.url);
  if (!youtubeId) return null;

  let title = null, artist = null, thumbnail = null;
  const entityId = yt?.entityUniqueId;
  if (entityId && data.entitiesByUniqueId?.[entityId]) {
    const e = data.entitiesByUniqueId[entityId];
    title = e.title || null;
    artist = e.artistName || null;
    thumbnail = e.thumbnailUrl || null;
  }
  return { youtubeId, youtubeUrl: yt.url, title, artist, thumbnail, via: 'odesli' };
}

async function tryYouTube(query) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !query.trim()) return null;

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    videoCategoryId: '10', // Music
    maxResults: '1',
    q: query,
    key,
  });
  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!r.ok) return null;
  const data = await r.json();
  const it = (data.items || [])[0];
  const youtubeId = it?.id?.videoId;
  if (!youtubeId) return null;
  return {
    youtubeId,
    youtubeUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
    title: it.snippet?.title || null,
    artist: it.snippet?.channelTitle || null,
    thumbnail: it.snippet?.thumbnails?.default?.url || null,
    via: 'youtube',
  };
}

export default async function handler(req, res) {
  const { url, id, title = '', artist = '', country = 'US' } = req.query;

  let songUrl = url;
  if (!songUrl && id) songUrl = `https://music.apple.com/${country.toLowerCase()}/song/${id}`;
  if (!songUrl && !title) return res.status(400).json({ error: 'url, id or title required', youtubeId: null });

  let result = null;
  try {
    if (songUrl) result = await tryOdesli(songUrl, country);
  } catch { /* fall through to YouTube */ }

  if (!result) {
    try {
      result = await tryYouTube(`${artist} ${title}`.trim());
    } catch { /* nothing left to try */ }
  }

  if (!result) {
    return res.json({ youtubeId: null, via: null });
  }

  // Cache hard — a track's match effectively never changes
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
  res.json(result);
}
