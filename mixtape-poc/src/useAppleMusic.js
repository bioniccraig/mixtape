// useAppleMusic.js
// Handles MusicKit configuration, Apple ID authorisation, subscription check,
// and playback controls. Playback interface mirrors useYouTube so TapePlayer
// can swap engines with minimal branching.

import { useState, useEffect, useRef, useCallback } from 'react';

// ── MusicKit singleton setup ──────────────────────────────────────────────────
// MusicKit.configure() must only be called once per page load.
let configured = false;
let configPromise = null;

// ── iTunes catalog ID cache ───────────────────────────────────────────────────
// We now search via Deezer (better results) but Apple Music needs an iTunes
// trackId. We resolve it lazily at play time by searching iTunes for the
// track title + artist, then cache so each track is only looked up once.
const itunesIdCache = new Map(); // "title|artist" → iTunes trackId string

async function ensureConfigured() {
  if (configured) return;
  if (configPromise) return configPromise;

  configPromise = (async () => {
    // Wait for the MusicKit script to finish loading if it hasn't yet
    if (!window.MusicKit) {
      await new Promise((resolve, reject) => {
        document.addEventListener('musickitloaded', resolve, { once: true });
        // 15s timeout in case the CDN is slow
        setTimeout(() => reject(new Error('MusicKit script timed out')), 15000);
      });
    }

    // Fetch our signed developer token from the Vercel serverless function
    const res = await fetch('/api/musickit-token');
    const { token, error } = await res.json();
    if (error) throw new Error(error);

    await MusicKit.configure({
      developerToken: token,
      app: { name: 'MixTape', build: '1.0.0' },
    });

    configured = true;
  })();

  return configPromise;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
// onEnded  — called when the current track finishes (drives auto-advance)
// onError  — called when a track cannot be played
export function useAppleMusic({ onEnded, onError } = {}) {
  const [mkReady,      setMkReady]      = useState(false);
  const [authorized,   setAuthorized]   = useState(false);
  const [isSubscriber, setIsSubscriber] = useState(false);
  const [authorizing,  setAuthorizing]  = useState(false);
  const [authError,    setAuthError]    = useState(null);

  // Keep callback refs fresh so the MusicKit listener always calls the latest version
  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);
  useEffect(() => { onEndedRef.current = onEnded; });
  useEffect(() => { onErrorRef.current = onError; });

  // Stable listener ref so we can remove it on unmount
  const stateListenerRef = useRef(({ state }) => {
    if (state === 5) onEndedRef.current?.(); // 5 = MusicKit.PlaybackStates.ended
  });

  // Configure MusicKit on mount and restore any existing session
  useEffect(() => {
    ensureConfigured()
      .then(() => {
        const music = MusicKit.getInstance();
        setMkReady(true);

        // Restore previously-authorised session
        if (music.isAuthorized) {
          setAuthorized(true);
          music.api.music('/v1/me/storefront')
            .then(() => setIsSubscriber(true))
            .catch(() => setIsSubscriber(false));
        }

        music.addEventListener('playbackStateDidChange', stateListenerRef.current);
      })
      .catch(err => console.error('MusicKit setup failed:', err.message));

    return () => {
      try {
        MusicKit.getInstance()
          .removeEventListener('playbackStateDidChange', stateListenerRef.current);
      } catch { /* MusicKit not yet configured — nothing to clean up */ }
    };
  }, []);

  // ── Authorise with Apple ID + verify subscription ─────────────────────────
  async function authorize() {
    if (!mkReady) return;
    setAuthorizing(true);
    setAuthError(null);
    try {
      const music = MusicKit.getInstance();
      await music.authorize();
      setAuthorized(music.isAuthorized);

      if (music.isAuthorized) {
        try {
          await music.api.music('/v1/me/storefront');
          setIsSubscriber(true);
        } catch {
          setIsSubscriber(false);
          setAuthError('Apple Music subscription required.');
        }
      }
    } catch (err) {
      setAuthError(err.message || 'Authorisation failed — please try again.');
    } finally {
      setAuthorizing(false);
    }
  }

  async function deauthorize() {
    try { await MusicKit.getInstance().unauthorize(); } catch { /* ignore */ }
    setAuthorized(false);
    setIsSubscriber(false);
    setAuthError(null);
  }

  // ── Playback controls (same interface as useYouTube) ─────────────────────
  // play(title, artist) — resolves the Apple Music catalog ID from iTunes
  // at play time using title + artist, then caches it for the session.
  const play = useCallback(async (title, artist) => {
    try {
      const music = MusicKit.getInstance();

      // Check session cache first
      const cacheKey = `${title}|${artist}`;
      let catalogId = itunesIdCache.get(cacheKey);

      if (!catalogId) {
        const params = new URLSearchParams({
          term: `${title} ${artist}`,
          media: 'music',
          entity: 'song',
          limit: 10,
        });
        const res     = await fetch(`/api/itunes-search?${params}`);
        const data    = await res.json();
        const results = data.results || [];
        const lc      = s => (s || '').toLowerCase();

        // Score each result — prefer studio version over live/remix, prefer
        // closer title matches. Deezer titles sometimes differ slightly from
        // iTunes (e.g. "Killing in the Name of" vs "Killing in the Name"),
        // so we use contains-matching rather than strict equality.
        function scoreResult(r) {
          const tn = lc(r.trackName);
          const an = lc(r.artistName);
          const t  = lc(title);
          const a  = lc(artist);
          let score = 0;

          // Artist similarity
          if (an === a)               score += 10;
          else if (an.includes(a) || a.includes(an)) score += 5;

          // Title similarity
          if (tn === t)               score += 10;
          else if (tn.includes(t) || t.includes(tn)) score += 5;

          // Penalise live / remix / remaster versions heavily
          if (/\(live[\s,)]|\blive\b at/i.test(r.trackName)) score -= 8;
          if (/\(remix|remaster|acoustic|radio.?edit|demo\b/i.test(r.trackName)) score -= 4;

          return score;
        }

        const match = results
          .map(r => ({ r, score: scoreResult(r) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)[0]?.r
          || results[0];

        if (!match) throw new Error(`"${title}" not found on Apple Music`);
        catalogId = String(match.trackId);
        itunesIdCache.set(cacheKey, catalogId);
      }

      await music.setQueue({ songs: [catalogId] });
      await music.play();
    } catch (err) {
      onErrorRef.current?.(err);
    }
  }, []);

  const pause  = useCallback(() => { try { MusicKit.getInstance().pause(); } catch { /* ignore */ } }, []);
  const resume = useCallback(() => { try { MusicKit.getInstance().play();  } catch { /* ignore */ } }, []);
  const stop   = useCallback(() => { try { MusicKit.getInstance().stop();  } catch { /* ignore */ } }, []);

  // ready = fully set up and able to play
  const ready = mkReady && authorized && isSubscriber;

  return {
    // Auth state (used by EngineToggle)
    mkReady, authorized, isSubscriber, authorizing, authError,
    authorize, deauthorize,
    // Playback (mirrors useYouTube)
    ready, play, pause, resume, stop,
  };
}
