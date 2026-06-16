// FrontCover.jsx
// Always-visible cover for both builder (editable) and player (read-only).
// Priority: uploaded photo → auto-art (first track's iTunes artwork) → user colour → neutral dark.

// Preset cover colours (user choice only — no auto-assigned skin gradients)
const COVER_COLORS = [
  '#1a1a2e', '#533483', '#e94560',
  '#c0392b', '#f5a623', '#1e8449', '#00b5ad', '#0d0d0d',
];

export default function FrontCover({
  tapeName,
  coverImageUrl,
  coverColor,
  autoArtUrl,
  editable = false,
  onPhotoChange,   // (File | null) => void
  onColorChange,   // (hexString) => void
}) {
  // Neutral dark default — auto-art or user colour sits on top
  const bgStyle = coverColor
    ? { background: coverColor }
    : { background: '#1a1a2e' };

  const hasPhoto = !!coverImageUrl;
  const hasArt   = !hasPhoto && !!autoArtUrl;

  return (
    <>
      <div className="front-cover-wrap">
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
      </div>

      {/* Colour swatches removed — cover is photo-only */}
    </>
  );
}
