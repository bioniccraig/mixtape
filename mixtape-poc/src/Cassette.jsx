import { TAPE_THEMES, MAX_SIDE_MS } from './constants';

// Three spokes at 0°, 120°, 240° — makes rotation clearly visible
function Spokes({ cx, cy, r, color }) {
  const angles = [0, 120, 240];
  const inner = 9;
  return angles.map(deg => {
    const rad = (deg * Math.PI) / 180;
    const x1 = cx + Math.cos(rad) * inner;
    const y1 = cy + Math.sin(rad) * inner;
    const x2 = cx + Math.cos(rad) * (r - 3);
    const y2 = cy + Math.sin(rad) * (r - 3);
    return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2.5" strokeLinecap="round" />;
  });
}

export default function CassetteSVG({ theme, sideAMs, sideBMs, title, spinning }) {
  const t = TAPE_THEMES.find(x => x.id === theme) || TAPE_THEMES[0];
  const aPct = Math.min((sideAMs || 0) / MAX_SIDE_MS, 1);
  const bPct = Math.min((sideBMs || 0) / MAX_SIDE_MS, 1);

  const leftR  = 18 + bPct * 10;
  const rightR = 18 + aPct * 10;

  // Spoke colour: lighter than reel body so they're visible
  const spokeColor = t.id === 'yellow' ? '#888' : '#bbb';

  return (
    <svg
      viewBox="0 0 280 160"
      width="100%"
      style={{ maxWidth: 420, filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.25))' }}
    >
      {/* Body */}
      <rect x="4" y="20" width="272" height="120" rx="14" fill={t.body} />

      {/* Window cutout */}
      <rect x="60" y="34" width="160" height="72" rx="8" fill="#111" opacity="0.85" />

      {/* Left reel (Side B) */}
      <g>
        <circle cx="106" cy="70" r={leftR} fill={t.reel} />
        <Spokes cx={106} cy={70} r={leftR} color={spokeColor} />
        <circle cx="106" cy="70" r="8" fill="#444" />
        <circle cx="106" cy="70" r="4" fill="#aaa" />
        {spinning && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 106 70"
            to="360 106 70"
            dur="2.2s"
            repeatCount="indefinite"
          />
        )}
      </g>

      {/* Right reel (Side A) */}
      <g>
        <circle cx="174" cy="70" r={rightR} fill={t.reel} />
        <Spokes cx={174} cy={70} r={rightR} color={spokeColor} />
        <circle cx="174" cy="70" r="8" fill="#444" />
        <circle cx="174" cy="70" r="4" fill="#aaa" />
        {spinning && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 174 70"
            to="360 174 70"
            dur="1.7s"
            repeatCount="indefinite"
          />
        )}
      </g>

      {/* Tape strand */}
      <path
        d={`M ${106 + leftR} 70 Q 140 84 ${174 - rightR} 70`}
        fill="none"
        stroke="#3a2500"
        strokeWidth="2.5"
        opacity="0.75"
      />

      {/* Label */}
      <rect x="64" y="96" width="152" height="30" rx="4" fill={t.label_bg} />
      <text
        x="140" y="116"
        textAnchor="middle"
        fontSize="11"
        fontWeight="bold"
        fill={t.label_text}
        fontFamily="Arial, sans-serif"
      >
        {(title || 'MY MIXTAPE').slice(0, 22)}
      </text>

      {/* Side indicators */}
      <text x="86"  y="67" textAnchor="middle" fontSize="8" fill="#fff" opacity="0.6" fontFamily="Arial">B</text>
      <text x="194" y="67" textAnchor="middle" fontSize="8" fill="#fff" opacity="0.6" fontFamily="Arial">A</text>

      {/* Corner screws */}
      {[32, 248].map(cx => (
        <circle key={cx} cx={cx} cy="130" r="7" fill="#000" opacity="0.35" />
      ))}

      {/* Bottom alignment notch */}
      <rect x="120" y="136" width="40" height="5" rx="2" fill="#000" opacity="0.25" />
    </svg>
  );
}
