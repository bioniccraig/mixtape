// YouTube IFrame Player — full-track, in-app playback engine.
// Loads the IFrame API once, attaches a reusable player to a DOM element, and
// exposes simple controls. The player must stay visible while playing to comply
// with YouTube's terms (the caller renders the target element on screen).

import { useEffect, useRef, useState, useCallback } from 'react';

let apiPromise = null;
function loadApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise(resolve => {
    if (window.YT && window.YT.Player) { resolve(window.YT); return; }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve(window.YT);
    };
  });
  return apiPromise;
}

// elementId: id of the div the player mounts into (YT replaces it with an iframe).
// onEnded: called when the current video finishes (drives auto-advance).
export function useYouTube({ elementId, onEnded }) {
  const playerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const onEndedRef = useRef(onEnded);
  useEffect(() => { onEndedRef.current = onEnded; });

  useEffect(() => {
    let cancelled = false;
    loadApi().then(YT => {
      if (cancelled || !document.getElementById(elementId)) return;
      playerRef.current = new YT.Player(elementId, {
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => { if (!cancelled) setReady(true); },
          onStateChange: e => {
            if (e.data === YT.PlayerState.ENDED) onEndedRef.current?.();
          },
        },
      });
    });
    return () => {
      cancelled = true;
      try { playerRef.current?.destroy(); } catch { /* already gone */ }
      playerRef.current = null;
    };
  }, [elementId]);

  const play   = useCallback(id => { try { playerRef.current?.loadVideoById(id); } catch { /* not ready */ } }, []);
  const pause  = useCallback(()  => { try { playerRef.current?.pauseVideo(); }     catch { /* not ready */ } }, []);
  const resume = useCallback(()  => { try { playerRef.current?.playVideo(); }      catch { /* not ready */ } }, []);
  const stop   = useCallback(()  => { try { playerRef.current?.stopVideo(); }      catch { /* not ready */ } }, []);

  return { ready, play, pause, resume, stop };
}
