import { TAPE_THEMES } from './constants';

function msToLabel(ms) {
  const m = Math.floor(ms / 60000);
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${m}:${s}`;
}

function TrackLine({ track, index }) {
  return (
    <div className="jcard-track">
      <span className="jcard-num">{index + 1}.</span>
      <div className="jcard-track-info">
        <span className="jcard-track-title">{track.title}</span>
        <span className="jcard-track-artist">{track.artist}</span>
      </div>
      <span className="jcard-track-dur">{track.durationLabel}</span>
    </div>
  );
}

export default function JCard({ tapeName, theme, sideA, sideB, note, onNoteChange, readOnly }) {
  const t = TAPE_THEMES.find(x => x.id === theme) || TAPE_THEMES[0];
  const totalA = sideA.reduce((s, x) => s + x.durationMs, 0);
  const totalB = sideB.reduce((s, x) => s + x.durationMs, 0);

  return (
    <div className="jcard">
      {/* Banner strip in tape colour */}
      <div className="jcard-banner" style={{ background: t.body }}>
        <span className="jcard-title" style={{ color: t.label_text }}>
          {tapeName || 'MY MIXTAPE'}
        </span>
      </div>

      <div className="jcard-body">
        {/* Two-column tracklist */}
        <div className="jcard-sides">
          <div className="jcard-side">
            <div className="jcard-side-header">
              <span className="jcard-side-label">SIDE A</span>
              {totalA > 0 && <span className="jcard-side-time">{msToLabel(totalA)}</span>}
            </div>
            {sideA.length === 0
              ? <p className="jcard-empty">No tracks yet</p>
              : sideA.map((track, i) => <TrackLine key={track.id + i} track={track} index={i} />)
            }
          </div>

          <div className="jcard-col-divider" />

          <div className="jcard-side">
            <div className="jcard-side-header">
              <span className="jcard-side-label">SIDE B</span>
              {totalB > 0 && <span className="jcard-side-time">{msToLabel(totalB)}</span>}
            </div>
            {sideB.length === 0
              ? <p className="jcard-empty">No tracks yet</p>
              : sideB.map((track, i) => <TrackLine key={track.id + i} track={track} index={i} />)
            }
          </div>
        </div>

        {/* Personal note */}
        <div className="jcard-note-section">
          {readOnly ? (
            note
              ? <p className="jcard-note-text">❝ {note} ❞</p>
              : null
          ) : (
            <textarea
              className="jcard-note-input"
              value={note}
              onChange={e => onNoteChange(e.target.value)}
              placeholder="Write a personal note to tuck inside the sleeve…"
              maxLength={300}
              rows={3}
            />
          )}
        </div>
      </div>
    </div>
  );
}
