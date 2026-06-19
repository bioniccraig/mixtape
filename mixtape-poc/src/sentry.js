// Sentry error monitoring — initialise once at app startup.
// Requires VITE_SENTRY_DSN env var; silently skips if not set (local dev).

import * as Sentry from '@sentry/react';

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // not configured — skip silently

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE, // 'production' | 'development'
    enabled: import.meta.env.PROD,     // off in dev so you don't flood events
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,             // 10% of sessions for performance traces
    ignoreErrors: [
      // Transient network noise — not our bugs
      'Network request failed',
      'Failed to fetch',
      'Load failed',
      'ResizeObserver loop limit exceeded',
      // MusicKit (Apple Music) internal async housekeeping. These reject inside
      // Apple's library during normal play/stop transitions; our app handles the
      // playback UX gracefully (skip/advance), so they are benign noise.
      'The play() method was called without a previous stop() or pause() call',
      'A method was called without a previous descriptor',
      // Browser autoplay policy — audio blocked until a user gesture. Expected,
      // not a bug; the user simply presses play.
      'The request is not allowed by the user agent',
    ],
  });
}

// ── YouTube player error codes ────────────────────────────────────────────────
// https://developers.google.com/youtube/iframe_api_reference#onError
const YT_ERROR_LABELS = {
  2:   'Invalid parameter value',
  5:   'HTML5 player error',
  100: 'Video not found or removed',
  101: 'Embedding disabled by owner',
  150: 'Embedding disabled (Vevo/label)',
};

/**
 * Call from the YouTube iframe onError handler.
 * code  — numeric error code from the YT IFrame API
 * ytId  — the video id that was playing (pass null if not known)
 */
export function capturePlayerError(code, ytId) {
  const label = YT_ERROR_LABELS[code] || `Unknown error (${code})`;
  if (!import.meta.env.PROD) {
    console.warn('[YouTube player error]', code, label, ytId ? `(${ytId})` : '');
    return;
  }
  Sentry.captureMessage(`YouTube player error ${code}: ${label}`, {
    level: 'warning',
    tags: { yt_error_code: String(code), yt_video_id: ytId || 'unknown' },
  });
}

/**
 * Call when /api/youtube-search returns quotaExceeded:true.
 * This means the YouTube Data API v3 daily quota is exhausted.
 */
export function captureQuotaExceeded(query) {
  if (!import.meta.env.PROD) {
    console.error('[YouTube] Daily API quota exceeded. Query:', query);
    return;
  }
  Sentry.captureMessage('YouTube API daily quota exceeded', {
    level: 'error',
    tags: { search_query: query?.slice(0, 80) },
  });
}

/**
 * Capture an error we handled gracefully but want visibility into (e.g. a like
 * that failed to save). `context` is a short label; `err` is the error/message.
 */
export function captureHandledError(context, err) {
  if (!import.meta.env.PROD) {
    console.error(`[${context}]`, err);
    return;
  }
  Sentry.captureMessage(`${context}: ${err?.message || err}`, {
    level: 'error',
    tags: { context },
  });
}

/**
 * Attach (or clear) the signed-in user so Sentry's "users impacted" is meaningful
 * instead of always showing 0. Call with the Supabase user on sign-in, null on sign-out.
 * id is enough to count unique impacted users; email helps identify who to follow up with.
 */
export function setSentryUser(user) {
  if (user) {
    Sentry.setUser({ id: user.id, email: user.email });
  } else {
    Sentry.setUser(null);
  }
}

// Re-export the Sentry namespace so callers can use Sentry.ErrorBoundary etc.
export { Sentry };
