// useAppleMusic.js
// Handles MusicKit configuration, Apple ID authorisation, subscription check,
// and playback controls. Playback interface mirrors useYouTube so TapePlayer
// can swap engines with minimal branching.

import { useState, useEffect, useRef, useCallback } from 'react';
import { findAppleMatch } from './appleMatch';

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
  const [storefront,   setStorefront]   = useState('gb'); // user's iTunes store country code

  // Keep callback refs fresh so the MusicKit listener always calls the latest version
  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);
  useEffect(() => { onEndedRef.current = onEnded; });
  useEffect(() => { onErrorRef.current = onError; });

  // Auto-advance guard refs:
  // lastPlayAtRef — when we last started a track. Terminal events that arrive
  //   within a short window of starting are stale events from the previous track
  //   or transition noise from our stop()→setQueue()→play() sequence, NOT a real
  //   end-of-track, so we ignore them.
  // advancedThisTrackRef — advance only ONCE per track even though MusicKit can
  //   fire BOTH `ended` and `completed` at a natural finish.
  const lastPlayAtRef        = useRef(0);
  const advancedThisTrackRef = useRef(false);

  // Stable listener ref so we can remove it on unmount.
  // We queue one song at a time, so each track is its own 1-item queue. When a
  // 1-item queue finishes, MusicKit does NOT reliably fire `ended` (5) — some
  // tracks emit `completed` (10) instead. Keying off only `ended` meant those
  // tracks never advanced, so playback stalled after a few songs at random.
  // Catch both, de-duped, ignoring transition/stale events.
  const stateListenerRef = useRef(({ state }) => {
    const PS        = window.MusicKit?.PlaybackStates;
    const ended     = PS ? PS.ended     : 5;
    const completed = PS ? PS.completed : 10;
    if (state !== ended && state !== completed) return;
    if (Date.now() - lastPlayAtRef.current < 1500) return; // stale/transition event
    if (advancedThisTrackRef.current) return;              // already advanced this track
    advancedThisTrackRef.current = true;
    onEndedRef.current?.();
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
            .then(r => {
              setIsSubscriber(true);
              // Grab the storefront country code so searches hit the right iTunes store
              const sf = r?.data?.data?.[0]?.id;
              if (sf) setStorefront(sf);
            })
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
          const r = await music.api.music('/v1/me/storefront');
          setIsSubscriber(true);
          const sf = r?.data?.data?.[0]?.id;
          if (sf) setStorefront(sf);
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
  // play(title, artist, knownCatalogId?) — uses a pre-resolved iTunes catalog ID
  // if the builder already resolved one; otherwise looks it up and caches it.
  const play = useCallback(async (title, artist, knownCatalogId = null) => {
    try {
      const music = MusicKit.getInstance();

      // Use caller-supplied ID (from resolveAppleMatch at add time) or session cache
      const cacheKey = `${title}|${artist}`;
      let catalogId = knownCatalogId || itunesIdCache.get(cacheKey);

      if (!catalogId) {
        // Resolve via the shared Apple matcher (searches title+artist, gates on
        // both, prefers the original) — same logic the builder uses, so playback
        // and the builder badge can't disagree.
        const match = await findAppleMatch(title, artist, storefront);
        if (!match) throw new Error(`"${title}" by ${artist} not found on Apple Music`);
        catalogId = String(match.id);
        itunesIdCache.set(cacheKey, catalogId);
      }

      // MusicKit throws "play() called without stop/pause" if the internal state is
      // PLAY_END (track just finished naturally). Stop first to ensure a clean state
      // before queuing and playing the next track.
      try { await music.stop(); } catch { /* ignore if already stopped */ }
      await music.setQueue({ songs: [catalogId] });
      // Arm the auto-advance guard for this new track BEFORE play() so any stale
      // terminal event from the previous track falls inside the ignore window.
      lastPlayAtRef.current        = Date.now();
      advancedThisTrackRef.current = false;
      await music.play();
    } catch (err) {
      onErrorRef.current?.(err);
    }
  }, []);

  // pause()/stop() are fire-and-forget (not awaited by callers). MusicKit returns
  // a promise that can reject internally (e.g. "A method was called without a
  // previous descriptor" when stopped with an empty timeline) — a synchronous
  // try/catch does NOT catch that async rejection, so it surfaces as an unhandled
  // rejection in Sentry. Swallow the promise explicitly.
  const pause  = useCallback(() => {
    try { Promise.resolve(MusicKit.getInstance().pause()).catch(() => {}); } catch { /* ignore */ }
  }, []);
  const resume = useCallback(async () => {
    try {
      const music = MusicKit.getInstance();
      // Only resume if MusicKit is actually paused — avoids the "play() called
      // without stop/pause" error that fires when the queue is in PLAY_END state.
      const PAUSED = MusicKit?.PlaybackStates?.paused ?? 2;
      if (music.playbackState === PAUSED) {
        await music.play();
      }
    } catch { /* ignore */ }
  }, []);
  const stop   = useCallback(() => {
    try { Promise.resolve(MusicKit.getInstance().stop()).catch(() => {}); } catch { /* ignore */ }
  }, []);

  // ready = fully set up and able to play
  const ready = mkReady && authorized && isSubscriber;

  return {
    // Auth state (used by EngineToggle)
    mkReady, authorized, isSubscriber, authorizing, authError,
    authorize, deauthorize,
    // Playback (mirrors useYouTube)
    ready, play, pause, resume, stop,
    // User's iTunes store country code — pass to background resolvers
    storefront,
  };
}
