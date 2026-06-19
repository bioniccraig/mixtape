// Vercel serverless function — resolves a track to its YouTube equivalent.
//
// Matching strategy (fastest/cheapest first):
//   0. Supabase cache      — instant, zero cost. Hits on any track matched before.
//   1. Deezer → ISRC → MusicBrainz — free, ISRC-based (replaces retired Odesli API).
//   2. Invidious           — free open-source YouTube search, no quota.
//   2b. Piped              — free open-source YouTube search (different backend), no quota.
//   3. YouTube Data API    — paid last resort (100 units). Only if 1, 2 & 2b all fail.
//
// NOTE: Odesli (song.link v1-alpha.1) was retired July 31 2026.
//       We now get the ISRC directly from the Deezer API (free, no auth) and look up
//       YouTube links via MusicBrainz's community database (also free).
//
// Query: ?url=<Deezer trackUrl>&title=<t>&artist=<a>
//    or: ?id=<Deezer track id>&title=<t>&artist=<a>
//
// Returns: { youtubeId, youtubeUrl, title, artist, thumbnail, via }

/* global process */

import { db } from './_supabase.js';
import { blockedByOrigin } from './_guard.js';

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

// ── Deezer → ISRC ────────────────────────────────────────────────────────────
// Deezer's public API requires no key and returns the ISRC for any track.
async function getIsrcFromDeezer(numericId) {
  if (!numericId) return null;
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(`https://api.deezer.com/track/${numericId}`, { signal: controller.signal });
    clearTimeout(tid);
    if (!r.ok) return null;
    const data = await r.json();
    return data.isrc || null;
  } catch { return null; }
}

// ── MusicBrainz — ISRC → YouTube URL ─────────────────────────────────────────
// MusicBrainz is a community music database. Editors link recordings to YouTube
// videos, giving us a free, ISRC-based YouTube match with zero quota cost.
// Rate limit: 1 req/sec without auth — fine for per-invocation serverless calls.
async function youtubeFromMusicBrainz(isrc, wantLive) {
  if (!isrc) return null;
  try {
    // Step 1: find the recording MBID for this ISRC
    const searchCtrl = new AbortController();
    const searchTid  = setTimeout(() => searchCtrl.abort(), 4000);
    const searchParams = new URLSearchParams({ query: `isrc:${isrc}`, fmt: 'json', limit: '5' });
    const searchRes = await fetch(
      `https://musicbrainz.org/ws/2/recording?${searchParams}`,
      {
        headers: { 'User-Agent': 'MixTape/1.0 (mixtape-rho.vercel.app)' },
        signal: searchCtrl.signal,
      }
    );
    clearTimeout(searchTid);
    if (!searchRes.ok) return null;

    const searchData  = await searchRes.json();
    const recordings  = searchData.recordings || [];
    if (!recordings.length) return null;

    // Step 2: for each recording (best score first), fetch URL relations
    for (const rec of recordings) {
      if (!rec.id) continue;
      try {
        const relCtrl = new AbortController();
        const relTid  = setTimeout(() => relCtrl.abort(), 4000);
        const relRes  = await fetch(
          `https://musicbrainz.org/ws/2/recording/${rec.id}?inc=url-rels&fmt=json`,
          {
            headers: { 'User-Agent': 'MixTape/1.0 (mixtape-rho.vercel.app)' },
            signal: relCtrl.signal,
          }
        );
        clearTimeout(relTid);
        if (!relRes.ok) continue;

        const relData  = await relRes.json();
        const relations = relData.relations || [];

        // Collect all YouTube IDs from relations, score them
        const candidates = relations
          .map(rel => rel.url?.resource)
          .filter(Boolean)
          .map(url => extractYouTubeId(url))
          .filter(Boolean);

        if (!candidates.length) continue;

        // Use the first (MusicBrainz editors tend to link official versions first)
        const ytId = candidates[0];
        return {
          youtubeId:  ytId,
          youtubeUrl: `https://www.youtube.com/watch?v=${ytId}`,
          title:      relData.title || rec.title || null,
          artist:     relData['artist-credit']?.[0]?.artist?.name || null,
          thumbnail:  null, // MusicBrainz doesn't carry thumbnails
          via:        'musicbrainz',
        };
      } catch { continue; }
    }
    return null;
  } catch { return null; }
}

// Is the video allowed to be embedded off-YouTube?
// Costs 1 unit (video.list part=status) — much cheaper than a search (100 units).
// Only called when YOUTUBE_API_KEY is set; skipped otherwise.
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
// List sourced from https://api.invidious.io/ — pick instances with good uptime.
const INVIDIOUS_INSTANCES = [
  'inv.nadeko.net',
  'invidious.privacydev.net',
  'yewtu.be',
  'iv.datura.network',
  'invidious.nerdvpn.de',
  'invidious.tiekoetter.com',
];

async function searchInvidious(query, wantLive) {
  if (!query.trim()) return null;
  for (const host of INVIDIOUS_INSTANCES) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 3000);
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

// ── Piped (free fallback) ─────────────────────────────────────────────────────
// Piped is another open-source YouTube frontend with a public API, independent
// of the Invidious network. Different hosting/backend, so when Invidious instances
// are rate-limited or down, Piped often still works — no API key, no quota cost.
// Instances: https://github.com/TeamPiped/Piped/wiki/Instances
const PIPED_INSTANCES = [
  'pipedapi.kavin.rocks',
  'pipedapi.adminforge.de',
  'pipedapi.reallyaweso.me',
  'api.piped.yt',
  'pipedapi.leptons.xyz',
];

async function searchPiped(query, wantLive) {
  if (!query.trim()) return null;
  for (const host of PIPED_INSTANCES) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 3000);
      const params = new URLSearchParams({ q: query, filter: 'music_songs' });
      const r = await fetch(`https://${host}/search?${params}`, { signal: controller.signal });
      clearTimeout(tid);
      if (!r.ok) continue;
      const data = await r.json();
      // Piped returns { items: [{ url:"/watch?v=ID", title, uploaderName, thumbnail }] }
      const items = Array.isArray(data.items) ? data.items : [];
      const ranked = items
        .map(it => ({ it, id: extractYouTubeId(it.url) }))
        .filter(x => x.id)
        .map((x, idx) => ({ ...x, score: scoreResult(x.it.title, x.it.uploaderName, idx, wantLive) }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      if (!best) continue;
      return {
        youtubeId:  best.id,
        youtubeUrl: `https://www.youtube.com/watch?v=${best.id}`,
        title:      best.it.title        || null,
        artist:     best.it.uploaderName || null,
        thumbnail:  best.it.thumbnail    || null,
        via:        'piped',
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
    title:      it.snippet?.title        || null,
    artist:     it.snippet?.channelTitle || null,
    thumbnail:  it.snippet?.thumbnails?.default?.url || null,
    via:        'youtube',
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (blockedByOrigin(req)) return res.status(403).json({ error: 'Forbidden', youtubeId: null });
  const { url, id, title = '', artist = '', country = 'US' } = req.query;

  if (!url && !id && !title) {
    return res.status(400).json({ error: 'url, id or title required', youtubeId: null });
  }

  const wantLive = /\blive\b/i.test(title);
  const ck = cacheKey(url, id);

  // 0) Cache — zero cost for any track matched before
  const cached = await cacheGet(ck);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    return res.json(cached);
  }

  let result = null;

  // 1) Deezer → ISRC → MusicBrainz — free, ISRC-based, highest quality
  //    Extract numeric Deezer ID from the cache key ("d:12345" → "12345")
  const numericDeezerId = ck?.startsWith('d:') ? ck.slice(2) : null;
  if (numericDeezerId) {
    try {
      const isrc = await getIsrcFromDeezer(numericDeezerId);
      if (isrc) {
        const mb = await youtubeFromMusicBrainz(isrc, wantLive);
        if (mb && await isEmbeddable(mb.youtubeId)) {
          result = mb;
        }
      }
    } catch { /* fall through */ }
  }

  // 2) Invidious — free text search, no quota cost
  if (!result) {
    try {
      result = await searchInvidious(`${artist} ${title}`.trim(), wantLive);
    } catch { /* fall through */ }
  }

  // 2b) Piped — free text search (independent backend), no quota cost
  if (!result) {
    try {
      result = await searchPiped(`${artist} ${title}`.trim(), wantLive);
    } catch { /* fall through */ }
  }

  // 3) YouTube Data API — paid last resort
  if (!result) {
    try {
      result = await searchYouTube(`${artist} ${title}`.trim(), wantLive);
    } catch { /* fall through */ }
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
