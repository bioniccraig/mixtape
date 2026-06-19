// LibrarySpine — one cassette-case "spine" row used by BOTH the home shelf
// (InlineLibrary) and the Library modal (MyLibrary). The spine itself is a clean
// cassette; TAPPING it opens an action menu (bottom sheet on mobile, centred
// popover on desktop) so the shelf stays uncluttered.
//
//   kind='sent'     → Open · Copy link · Duplicate · Delete
//   kind='draft'    → Edit · Delete
//   kind='received' → Play · Remove from my library

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
  onOpen, onCopyLink, onDuplicate, onDelete, onRemove,
}) {
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [confirming,  setConfirming]  = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const name    = tape.tape_name || tape.tapeName || 'Untitled';
  const count   = trackCount(tape);
  const caseNum = caseNumFor(tape);
  const date    = formatDate(tape.updated_at || tape.created_at);
  const badge   = kind === 'draft' ? 'Draft' : '';

  // Per-kind "open" affordance + destructive action
  const openLabel = kind === 'draft' ? 'Edit' : 'Open';
  const openIcon  = kind === 'draft' ? '✏' : '📂';
  const destructive = kind === 'received'
    ? { label: 'Remove from my library', icon: '🗑', confirm: 'Remove this tape from your library?', verb: 'remove', run: () => onRemove(tape) }
    : { label: 'Delete tape',            icon: '🗑', confirm: 'Delete this tape permanently?',       verb: 'delete', run: () => onDelete(tape) };

  function close() { setMenuOpen(false); setConfirming(false); setCopied(false); }

  function handleOpen() { onOpen(tape); close(); }

  function handleCopy() {
    onCopyLink(tape);
    setCopied(true);
    setTimeout(close, 900);
  }

  async function handleDuplicate() {
    setDuplicating(true);
    await onDuplicate(tape);
    setDuplicating(false);
    close();
  }

  function handleDestructive() {
    destructive.run();
    close();
  }

  return (
    <>
      <button className="lib-spine" onClick={() => setMenuOpen(true)} title={name}>
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

      {menuOpen && (
        <div className="lib-sheet-overlay" onClick={close}>
          <div className="lib-sheet" onClick={e => e.stopPropagation()} role="menu">
            <div className="lib-sheet-head">
              <span className="lib-sheet-title">{name}</span>
              <span className="lib-sheet-sub">
                {count} track{count !== 1 ? 's' : ''}{badge && ` · ${badge}`}{date && ` · ${date}`}
              </span>
            </div>

            <div className="lib-sheet-items">
              <button className="lib-sheet-item" onClick={handleOpen}>
                <span className="lib-sheet-ico">{openIcon}</span> {openLabel}
              </button>

              {kind === 'sent' && (
                <>
                  <button className="lib-sheet-item" onClick={handleCopy}>
                    <span className="lib-sheet-ico">🔗</span> {copied ? 'Link copied!' : 'Copy share link'}
                  </button>
                  <button className="lib-sheet-item" onClick={handleDuplicate} disabled={duplicating}>
                    <span className="lib-sheet-ico">⎘</span> {duplicating ? 'Duplicating…' : 'Duplicate as draft'}
                  </button>
                </>
              )}

              {confirming ? (
                <div className="lib-sheet-confirm">
                  <span className="lib-sheet-confirm-q">{destructive.confirm}</span>
                  <button className="lib-sheet-item lib-sheet-item-danger" onClick={handleDestructive}>
                    Yes, {destructive.verb}
                  </button>
                  <button className="lib-sheet-item" onClick={() => setConfirming(false)}>Cancel</button>
                </div>
              ) : (
                <button className="lib-sheet-item lib-sheet-item-danger" onClick={() => setConfirming(true)}>
                  <span className="lib-sheet-ico">{destructive.icon}</span> {destructive.label}
                </button>
              )}
            </div>

            <button className="lib-sheet-cancel" onClick={close}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
