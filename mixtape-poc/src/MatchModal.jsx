import { useState, useEffect } from 'react';
import { searchYouTube, parseYouTubeId } from './matching';

// Confirm-at-build review: the creator verifies (and if needed swaps) the YouTube
// version matched to a track before the tape is sent. Catching wrong versions here
// means the recipient never hits one.
export default function MatchModal({ track, side, onConfirm, onClose }) {
  const [ytId,      setYtId]      = useState(track.ytId || null);
  const [ytTitle,   setYtTitle]   = useState(track.ytTitle || '');
  const [ytChannel, setYtChannel] = useState(track.ytChannel || '');
  const [mode,      setMode]      = useState('review'); // 'review' | 'search'
  const [results,   setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [configured,setConfigured]= useState(true);
  const [pasteVal,  setPasteVal]  = useState('');
  const [pasteErr,  setPasteErr]  = useState('');

  const defaultQuery = `${track.artist} ${track.title}`;
  const [query, setQuery] = useState(defaultQuery);

  async function runSearch(q) {
    setSearching(true);
    try {
      const { configured: cfg, items } = await searchYouTube(q);
      setConfigured(cfg);
      setResults(items);
    } catch {
      setConfigured(false);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mode === 'search' && results.length === 0) runSearch(defaultQuery);
  }, [mode]); // eslint-disable-line

  function choose(id, title, channel) {
    setYtId(id);
    setYtTitle(title || '');
    setYtChannel(channel || '');
    setMode('review');
  }

  function handlePaste() {
    const id = parseYouTubeId(pasteVal);
    if (!id) { setPasteErr("That doesn't look like a YouTube link or video id."); return; }
    setPasteErr('');
    choose(id, 'Pasted link', '');
  }

  function confirm() {
    onConfirm({
      ytId,
      ytTitle,
      ytChannel,
      ytStatus: ytId ? 'ok' : 'none',
      ytConfirmed: true,
    });
  }

  return (
    <div className="mm-overlay" onClick={onClose}>
      <div className="mm-card" onClick={e => e.stopPropagation()}>
        <div className="mm-head">
          <span>Check the match · Side {side}</span>
          <button className="mm-close" onClick={onClose}>✕</button>
        </div>

        <div className="mm-track">
          {track.artwork && <img src={track.artwork} alt="" className="mm-art" />}
          <div>
            <div className="mm-track-title">{track.title}</div>
            <div className="mm-track-artist">{track.artist}</div>
          </div>
        </div>

        {mode === 'review' && (
          <>
            {ytId ? (
              <>
                <div className="mm-label">Will play this on YouTube:</div>
                <div className="mm-embed">
                  <iframe
                    title="YouTube preview"
                    src={`https://www.youtube.com/embed/${ytId}`}
                    allow="encrypted-media"
                    allowFullScreen
                  />
                </div>
                {(ytTitle || ytChannel) && (
                  <div className="mm-ytmeta">
                    <span className="mm-yttitle">{ytTitle}</span>
                    {ytChannel && <span className="mm-ytchannel">{ytChannel}</span>}
                  </div>
                )}
                <p className="mm-hint">Is this the right version? Play a few seconds to check.</p>
              </>
            ) : (
              <p className="mm-none">No automatic match found for this track. Find one below so it can play in the tape.</p>
            )}

            <div className="mm-actions">
              {ytId && <button className="mm-confirm" onClick={confirm}>✓ Looks right</button>}
              <button className="mm-secondary" onClick={() => setMode('search')}>
                {ytId ? 'Wrong — find another' : 'Find a match'}
              </button>
            </div>
          </>
        )}

        {mode === 'search' && (
          <>
            <div className="mm-searchrow">
              <input
                className="mm-searchinput"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runSearch(query)}
                placeholder="Search YouTube…"
              />
              <button className="mm-searchbtn" onClick={() => runSearch(query)} disabled={searching}>
                {searching ? '⟳' : 'Search'}
              </button>
            </div>

            {!configured && (
              <div className="mm-paste">
                <p className="mm-hint">
                  YouTube search isn't switched on yet. Paste the correct YouTube link instead:
                </p>
                <div className="mm-searchrow">
                  <input
                    className="mm-searchinput"
                    value={pasteVal}
                    onChange={e => setPasteVal(e.target.value)}
                    placeholder="https://youtube.com/watch?v=…"
                  />
                  <button className="mm-searchbtn" onClick={handlePaste}>Use</button>
                </div>
                {pasteErr && <p className="mm-err">{pasteErr}</p>}
              </div>
            )}

            {configured && results.map(r => (
              <button key={r.youtubeId} className="mm-result" onClick={() => choose(r.youtubeId, r.title, r.channel)}>
                {r.thumbnail && <img src={r.thumbnail} alt="" className="mm-result-thumb" />}
                <div className="mm-result-info">
                  <span className="mm-result-title" dangerouslySetInnerHTML={{ __html: r.title }} />
                  <span className="mm-result-channel">{r.channel}</span>
                </div>
              </button>
            ))}
            {configured && !searching && results.length === 0 && (
              <p className="mm-hint">No results — try different search words.</p>
            )}

            <div className="mm-actions">
              <button className="mm-secondary" onClick={() => setMode('review')}>← Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
