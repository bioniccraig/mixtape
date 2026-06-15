import { useState } from 'react';
import { supabase } from './supabase';

// A lightweight magic-link sign-in modal.
// Props:
//   onClose()  — called when the user dismisses the modal
export default function AuthModal({ onClose }) {
  const [email,   setEmail]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError(null);

    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // After clicking the magic link, user lands back on the app
        emailRedirectTo: window.location.origin,
      },
    });

    setLoading(false);
    if (err) { setError(err.message); return; }
    setSent(true);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box auth-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="auth-logo">
          <span className="logo-icon">◼</span>
          <span className="logo-text">MixTape</span>
        </div>

        {sent ? (
          <div className="auth-sent">
            <p className="auth-sent-icon">📬</p>
            <h2>Check your email</h2>
            <p>We sent a sign-in link to <strong>{email}</strong>.<br />Click it to sign in — no password needed.</p>
            <button className="btn-auth-secondary" onClick={onClose}>Got it</button>
          </div>
        ) : (
          <>
            <h2>Sign in to save your tapes</h2>
            <p className="auth-sub">We'll email you a magic link — no password required.</p>

            <form onSubmit={handleSubmit} className="auth-form">
              <input
                type="email"
                className="auth-email-input"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
              {error && <p className="auth-error">{error}</p>}
              <button
                type="submit"
                className="btn-auth-primary"
                disabled={loading || !email.trim()}
              >
                {loading ? 'Sending…' : 'Send magic link'}
              </button>
            </form>

            <p className="auth-disclaimer">
              Signing in lets you save tapes, see who opened them, and access your library across devices.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
