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

// Re-export the Sentry namespace so callers can use Sentry.ErrorBoundary etc.
export { Sentry };
