import { useState } from 'react';
import { supabase } from './supabase';

// A lightweight email-code sign-in modal.
// Step 1: enter email → we send a 6-digit code.
// Step 2: enter the code → verifyOtp signs the user in WITHOUT leaving the page,
//         so an in-progress tape (and the browser context) survive sign-in.
// Props:
//   onClose() — called when the user dismisses the modal
export default function AuthModal({ onClose }) {
  const [email,   setEmail]   = useState('');
  const [code,    setCode]    = useState('');
  const [sent,    setSent]    = useState(false);   // moved to the code-entry step
  const [loading, setLoading] = useState(false);   // sending the code
  const [verifying, setVerifying] = useState(false); // checking the code
  const [error,   setError]   = useState(null);

  async function sendCode(e) {
    if (e) e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError(null);

    // shouldCreateUser defaults to true — same call works for sign-in and sign-up.
    // No emailRedirectTo: the email carries a code, not a link.
    const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim() });

    setLoading(false);
    if (err) { setError(err.message); return; }
    setSent(true);
  }

  async function verifyCode(e) {
    if (e) e.preventDefault();
    if (!supabase) return;
    setVerifying(true);
    setError(null);

    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type:  'email',
    });

    setVerifying(false);
    if (err) { setError('That code didn’t work — check it and try again, or resend.'); return; }
    // useAuth's onAuthStateChange picks up the new session; just close.
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box auth-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="auth-logo">
          <img className="header-wordmark" src="/wordmark.png" alt="MixTape" />
        </div>

        {sent ? (
          <>
            <h2>Enter your code</h2>
            <p className="auth-sub">
              We emailed a 6-digit code to <strong>{email}</strong>. Enter it below — no password, and no leaving this page.
            </p>

            <form onSubmit={verifyCode} className="auth-form">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="auth-email-input auth-code-input"
                placeholder="123456"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                required
                autoFocus
              />
              {error && <p className="auth-error">{error}</p>}
              <button
                type="submit"
                className="btn-auth-primary"
                disabled={verifying || code.trim().length < 6}
              >
                {verifying ? 'Checking…' : 'Sign in'}
              </button>
            </form>

            <p className="auth-disclaimer">
              Didn’t get it? Check spam — it can take a minute.{' '}
              <button type="button" className="auth-link-btn" onClick={sendCode} disabled={loading}>
                {loading ? 'Resending…' : 'Resend code'}
              </button>
              {' · '}
              <button type="button" className="auth-link-btn" onClick={() => { setSent(false); setCode(''); setError(null); }}>
                Use a different email
              </button>
            </p>
          </>
        ) : (
          <>
            <h2>Sign in to save your tapes</h2>
            <p className="auth-sub">We’ll email you a 6-digit code — no password required.</p>

            <form onSubmit={sendCode} className="auth-form">
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
                {loading ? 'Sending…' : 'Email me a code'}
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
