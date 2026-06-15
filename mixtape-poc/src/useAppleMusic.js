// useAppleMusic.js
// Handles MusicKit configuration, Apple ID authorisation, subscription check,
// and playback controls. Playback interface mirrors useYouTube so TapePlayer
// can swap engines with minimal branching.

import { useState, useEffect, useRef, useCallback } from 'react';

// ── MusicKit singleton setup ──────────────────────────────────────────────────
// MusicKit.configure() must only be called once per page load.
let configured = false;
let configPromise = null;

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
  const play = useCallback(async (trackId) => {
    try {
      const music = MusicKit.getInstance();
      await music.setQueue({ songs: [String(trackId)] });
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
