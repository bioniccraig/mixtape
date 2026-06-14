// Share redirect endpoint — serves OG tags to crawlers, redirects real users to the SPA.
//
// URL format: /api/tape?n=TAPE_NAME&d=BASE64_ENCODED_TAPE
//   n = tape name (URI-encoded)
//   d = full tape data (base64, same as the #tape= hash)
//
// Crawlers (WhatsApp, iMessage, Twitter, etc.) read the og: tags then stop.
// Real users are immediately redirected by the <script> tag — no perceptible delay.

const SITE = 'https://mixtape-rho.vercel.app';
const OG_IMAGE = `${SITE}/og-image.png`;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default function handler(req, res) {
  const { n = '', d = '' } = req.query;
  const tapeName    = decodeURIComponent(n) || 'A MixTape';
  const encodedTape = encodeURIComponent(d); // safe to put in JS string
  const appUrl      = `${SITE}/#tape=${d}`;

  const title       = escapeHtml(`${tapeName} — MixTape`);
  const description = escapeHtml('Someone made you a mixtape. Press play.');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Cache for 1 hour — tape content doesn't change
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>

  <meta property="og:type"        content="website" />
  <meta property="og:site_name"   content="MixTape" />
  <meta property="og:title"       content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image"       content="${OG_IMAGE}" />
  <meta property="og:url"         content="${SITE}/api/tape?n=${encodeURIComponent(n)}&amp;d=${encodeURIComponent(d)}" />
  <meta name="twitter:card"       content="summary_large_image" />
  <meta name="twitter:title"      content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image"      content="${OG_IMAGE}" />
</head>
<body>
  <p style="font-family:sans-serif;color:#888;text-align:center;margin-top:40px">
    Opening your mixtape…
  </p>
  <script>window.location.replace(${JSON.stringify(appUrl)});</script>
</body>
</html>`);
}
