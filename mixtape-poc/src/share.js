// Encode / decode tape state to/from a URL-safe base64 hash
// Format: http://.../#tape=BASE64

function slim(tracks) {
  // Intentionally omit artwork URL and album — they're long CDN strings that bloat the URL.
  // TapePlayer re-fetches them from iTunes on load via /api/itunes-lookup.
  // `y` carries the matched YouTube video id so the recipient can play the full track.
  return tracks.map(t => ({
    i:  t.id,
    ti: t.title,
    ar: t.artist,
    d:  t.durationMs,
    dl: t.durationLabel,
    ...(t.ytId ? { y: t.ytId } : {}),
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
    ytId:          t.y || null,   // YouTube match for full-track playback
    ytStatus:      t.y ? 'ok' : 'none',
    ytConfirmed:   !!t.y,
  }));
}

// Encode: JSON → UTF-8 bytes → base64
// Avoids encodeURIComponent which bloats the string 2-3x before base64.
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Decode: base64 → bytes → UTF-8 string
// Falls back to the old encodeURIComponent format for backwards compatibility.
function fromBase64(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const str = new TextDecoder().decode(bytes);
  // Old format started with '%7B' (URL-encoded '{'); new format starts with '{'
  return str.startsWith('{') ? str : decodeURIComponent(str);
}

export function encodeTape({ tapeName, theme, sideA, sideB, note }) {
  const payload = {
    n:  tapeName || '',
    t:  theme    || 'yellow',
    no: note     || '',
    a:  slim(sideA),
    b:  slim(sideB),
  };
  return toBase64(JSON.stringify(payload));
}

export function decodeTape(encoded) {
  const raw = JSON.parse(fromBase64(encoded));
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

export function buildShareUrl({ tapeName, theme, sideA, sideB, note }) {
  const encoded = encodeTape({ tapeName, theme, sideA, sideB, note });
  const name    = encodeURIComponent(tapeName || 'A MixTape');
  // Route through /api/tape so crawlers (WhatsApp, iMessage) see proper OG tags.
  // Real users are immediately JS-redirected to /#tape= by the serverless function.
  return `${window.location.origin}/api/tape?n=${name}&d=${encoded}`;
}
