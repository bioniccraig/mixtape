// Spotify PKCE Authentication & API
// We use PKCE (no client secret needed in the browser)

const CLIENT_ID = 'de66f8ac956b4d529ca792d1982a5f69';
const REDIRECT_URI = 'http://127.0.0.1:3000/callback';
const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-library-read',
  'playlist-read-private',
  'streaming',
  'user-read-playback-state',
].join(' ');

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map(x => chars[x % chars.length])
    .join('');
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function loginWithSpotify() {
  const verifier = generateRandomString(128);
  const challenge = await generateCodeChallenge(verifier);
  localStorage.setItem('spotify_verifier', verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  window.location = `https://accounts.spotify.com/authorize?${params}`;
}

export async function handleCallback(code) {
  const verifier = localStorage.getItem('spotify_verifier');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  const data = await res.json();
  if (data.access_token) {
    localStorage.setItem('spotify_token', data.access_token);
    localStorage.setItem('spotify_refresh', data.refresh_token);
    localStorage.setItem('spotify_expires', Date.now() + data.expires_in * 1000);
    return data.access_token;
  }
  throw new Error('Failed to get token: ' + JSON.stringify(data));
}

export function getToken() {
  return localStorage.getItem('spotify_token');
}

export function isLoggedIn() {
  const token = getToken();
  const expires = localStorage.getItem('spotify_expires');
  return token && expires && Date.now() < parseInt(expires);
}

export function logout() {
  localStorage.removeItem('spotify_token');
  localStorage.removeItem('spotify_refresh');
  localStorage.removeItem('spotify_expires');
  localStorage.removeItem('spotify_verifier');
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function spotifyFetch(path) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error('Spotify API error', res.status, body);
    throw new Error(`Spotify API ${res.status}: ${JSON.stringify(body)}`);
  }
  return res.json();
}

export async function getMe() {
  return spotifyFetch('/me');
}

export async function searchTracks(query) {
  const params = new URLSearchParams({ q: query, type: 'track', limit: 20 });
  const data = await spotifyFetch(`/search?${params}`);
  return data.tracks.items.map(formatTrack);
}

export async function getUserTracks(offset = 0) {
  const data = await spotifyFetch(`/me/tracks?limit=20&offset=${offset}`);
  return data.items.map(item => formatTrack(item.track));
}

function formatTrack(track) {
  const duration = track.duration_ms / 1000;
  const mins = Math.floor(duration / 60);
  const secs = Math.floor(duration % 60).toString().padStart(2, '0');
  return {
    id: track.id,
    uri: track.uri,
    title: track.name,
    artist: track.artists.map(a => a.name).join(', '),
    album: track.album.name,
    artwork: track.album.images[1]?.url || track.album.images[0]?.url,
    durationMs: track.duration_ms,
    durationLabel: `${mins}:${secs}`,
  };
}
