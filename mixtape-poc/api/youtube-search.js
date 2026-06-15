// Vercel serverless function — searches YouTube for alternative matches when the
// automatic (Odesli) match is wrong and the creator wants to swap it.
//
// Requires a free YouTube Data API key in the YOUTUBE_API_KEY env var.
// Until that key is set, this returns { configured: false, items: [] } with a 200,
// so the UI degrades gracefully to manual "paste a YouTube link" instead.
//
// Query: ?q=<search text>

/* global process */

export default async function handler(req, res) {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q required', items: [] });

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    // Not an error — feature simply isn't switched on yet.
    return res.status(200).json({ configured: false, items: [] });
  }

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    videoCategoryId: '10', // Music
    maxResults: '6',
    q,
    key,
  });

  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!r.ok) {
      // Detect quota exhaustion specifically — different handling from other errors
      if (r.status === 403) {
        let body = {};
        try { body = await r.json(); } catch { /* ignore parse failure */ }
        const reason = body?.error?.errors?.[0]?.reason;
        if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
          // Return 429 so the client knows to fire a Sentry alert
          console.error('[youtube-search] quota exceeded:', reason);
          return res.status(429).json({ configured: true, quotaExceeded: true, error: 'YouTube API daily quota exceeded', items: [] });
        }
      }
      return res.status(r.status).json({ configured: true, error: `YouTube returned ${r.status}`, items: [] });
    }
    const data = await r.json();
    const items = (data.items || []).map(it => ({
      youtubeId: it.id?.videoId,
      title: it.snippet?.title,
      channel: it.snippet?.channelTitle,
      thumbnail: it.snippet?.thumbnails?.default?.url || null,
    })).filter(it => it.youtubeId);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.json({ configured: true, items });
  } catch (err) {
    res.status(502).json({ configured: true, error: err.message, items: [] });
  }
}
