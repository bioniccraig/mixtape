// Encode / decode tape state to/from a URL-safe base64 hash
// Format: http://.../#tape=BASE64

function slim(tracks) {
  // Intentionally omit artwork URL and album — they're long CDN strings that bloat the URL.
  // TapePlayer re-fetches them from iTunes on load via /api/itunes-lookup.
  return tracks.map(t => ({
    i:  t.id,
    ti: t.title,
    ar: t.artist,
    d:  t.durationMs,
    dl: t.durationLabel,
  }));
}

function inflate(arr) {
  return (arr || []).map(t => ({
    id:            t.i,
    title:         t.ti,
    artist:        t.ar,
    album:         t.al || '',   // backwards-compat with old shares
    artwork:       t.aw  || null, // backwards-compat; null = TapePlayer will fetch
    durationMs:    t.d,
    durationLabel: t.dl,
    previewUrl:    null,          // always fetch fresh
  }));
}

export function encodeTape({ tapeName, theme, sideA, sideB, note }) {
  const payload = {
    n:  tapeName || '',
    t:  theme    || 'yellow',
    no: note     || '',
    a:  slim(sideA),
    b:  slim(sideB),
  };
  return btoa(encodeURIComponent(JSON.stringify(payload)));
}

export function decodeTape(encoded) {
  const raw = JSON.parse(decodeURIComponent(atob(encoded)));
  return {
    tapeName: raw.n  || '',
    theme:    raw.t  || 'yellow',
    note:     raw.no || '',
    sideA:    inflate(raw.a),
    sideB:    inflate(raw.b),
  };
}

export function getSharedTape() {
  const hash = window.location.hash;
  if (!hash.startsWith('#tape=')) return null;
  try {
    return decodeTape(hash.slice(6));
  } catch {
    return null;
  }
}

export function buildShareUrl(tapeState) {
  const encoded = encodeTape(tapeState);
  return `${window.location.origin}${window.location.pathname}#tape=${encoded}`;
}
