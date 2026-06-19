// Shared same-origin guard for the public proxy endpoints.
// The _ prefix means Vercel does NOT expose this as a serverless function.
//
// These proxies (Deezer / YouTube / Apple search, MusicKit token) have no auth, so
// anyone who finds the URL could hammer them from another site and burn our YouTube
// API quota. This is a lightweight deterrent: if a request carries an Origin/Referer
// that is NOT one of our own hosts, reject it. Requests with NO Origin/Referer are
// allowed through — same-origin GETs and privacy-hardened browsers legitimately omit
// them, and we'd rather not break real users. It stops casual cross-site abuse, not a
// determined attacker (impossible without per-user auth on a public client).

const ALLOWED_HOST = [
  /\.vercel\.app$/,            // production + every preview deploy
  /(^|\.)sayitwithmusic\.net$/, // the real domain (once DNS lands) + www
  /^localhost(:\d+)?$/,        // local dev
];

function hostAllowed(host) {
  return !!host && ALLOWED_HOST.some(re => re.test(host));
}

// Returns true if the request should be REJECTED.
export function blockedByOrigin(req) {
  const src = req.headers.origin || req.headers.referer || '';
  if (!src) return false; // no header → allow (don't break privacy-conscious users)
  try {
    return !hostAllowed(new URL(src).host);
  } catch {
    return false; // unparseable → allow
  }
}
