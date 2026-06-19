import { describe, it, expect } from 'vitest';
import { scoreAppleResult, pickBestApple } from './appleMatch';

// These guard the Apple Music "wrong same-title song" fix — the exact bug where
// the dB's "Black and White" matched Juice WRLD. If someone loosens the gating,
// these tests should go red.

describe('scoreAppleResult', () => {
  it('rejects a different artist with the same title', () => {
    const r = { name: 'Black and White', artistName: 'Juice WRLD' };
    expect(scoreAppleResult(r, 'Black and White', "The dB's")).toBeNull();
  });

  it('matches across a leading "The" and punctuation', () => {
    const r = { name: 'Black and White', artistName: "The dB's" };
    expect(scoreAppleResult(r, 'Black and White', "dB's")).toBeGreaterThan(0);
  });

  it('treats "&" and "and" as equivalent', () => {
    const r = { name: 'Play With Fire', artistName: 'Barbara and Ernie' };
    expect(scoreAppleResult(r, 'Play With Fire', 'Barbara & Ernie')).toBeGreaterThan(0);
  });

  it('scores the original above a live/variant version', () => {
    const orig = { name: 'The Saints Are Coming', artistName: 'Skids' };
    const live = { name: 'The Saints Are Coming (Live)', artistName: 'Skids' };
    expect(scoreAppleResult(orig, 'The Saints Are Coming', 'Skids'))
      .toBeGreaterThan(scoreAppleResult(live, 'The Saints Are Coming', 'Skids'));
  });
});

describe('pickBestApple', () => {
  it('returns null when nothing matches the artist', () => {
    const songs = [{ name: 'Black and White', artistName: 'Juice WRLD' }];
    expect(pickBestApple(songs, 'Black and White', "The dB's")).toBeNull();
  });

  it('prefers the original studio version over a live one', () => {
    const songs = [
      { name: 'Die Young (Live)', artistName: 'Kevin Morby' },
      { name: 'Die Young',        artistName: 'Kevin Morby' },
    ];
    expect(pickBestApple(songs, 'Die Young', 'Kevin Morby').name).toBe('Die Young');
  });
});
