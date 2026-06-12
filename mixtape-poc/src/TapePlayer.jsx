import { useState } from 'react';
import CassetteSVG from './Cassette';
import JCard from './JCard';

export default function TapePlayer({ tape, onMakeOwn }) {
  const [playing,   setPlaying]   = useState(false);
  const [showJCard, setShowJCard] = useState(false);

  const sideAMs = tape.sideA.reduce((t, x) => t + x.durationMs, 0);
  const sideBMs = tape.sideB.reduce((t, x) => t + x.durationMs, 0);

  return (
    <div className="player">
      {/* Header */}
      <header className="builder-header">
        <div className="header-logo">
          <span className="logo-icon">◼</span>
          <span className="logo-text">MixTape</span>
        </div>
        <button className="share-btn" onClick={onMakeOwn}>
          Make Your Own ✦
        </button>
      </header>

      <div className="player-body">
        <div className="player-card">
          <p className="player-intro">Someone sent you a tape</p>

          {/* Cassette */}
          <div className="cassette-wrap" style={{ maxWidth: 360, margin: '0 auto' }}>
            <CassetteSVG
              theme={tape.theme}
              sideAMs={sideAMs}
              sideBMs={sideBMs}
              title={(tape.tapeName || 'MIXTAPE').toUpperCase()}
              spinning={playing}
            />
          </div>

          {/* Play / Sleeve toggle */}
          <div className="player-controls">
            <button
              className={`play-btn ${playing ? 'playing' : ''}`}
              onClick={() => setPlaying(p => !p)}
            >
              {playing ? '⏹ Stop' : '▶ Play'}
            </button>
            <button
              className={`view-btn ${showJCard ? 'active' : ''}`}
              onClick={() => setShowJCard(v => !v)}
              style={{ flex: 1 }}
            >
              {showJCard ? '◼ Hide Sleeve' : '📋 View Sleeve'}
            </button>
          </div>

          {/* J-card (read-only) */}
          {showJCard && (
            <JCard
              tapeName={tape.tapeName}
              theme={tape.theme}
              sideA={tape.sideA}
              sideB={tape.sideB}
              note={tape.note}
              readOnly={true}
            />
          )}

          {/* Track preview when sleeve hidden */}
          {!showJCard && (
            <div className="player-sides">
              {[{ label: 'Side A', tracks: tape.sideA }, { label: 'Side B', tracks: tape.sideB }].map(({ label, tracks }) => (
                <div key={label} className="player-side">
                  <div className="jcard-side-header">
                    <span className="jcard-side-label">{label}</span>
                  </div>
                  {tracks.length === 0
                    ? <p className="jcard-empty">Empty</p>
                    : tracks.map((t, i) => (
                      <div key={t.id + i} className="jcard-track">
                        <span className="jcard-num">{i + 1}.</span>
                        <div className="jcard-track-info">
                          <span className="jcard-track-title">{t.title}</span>
                          <span className="jcard-track-artist">{t.artist}</span>
                        </div>
                        <span className="jcard-track-dur">{t.durationLabel}</span>
                      </div>
                    ))
                  }
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
