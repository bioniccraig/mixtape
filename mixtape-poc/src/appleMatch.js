// appleMatch.js
// ONE shared Apple Music catalog matcher, used by BOTH the builder
// (resolveAppleMatch) and the player (useAppleMusic). Keeping a single source of
// truth stops the two copies drifting apart — which is what caused Apple Music to
// play the wrong same-title song (e.g. the dB's "Black and White" → Juice WRLD).

// Normalise for comparison: lower-case, strip "(feat. …)", turn "&" into "and",
// drop a leading "the", and remove punctuation — so artist/title variants still
// compare equal ("The dB's" == "dB's", "Barbara & Ernie" == "Barbara and Ernie").
const norm = s => (s || '')
  .toLowerCase()
  .replace(/\(feat\.?[^)]*\)/g, ' ')
  .replace(/\bfeat\.?\b.*$/g, ' ')
  .replace(/&/g, ' and ')
  .replace(/^the\s+/, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Alternate versions to avoid when the original studio recording also exists.
const VARIANT = /\b(live|acoustic|remix|remaster(ed)?|radio edit|demo|karaoke|cover|instrumental|sped\s?up|slowed|reprise|commentary|tribute|re-?recorded|taylor'?s version)\b|\(live/i;

// Score one Apple result against the wanted title/artist.
// Returns null if it's NOT a match (hard gate on artist AND title) — so a caller
// never accidentally plays a different artist's song.
export function scoreAppleResult(r, title, artist) {
  const tn = norm(r.name), an = norm(r.artistName);
  const t  = norm(title),  a  = norm(artist);
  const artistOk = an === a || an.includes(a) || a.includes(an);
  const titleOk  = tn === t || tn.includes(t) || t.includes(tn);
  if (!artistOk || !titleOk) return null;
  let score = (an === a ? 10 : 5) + (tn === t ? 10 : 4);
  if (VARIANT.test(r.name)) score -= 12; // strongly prefer the original
  return score;
}

// Pick the best matching result from a list (or null if none truly match).
export function pickBestApple(songs, title, artist) {
  return songs
    .map(r => ({ r, score: scoreAppleResult(r, title, artist) }))
    .filter(({ score }) => score != null)
    .sort((x, y) => y.score - x.score)[0]?.r || null;
}

// Find the best Apple catalog song for a title+artist, or null. Two-pass: search
// WITH the artist first (so the correct recording is in the results — a title-only
// search returns the most popular namesake), then fall back to title-only — BOTH
// passes gated, so we never return a mismatch.
export async function findAppleMatch(title, artist, storefront = 'gb') {
  const search = async term => {
    const params = new URLSearchParams({ term, storefront, limit: 25 });
    const res    = await fetch(`/api/apple-search?${params}`);
    const data   = await res.json();
    return data.songs || [];
  };
  let best = pickBestApple(await search(`${title} ${artist}`), title, artist);
  if (!best) best = pickBestApple(await search(title), title, artist);
  return best;
}
