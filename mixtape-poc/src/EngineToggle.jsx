// EngineToggle.jsx
// Lets the user switch between YouTube (universal) and Apple Music (subscribers).
// Handles the Apple ID auth flow inline — clicking Apple Music triggers sign-in
// if not yet authorised. Auto-switches engine once subscription is confirmed.

import { useEffect } from 'react';

export default function EngineToggle({ engine, onEngineChange, am }) {
  const {
    mkReady, authorized, isSubscriber,
    authorizing, authError,
    authorize, deauthorize,
  } = am;

  // As soon as Apple Music is fully authorised + subscription confirmed, switch over
  useEffect(() => {
    if (authorized && isSubscriber && engine !== 'apple') {
      onEngineChange('apple');
    }
  }, [authorized, isSubscriber]); // eslint-disable-line

  function handleAppleClick() {
    if (engine === 'apple') {
      // Already on Apple Music — clicking again disconnects
      deauthorize();
      onEngineChange('youtube');
      return;
    }
    if (!mkReady || authorizing) return;
    if (authorized && isSubscriber) {
      onEngineChange('apple');
    } else {
      authorize(); // opens Apple ID sign-in popup
    }
  }

  return (
    <div className="engine-toggle">
      <span className="engine-label">Play via</span>
      <div className="engine-btns">
        <button
          className={`engine-btn ${engine === 'youtube' ? 'active' : ''}`}
          onClick={() => { onEngineChange('youtube'); }}
          title="Play via YouTube (default)"
        >
          YouTube
        </button>
        <button
          className={`engine-btn engine-btn-apple ${engine === 'apple' ? 'active' : ''}`}
          onClick={handleAppleClick}
          disabled={!mkReady}
          title={authorized && isSubscriber ? 'Playing via Apple Music — click to disconnect' : 'Connect Apple Music'}
        >
          {authorizing ? 'Connecting…' : engine === 'apple' ? 'Apple Music' : 'Apple Music'}
        </button>
      </div>
      {authError && <p className="engine-error">{authError}</p>}
    </div>
  );
}
