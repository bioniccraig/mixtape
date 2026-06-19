// AppHeader — the shared top bar used by the Builder and Player so they stay
// identical: clickable MixTape logo (→ home) on the left, then the notification
// bell, an optional Library button, and the account email (or a Sign in button).
//
// Props:
//   user            — Supabase user or null
//   onHome          — called when the logo is tapped (return to home)
//   onSignInRequest — opens the sign-in flow (shown when signed out)
//   onOpenLibrary   — optional; if provided, renders the 📼 Library button (builder)

import NotificationBell from './NotificationBell';
import { loadTapeById } from './db';

export default function AppHeader({ user, onHome, onSignInRequest, onOpenLibrary }) {
  return (
    <header className="builder-header">
      <button className="header-logo header-logo-btn" onClick={onHome} title="Back to home">
        <img className="header-wordmark" src="/wordmark.png" alt="MixTape" />
      </button>
      <div className="header-actions">
        {user ? (
          <>
            <NotificationBell
              user={user}
              onOpenTape={async id => {
                const { tape: t } = await loadTapeById(id);
                if (t) { onHome(); setTimeout(() => window.location.assign(`/t/${t.shareId}`), 50); }
              }}
            />
            {onOpenLibrary && (
              <button className="btn btn-secondary btn-sm" onClick={onOpenLibrary} title="My Library">
                📼 Library
              </button>
            )}
            <span className="auth-status-small">{user.email}</span>
          </>
        ) : (
          onSignInRequest && (
            <button className="btn btn-ghost btn-sm" onClick={onSignInRequest} title="Sign in">
              Sign in
            </button>
          )
        )}
      </div>
    </header>
  );
}
