import { TAPE_THEMES, MAX_SIDE_MS } from './constants';

// Build a gear/cog silhouette path — alternates between outer and inner radius
// for each tooth. Used for both the reel hub edge and the central drive sprocket.
function gearPath(cx, cy, teeth, rOut, rIn) {
  const step = Math.PI / teeth;
  let d = '';
  for (let i = 0; i < teeth * 2; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const a = i * step - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2) + ' ';
  }
  return d + 'Z';
}

// One reel: wound tape pack (radius grows with fill) + a toothed cog hub with the
// classic 6-prong drive sprocket in the centre. The cog teeth make spin obvious.
function Reel({ cx, cy, pack, spinning, dur }) {
  return (
    <g>
      {/* tape pack — concentric rings read as wound tape */}
      <circle cx={cx} cy={cy} r={pack} fill="#241509" />
      <circle cx={cx} cy={cy} r={pack} fill="none" stroke="#4a3320" strokeWidth="1.2" opacity="0.7" />
      <circle cx={cx} cy={cy} r={(pack + 17) / 2} fill="none" stroke="#3a2716" strokeWidth="1" opacity="0.5" />

      {/* spinning cog */}
      <g>
        {/* outer cog wheel (toothed) */}
        <path d={gearPath(cx, cy, 14, 17, 14)} fill="#ededf2" stroke="#b7b7c2" strokeWidth="0.8" />
        <circle cx={cx} cy={cy} r="12.5" fill="#f6f6f9" />
        {/* central dark opening */}
        <circle cx={cx} cy={cy} r="9.5" fill="#1c1c22" />
        {/* 6-prong drive sprocket (the iconic cassette detail) */}
        <path d={gearPath(cx, cy, 6, 9, 4.5)} fill="#3a3a45" />
        <circle cx={cx} cy={cy} r="2.4" fill="#15151a" />
        {spinning && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`0 ${cx} ${cy}`}
            to={`360 ${cx} ${cy}`}
            dur={`${dur}s`}
            repeatCount="indefinite"
          />
        )}
      </g>
    </g>
  );
}

export default function CassetteSVG({ theme, sideAMs, sideBMs, title, spinning }) {
  const t = TAPE_THEMES.find(x => x.id === theme) || TAPE_THEMES[0];
  const aPct = Math.min((sideAMs || 0) / MAX_SIDE_MS, 1);
  const bPct = Math.min((sideBMs || 0) / MAX_SIDE_MS, 1);

  const PACK_MIN = 20, PACK_MAX = 40;
  const leftPack  = PACK_MIN + bPct * (PACK_MAX - PACK_MIN); // Side B
  const rightPack = PACK_MIN + aPct * (PACK_MAX - PACK_MIN); // Side A

  // Retro rainbow stripes for the label band
  const stripes = ['#e23b2e', '#ef7d34', '#f4c531', '#3fae6b', '#2f7fc0', '#5a4b9c'];

  return (
    <svg
      viewBox="0 0 360 230"
      width="100%"
      style={{ maxWidth: 440, filter: 'drop-shadow(0 12px 28px rgba(0,0,0,0.35))' }}
    >
      <defs>
        <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.04" />
          <stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id="windowGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a0a0e" />
          <stop offset="1" stopColor="#23232b" />
        </linearGradient>
      </defs>

      {/* Shell */}
      <rect x="8" y="14" width="344" height="202" rx="18" fill={t.body} />
      <rect x="8" y="14" width="344" height="202" rx="18" fill="url(#sheen)" />
      <rect x="8" y="14" width="344" height="202" rx="18" fill="none" stroke="#000" strokeOpacity="0.18" strokeWidth="1.5" />
      {/* inner bezel */}
      <rect x="20" y="26" width="320" height="178" rx="12" fill="#000" opacity="0.06" />

      {/* Label */}
      <rect x="40" y="34" width="280" height="60" rx="6" fill={t.label_bg} />
      <rect x="40" y="34" width="280" height="60" rx="6" fill="none" stroke="#000" strokeOpacity="0.12" />
      {/* rainbow band */}
      <g>
        {stripes.map((c, i) => (
          <rect key={c} x={44 + i * 45.5} y="38" width="45.5" height="7" fill={c} />
        ))}
        <rect x="44" y="38" width={stripes.length * 45.5} height="7" rx="2" fill="none" />
      </g>
      <text x="180" y="68" textAnchor="middle" fontSize="15" fontWeight="700"
        fill={t.label_text} fontFamily="'Space Mono', ui-monospace, monospace" letterSpacing="0.5">
        {(title || 'MY MIXTAPE').slice(0, 22)}
      </text>
      <text x="180" y="85" textAnchor="middle" fontSize="8.5"
        fill={t.label_text} opacity="0.65" fontFamily="'Space Mono', ui-monospace, monospace" letterSpacing="1.5">
        NORMAL POSITION · EQ 120µS
      </text>

      {/* Window */}
      <rect x="62" y="104" width="236" height="96" rx="12" fill="url(#windowGrad)" />
      <rect x="62" y="104" width="236" height="96" rx="12" fill="none" stroke="#000" strokeOpacity="0.5" strokeWidth="2" />

      {/* Reels */}
      <Reel cx={132} cy={152} pack={leftPack}  spinning={spinning} dur={2.2} />
      <Reel cx={228} cy={152} pack={rightPack} spinning={spinning} dur={1.7} />

      {/* Tape strand between reels */}
      <path d={`M ${132 + leftPack} 152 Q 180 168 ${228 - rightPack} 152`}
        fill="none" stroke="#2b1c10" strokeWidth="2.5" opacity="0.8" />

      {/* Side letters */}
      <text x="92"  y="120" textAnchor="middle" fontSize="11" fill="#fff" opacity="0.7"
        fontFamily="'Space Mono', monospace">B</text>
      <text x="268" y="120" textAnchor="middle" fontSize="11" fill="#fff" opacity="0.7"
        fontFamily="'Space Mono', monospace">A</text>

      {/* Bottom spindle / capstan holes */}
      <circle cx="150" cy="206" r="3.5" fill="#000" opacity="0.4" />
      <circle cx="210" cy="206" r="3.5" fill="#000" opacity="0.4" />
      <rect x="166" y="203" width="28" height="7" rx="3" fill="#000" opacity="0.25" />

      {/* Corner screws */}
      {[[30, 40], [330, 40], [30, 196], [330, 196]].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="5.5" fill="#000" opacity="0.28" />
          <circle cx={x} cy={y} r="2.5" fill="#000" opacity="0.35" />
        </g>
      ))}
    </svg>
  );
}
