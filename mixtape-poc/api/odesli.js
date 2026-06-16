// Vercel serverless function — resolves a track to its YouTube equivalent.
//
// Matching strategy (fastest/cheapest first):
//   0. Supabase cache  — instant, zero API units. Hits on any track matched before.
//   1. Odesli          — ISRC-based, ~50-80% hit rate (better with ODESLI_API_KEY env var).
//   2. Invidious       — free open-source YouTube search, no quota. Used when Odesli misses.
//   3. YouTube Data API — paid fallback (100 units). Only reached if 1 & 2 both fail.
//
// Query: ?url=<Deezer/Apple Music trackViewUrl>&title=<t>&artist=<a>
//    or: ?id=<Deezer track id>&title=<t>&artist=<a>
//
// Returns: { youtubeId, youtubeUrl, title, artist, thumbnail, via }

/* global process */

import { db } from './_supabase.js';

// ── Cache key ─────────────────────────────────────────────────────────────────
// Extract Deezer track ID from URL or use the id param directly.
// Returns a stable key like "d:3135556", or null if we can't derive one.
function cacheKey(url, id) {
  if (id) return `d:${id}`;
  const m = (url || '').match(/deezer\.com\/(?:\w+\/)?track\/(\d+)/);
  return m ? `d:${m[1]}` : null;
}

// ── Cache read ────────────────────────────────────────────────────────────────
async function cacheGet(key) {
  if (!db || !key) return null;
  try {
    const { data } = await db
      .from('track_matches')
      .select('yt_id, yt_title, yt_channel, yt_thumbnail')
      .eq('deezer_id', key)
      .single();
    if (!data?.yt_id) return null;
    return {
      youtubeId:  data.yt_id,
      youtubeUrl: `https://www.youtube.com/watch?v=${data.yt_id}`,
      title:      data.yt_title   || null,
      artist:     data.yt_channel || null,
      thumbnail:  data.yt_thumbnail || null,
      via:        'cache',
    };
  } catch { return null; }
}

// ── Cache write ───────────────────────────────────────────────────────────────
async function cacheSet(key, result) {
  if (!db || !key || !result?.youtubeId) return;
  try {
    await db.from('track_matches').upsert({
      deezer_id:    key,
      yt_id:        result.youtubeId,
      yt_title:     result.title     || null,
      yt_channel:   result.artist    || null,
      yt_thumbnail: result.thumbnail || null,
    }, { onConflict: 'deezer_id' });
  } catch { /* non-fatal */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|\/watch\?v=|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// Score a YouTube result for "is this the studio version?" Higher = better.
function scoreResult(title, channelTitle, idx, wantLive) {
  const t  = (title        || '').toLowerCase();
  const ch = (channelTitle || '').toLowerCase();
  let s = -idx;
  if (ch.endsWith('- topic'))                                              s += 120;
  if (t.includes('official audio'))                                        s += 80;
  else if (t.includes('audio'))                                            s += 25;
  if (t.includes('official video') || t.includes('official music video'))  s += 35;
  const heavy = ['live', 'cover', 'remix', 'karaoke', 'instrumental', 'sped up', 'slowed', '8d', 'reaction', 'tribute', 'mashup'];
  for (const b of heavy) {
    if (t.includes(b)) {
      if (b === 'live' && wantLive) continue;
      s -= 90;
    }
  }
  if (t.includes('lyric')) s -= 15;
  return s;
}

// ── Odesli ────────────────────────────────────────────────────────────────────
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

// Is the video allowed to be embedded off-YouTube?
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

// ── Invidious (free fallback) ─────────────────────────────────────────────────
// Tries open-source YouTube frontend instances in sequence.
// No API key, no quota cost. Falls through silently if all instances are down.
const INVIDIOUS_INSTANCES = [
  'inv.nadeko.net',
  'invidious.privacydev.net',
  'yewtu.be',
];

async function searchInvidious(query, wantLive) {
  if (!query.trim()) return null;
  for (const host of INVIDIOUS_INSTANCES) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 2500);
      const params = new URLSearchParams({
        q: query, type: 'video',
        fields: 'videoId,title,author,videoThumbnails',
      });
      const r = await fetch(`https://${host}/api/v1/search?${params}`, { signal: controller.signal });
      clearTimeout(tid);
      if (!r.ok) continue;
      const items = await r.json();
      if (!Array.isArray(items) || !items.length) continue;
      const ranked = items
        .filter(it => it.videoId)
        .map((it, idx) => ({ it, score: scoreResult(it.title, it.author, idx, wantLive) }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0]?.it;
      if (!best) continue;
      return {
        youtubeId:  best.videoId,
        youtubeUrl: `https://www.youtube.com/watch?v=${best.videoId}`,
        title:      best.title  || null,
        artist:     best.author || null,
        thumbnail:  best.videoThumbnails?.[0]?.url || null,
        via:        'invidious',
      };
    } catch { continue; }
  }
  return null;
}

// ── YouTube Data API (paid, last resort) ──────────────────────────────────────
async function searchYouTube(query, wantLive) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !query.trim()) return null;
  const params = new URLSearchParams({
    part: 'snippet', type: 'video', videoEmbeddable: 'true', videoCategoryId: '10',
    maxResults: '10', q: query, key,
  });
  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!r.ok) {
    if (r.status === 403) {
      let body = {};
      try { body = await r.json(); } catch { /* ignore */ }
      const reason = body?.error?.errors?.[0]?.reason;
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
        console.error('[odesli] YouTube quota exceeded');
        return { quotaExceeded: true };
      }
    }
    return null;
  }
  const items = ((await r.json()).items || []).filter(it => it.id?.videoId);
  if (!items.length) return null;
  const ranked = items
    .map((it, idx) => ({ it, score: scoreResult(it.snippet?.title, it.snippet?.channelTitle, idx, wantLive) }))
    .sort((a, b) => b.score - a.score);
  const it = ranked[0].it;
  return {
    youtubeId:  it.id.videoId,
    youtubeUrl: `https://www.youtube.com/watch?v=${it.id.videoId}`,
    title:      it.snippet?.title       || null,
    artist:     it.snippet?.channelTitle || null,
    thumbnail:  it.snippet?.thumbnails?.default?.url || null,
    via:        'youtube',
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const { url, id, title = '', artist = '', country = 'US' } = req.query;

  let songUrl = url;
  if (!songUrl && id) songUrl = `https://music.apple.com/${country.toLowerCase()}/song/${id}`;
  if (!songUrl && !title) return res.status(400).json({ error: 'url, id or title required', youtubeId: null });

  const wantLive = /\blive\b/i.test(title);
  const ck = cacheKey(url, id);

  // 0) Cache — zero API cost for any track matched before
  const cached = await cacheGet(ck);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    return res.json(cached);
  }

  let result = null;

  // 1) Odesli — ISRC-based, highest quality match
  try {
    if (songUrl) {
      const cands = await odesliCandidates(songUrl, country);
      for (const c of cands) {
        if (await isEmbeddable(c.youtubeId)) { result = c; break; }
      }
    }
  } catch { /* fall through */ }

  // 2) Invidious — free search, no quota cost
  if (!result) {
    try { result = await searchInvidious(`${artist} ${title}`.trim(), wantLive); } catch { /* fall through */ }
  }

  // 3) YouTube Data API — paid last resort
  if (!result) {
    try { result = await searchYouTube(`${artist} ${title}`.trim(), wantLive); } catch { /* none */ }
  }

  // Quota exhaustion — tell the client so it can show a clear message
  if (result?.quotaExceeded) {
    return res.json({ youtubeId: null, via: null, quotaExceeded: true });
  }

  if (!result) return res.json({ youtubeId: null, via: null });

  // Save to cache so future requests for this track cost nothing
  cacheSet(ck, result);

  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
  res.json(result);
}
