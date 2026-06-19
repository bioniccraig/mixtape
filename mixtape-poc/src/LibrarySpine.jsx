// LibrarySpine — one cassette-case "spine" row used by BOTH the home shelf
// (InlineLibrary) and the Library modal (MyLibrary), so the look + actions stay
// identical. Tapping the spine opens the tape; a compact action cluster on the
// right handles the per-type actions that used to live on the old library cards.
//
//   kind='sent'     → 🔗 copy link · ⎘ duplicate · 🗑 delete   (tap = preview)
//   kind='draft'    → 🗑 delete                                (tap = edit)
//   kind='received' → (no actions)                             (tap = play)

import { useState } from 'react';

function caseNumFor(tape) {
  const key = String(tape.id || tape.tape_name || tape.tapeName || '');
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h + key.charCodeAt(i)) % 6;
  return h + 1; // 1..6
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function trackCount(tape) {
  const a = Array.isArray(tape.tracks_a) ? tape.tracks_a.length : (tape.sideA?.length || 0);
  const b = Array.isArray(tape.tracks_b) ? tape.tracks_b.length : (tape.sideB?.length || 0);
  return a + b;
}

export default function LibrarySpine({
  tape, kind, likeCount = 0,
  onOpen, onCopyLink, onDuplicate, onDelete,
}) {
  const [copied,      setCopied]      = useState(false);
  const [confirming,  setConfirming]  = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const name    = tape.tape_name || tape.tapeName || 'Untitled';
  const count   = trackCount(tape);
  const caseNum = caseNumFor(tape);
  const date    = formatDate(tape.updated_at || tape.created_at);
  const badge   = kind === 'draft' ? 'Draft' : '';

  function copy(e) {
    e.stopPropagation();
    onCopyLink(tape);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function dupe(e) {
    e.stopPropagation();
    setDuplicating(true);
    await onDuplicate(tape);
    setDuplicating(false);
  }

  const hasActions = kind === 'sent' || kind === 'draft';

  return (
    <div className="lib-spine">
      <button className="lib-spine-open" onClick={() => onOpen(tape)} title={name}>
        <img className="lib-spine-img" src={`/cases/case${caseNum}.jpg`} alt="" />
        <span className="lib-spine-label">
          <span className="lib-spine-name">{name}</span>
          <span className="lib-spine-meta">
            {count} track{count !== 1 ? 's' : ''}
            {badge && ` · ${badge}`}
            {date && ` · ${date}`}
            {likeCount > 0 && ` · ❤ ${likeCount}`}
          </span>
        </span>
      </button>

      {/* Always render the column (even when empty for received tapes) so every
          cassette keeps the same width and the shelf stays aligned. */}
      <div className="lib-spine-actions" onClick={e => e.stopPropagation()}>
        {hasActions && (confirming ? (
          <>
            <button className="lib-spine-btn lib-spine-btn-danger"
                    onClick={() => onDelete(tape)} title="Confirm delete">✓</button>
            <button className="lib-spine-btn"
                    onClick={() => setConfirming(false)} title="Cancel">✕</button>
          </>
        ) : (
          <>
            {kind === 'sent' && (
              <>
                <button className="lib-spine-btn" onClick={copy} title="Copy share link">
                  {copied ? '✓' : '🔗'}
                </button>
                <button className="lib-spine-btn" onClick={dupe} disabled={duplicating}
                        title="Duplicate as draft">
                  {duplicating ? '…' : '⎘'}
                </button>
              </>
            )}
            <button className="lib-spine-btn" onClick={() => setConfirming(true)} title="Delete">🗑</button>
          </>
        ))}
      </div>
    </div>
  );
}
