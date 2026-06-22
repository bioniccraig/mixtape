// Decode tape state from a legacy URL-safe base64 hash (#tape=BASE64).
// NOTE: the app no longer GENERATES hash links (all shares are DB-backed /t/SHAREID),
// but we still decode them so old links shared before the switch keep working.

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

// ── Robust clipboard copy ─────────────────────────────────────────────────────
// navigator.clipboard.writeText() rejects with "Document is not focused" / a
// NotAllowedError in several real cases (Sentry MIXTAPE-8) — leaving the user
// with nothing copied and no feedback. Fall back to a hidden <textarea> +
// execCommand, and report success so callers can show feedback. Returns a
// promise<boolean>.
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// ── Community share (Reddit r/SayItWithMusic) ─────────────────────────────────
// Opens Reddit's "submit post" page pre-filled with the tape's title + link, so
// the user posts to the community under their OWN Reddit account in one tap.
// No Reddit API or credentials needed. ALWAYS pass the DB-backed /t/SHAREID link
// (not a #tape= hash link) so the Reddit post gets a real preview + working likes.
export const COMMUNITY_SUBREDDIT = 'SayItWithMusic';
export const COMMUNITY_FLAIR     = 'MixTape Showcase';

export function buildCommunityShareUrl({ tapeName, shareUrl }) {
  const title  = tapeName ? `🎵 ${tapeName}` : '🎵 A MixTape';
  const params = new URLSearchParams({
    title,
    url:        shareUrl,
    flair_text: COMMUNITY_FLAIR, // best-effort; back up with an AutoMod flair rule
  });
  return `https://www.reddit.com/r/${COMMUNITY_SUBREDDIT}/submit?${params.toString()}`;
}
