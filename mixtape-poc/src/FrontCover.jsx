// FrontCover.jsx
// Always-visible cover for both builder (editable) and player (read-only).
// Priority: uploaded photo → auto-art (first track's iTunes artwork) → colour/gradient fallback.

// Preset cover colours
const COVER_COLORS = [
  '#0d0d0d', '#1a1a2e', '#533483', '#e94560',
  '#c0392b', '#f5a623', '#1e8449', '#00b5ad',
];

// Skin-based gradient when no photo, no auto-art, no explicit colour
const SKIN_GRADIENTS = {
  rainbow:  'linear-gradient(145deg, #e96c6c 0%, #e9c46a 50%, #52b788 100%)',
  midnight: 'linear-gradient(145deg, #0d1b2a 0%, #1b4332 100%)',
  chrome:   'linear-gradient(145deg, #8e9eab 0%, #d0d8dd 100%)',
  cream:    'linear-gradient(145deg, #d4a373 0%, #f5e6ca 100%)',
  neon:     'linear-gradient(145deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
  black:    'linear-gradient(145deg, #232526 0%, #414345 100%)',
};

export default function FrontCover({
  tapeName,
  skin,
  coverImageUrl,
  coverColor,
  autoArtUrl,
  editable = false,
  onPhotoChange,   // (File | null) => void
  onColorChange,   // (hexString) => void
}) {
  const bgStyle = coverColor
    ? { background: coverColor }
    : { background: SKIN_GRADIENTS[skin] || SKIN_GRADIENTS.rainbow };

  const hasPhoto = !!coverImageUrl;
  const hasArt   = !hasPhoto && !!autoArtUrl;

  return (
    <>
      <div className="front-cover" style={hasPhoto ? {} : bgStyle}>

        {/* ── Uploaded cover photo ── */}
        {hasPhoto && (
          <img className="fc-photo" src={coverImageUrl} alt="Cover" />
        )}

        {/* ── Auto-art: blurred background + centred album art ── */}
        {hasArt && (
          <>
            <img className="fc-auto-art-bg" src={autoArtUrl} alt="" aria-hidden />
            <div className="fc-auto-art-centre">
              <img src={autoArtUrl} alt="Album art" />
            </div>
          </>
        )}

        {/* ── Tape name overlay ── */}
        <div className="fc-name-bar">
          {tapeName || 'MY MIXTAPE'}
        </div>

        {/* ── Edit controls (builder only) ── */}
        {editable && (
          <>
            <label className="fc-upload-btn">
              📷 {hasPhoto ? 'Change photo' : 'Add photo'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f && onPhotoChange) onPhotoChange(f);
                  e.target.value = '';
                }}
              />
            </label>

            {hasPhoto && (
              <button
                className="fc-remove-btn"
                onClick={() => onPhotoChange && onPhotoChange(null)}
                title="Remove photo"
              >
                ✕
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Colour swatches — shown below cover when editable + no photo ── */}
      {editable && !hasPhoto && (
        <div className="fc-swatches">
          {COVER_COLORS.map(c => (
            <button
              key={c}
              className={`fc-swatch ${coverColor === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => onColorChange && onColorChange(coverColor === c ? null : c)}
              title="Set cover colour"
            />
          ))}
        </div>
      )}
    </>
  );
}
