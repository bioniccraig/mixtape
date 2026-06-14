import { getSkin } from './constants';

// Photographic cassette skin: a static body photo (reels included in the photo)
// with the tape name printed on the label. Spinning overlay reels were reverted —
// the crop-and-rotate looked off, so we keep the clean photo.
// Accepts `skin` (id); falls back through `theme` for backwards-compatible callers.
export default function CassetteSVG({ skin, theme, title }) {
  const s = getSkin(skin || theme);
  const name = (title || 'MY MIXTAPE').trim();

  return (
    <div className="cassette">
      <img className="cassette-body" src={s.body} alt="Cassette" draggable="false" />
      <div
        className="cassette-label"
        style={{
          left: `${s.label.x * 100}%`,
          top:  `${s.label.y * 100}%`,
          width: `${s.label.w * 100}%`,
          color: s.label.color,
        }}
      >
        {name}
      </div>
    </div>
  );
}
