// AppleMatchModal.jsx
// Lets the creator review and swap the Apple Music version that will play
// for Apple Music subscribers. Mirrors the YouTube MatchModal pattern.

import { useState, useEffect } from 'react';

export default function AppleMatchModal({ track, side, storefront = 'gb', onConfirm, onClose }) {
  const [results,    setResults]    = useState([]);
  const [searching,  setSearching]  = useState(false);
  const [selected,   setSelected]   = useState(track.appleId   || null);
  const [selTitle,   setSelTitle]   = useState(track.appleTitle || '');
  const [selAlbum,   setSelAlbum]   = useState('');
  const [query,      setQuery]      = useState(track.title);

  async function runSearch(q) {
    setSearching(true);
    try {
      // Search by song title only — keeps cover/tribute bands out of results.
      // The user can type artist name manually if they need to narrow further.
      const params = new URLSearchParams({ term: q, attribute: 'songTerm', media: 'music', entity: 'song', limit: 15, country: storefront });
      const res  = await fetch(`/api/itunes-search?${params}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  // Run initial search on mount
  useEffect(() => { runSearch(query); }, []); // eslint-disable-line

  function pick(r) {
    setSelected(String(r.trackId));
    setSelTitle(r.trackName);
    setSelAlbum(r.collectionName || '');
  }

  function confirm() {
    onConfirm({
      appleId:     selected,
      appleTitle:  selTitle,
      appleAlbum:  selAlbum,
      appleStatus: selected ? 'ok' : 'none',
    });
  }

  return (
    <div className="mm-overlay" onClick={onClose}>
      <div className="mm-card" onClick={e => e.stopPropagation()}>

        <div className="mm-head">
          <span>Apple Music version · Side {side}</span>
          <button className="mm-close" onClick={onClose}>✕</button>
        </div>

        <div className="mm-track">
          {track.artwork && <img src={track.artwork} alt="" className="mm-art" />}
          <div>
            <div className="mm-track-title">{track.title}</div>
            <div className="mm-track-artist">{track.artist}</div>
          </div>
        </div>

        {selected && (
          <div className="apple-match-current">
            <span className="apple-match-current-label">Currently selected:</span>
            <span className="apple-match-current-title">{selTitle}</span>
            {selAlbum && <span className="apple-match-current-album">{selAlbum}</span>}
          </div>
        )}

        <div className="mm-searchrow">
          <input
            className="mm-searchinput"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runSearch(query)}
            placeholder="Search Apple Music…"
          />
          <button className="mm-searchbtn" onClick={() => runSearch(query)} disabled={searching}>
            {searching ? '⟳' : 'Search'}
          </button>
        </div>

        <div className="apple-match-results">
          {results.map(r => (
            <button
              key={r.trackId}
              className={`apple-match-result ${selected === String(r.trackId) ? 'selected' : ''}`}
              onClick={() => pick(r)}
            >
              {r.artworkUrl100 && (
                <img src={r.artworkUrl100} alt="" className="mm-result-thumb" />
              )}
              <div className="mm-result-info">
                <span className="mm-result-title">{r.trackName}</span>
                <span className="mm-result-channel">{r.artistName} · {r.collectionName}</span>
              </div>
              {selected === String(r.trackId) && <span className="apple-match-tick">✓</span>}
            </button>
          ))}
          {!searching && results.length === 0 && (
            <p className="mm-hint">No results — try different search terms.</p>
          )}
        </div>

        <div className="mm-actions">
          <button className="mm-confirm" onClick={confirm} disabled={!selected}>
            ✓ Use this version
          </button>
          <button className="mm-secondary" onClick={onClose}>Cancel</button>
        </div>

      </div>
    </div>
  );
}
