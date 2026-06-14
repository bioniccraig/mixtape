import { getSkin } from './constants';

// Photographic cassette skin: a body photo with the two reels overlaid as separate
// images so they can spin in place during playback, and the tape name on the label.
// Accepts `skin` (id); falls back through `theme` for backwards-compatible callers.
export default function CassetteSVG({ skin, theme, title, spinning }) {
  const s = getSkin(skin || theme);
  const name = (title || 'MY MIXTAPE').trim();

  return (
    <div className="cassette">
      <img className="cassette-body" src={s.body} alt="Cassette" draggable="false" />

      {s.reels.map(([cx, cy], i) => (
        <img
          key={i}
          className={`cassette-reel ${spinning ? 'spinning' : ''}`}
          src={s.reelImgs[i]}
          alt=""
          draggable="false"
          style={{
            left:  `${(cx - s.rad) * 100}%`,
            top:   `${(cy - s.rad * 1.5) * 100}%`,
            width: `${s.rad * 2 * 100}%`,
            animationDuration: i === 0 ? '2.4s' : '1.9s',
          }}
        />
      ))}

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
