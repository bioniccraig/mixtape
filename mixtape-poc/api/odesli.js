// Vercel serverless function — resolves a track to its YouTube equivalent.
//
// Matching strategy (all aimed at: the right STUDIO version, and one that can
// actually be embedded/played off-YouTube):
//   1. Odesli (ISRC + metadata) — try its YouTube Music art-track first (official
//      studio audio, usually embeddable), then its plain YouTube link.
//   2. YouTube Data API search — fallback, ranked to prefer official "Topic"/audio
//      uploads and avoid live/cover/remix versions (unless the track itself is live).
//
// Query: ?url=<iTunes/Apple Music trackViewUrl>&title=<t>&artist=<a>
//    or: ?id=<iTunes track id>&title=<t>&artist=<a>&country=<2-letter>
//
// Returns: { youtubeId, youtubeUrl, title, artist, thumbnail, via }

/* global process */

function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|\/watch\?v=|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// Returns ordered candidate ids from Odesli: YouTube Music (studio audio) first.
async function odesliCandidates(songUrl, country) {
  const params = new URLSearchParams({ url: songUrl, userCountry: country, songIfSingle: 'true' });
  if (process.env.ODESLI_API_KEY) params.set('key', process.env.ODESLI_API_KEY);
  const r = await fetch(`https://api.song.link/v1-alpha.1/links?${params}`);
  if (!r.ok) return [];
  const data = await r.json();
  const cands = [];
  for (const platform of ['youtubeMusic', 'youtube']) {
    const yt = data.linksByPlatform?.[platform];
    const id = extractYouTubeId(yt?.url);
    if (!id || cands.some(c => c.youtubeId === id)) continue;
    let title = null, artist = null, thumbnail = null;
    const e = yt.entityUniqueId && data.entitiesByUniqueId?.[yt.entityUniqueId];
    if (e) { title = e.title || null; artist = e.artistName || null; thumbnail = e.thumbnailUrl || null; }
    cands.push({ youtubeId: id, youtubeUrl: `https://www.youtube.com/watch?v=${id}`, title, artist, thumbnail, via: 'odesli' });
  }
  return cands;
}

// Is the video allowed to be embedded off-YouTube? Vevo/major-label videos often
// return embeddable:false — they play on youtube.com but not inside an app.
async function isEmbeddable(id) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !id) return true;
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${id}&key=${key}`);
    if (!r.ok) return true;
    const st = (await r.json()).items?.[0]?.status;
    return !st || st.embeddable !== false;
  } catch { return true; }
}

// Score a YouTube result for "is this the studio version?" Higher = better.
function scoreResult(snippet, idx, wantLive) {
  const t = (snippet?.title || '').toLowerCase();
  const ch = (snippet?.channelTitle || '').toLowerCase();
  let s = -idx; // gentle nod to YouTube's own relevance order
  if (ch.endsWith('- topic')) s += 120;              // auto-generated official studio audio
  if (t.includes('official audio')) s += 80;
  else if (t.includes('audio')) s += 25;
  if (t.includes('official video') || t.includes('official music video')) s += 35;
  const heavy = ['live', 'cover', 'remix', 'karaoke', 'instrumental', 'sped up', 'slowed', '8d', 'reaction', 'tribute', 'mashup'];
  for (const b of heavy) {
    if (t.includes(b)) {
      if (b === 'live' && wantLive) continue; // user actually wants the live cut
      s -= 90;
    }
  }
  if (t.includes('lyric')) s -= 15; // lyric videos are studio audio but prefer a clean upload
  return s;
}

async function searchYouTube(query, wantLive) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !query.trim()) return null;
  const params = new URLSearchParams({
    part: 'snippet', type: 'video', videoEmbeddable: 'true', videoCategoryId: '10',
    maxResults: '10', q: query, key,
  });
  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!r.ok) return null;
  const items = ((await r.json()).items || []).filter(it => it.id?.videoId);
  if (!items.length) return null;
  const ranked = items
    .map((it, idx) => ({ it, score: scoreResult(it.snippet, idx, wantLive) }))
    .sort((a, b) => b.score - a.score);
  const it = ranked[0].it;
  return {
    youtubeId: it.id.videoId,
    youtubeUrl: `https://www.youtube.com/watch?v=${it.id.videoId}`,
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

  const wantLive = /\blive\b/i.test(title);
  let result = null;

  // 1) Odesli candidates (studio audio first), use the first embeddable one.
  try {
    if (songUrl) {
      const cands = await odesliCandidates(songUrl, country);
      for (const c of cands) {
        if (await isEmbeddable(c.youtubeId)) { result = c; break; }
      }
    }
  } catch { /* fall through */ }

  // 2) Ranked YouTube search fallback (prefers studio, avoids live unless wanted).
  if (!result) {
    try { result = await searchYouTube(`${artist} ${title}`.trim(), wantLive); } catch { /* none */ }
  }

  if (!result) return res.json({ youtubeId: null, via: null });

  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
  res.json(result);
}
