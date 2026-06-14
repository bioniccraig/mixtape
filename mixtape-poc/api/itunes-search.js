// Vercel serverless function — proxies iTunes Search API server-side
// Avoids all client-side cross-origin restrictions (iOS Safari ITP, CORS, etc.)

export default async function handler(req, res) {
  const params = new URLSearchParams(req.query);
  const url = `https://itunes.apple.com/search?${params}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: `iTunes returned ${response.status}` });
    }
    const data = await response.json();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
