import { describe, it, expect } from 'vitest';
import { decodeTape } from './share';

// Build a base64 fixture the same way the app used to (UTF-8 → base64). Guards that
// old #tape= share links keep decoding after we removed the encode side.
const fixture = payload => Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64');

describe('decodeTape', () => {
  it('decodes a slim payload back into a tape', () => {
    const encoded = fixture({
      n: 'My Tape', t: 'green', no: 'enjoy',
      a: [{ i: '1', ti: 'Song A', ar: 'Artist A', d: 180000, dl: '3:00', y: 'abc12345678' }],
      b: [],
    });
    const tape = decodeTape(encoded);
    expect(tape.tapeName).toBe('My Tape');
    expect(tape.theme).toBe('green');
    expect(tape.note).toBe('enjoy');
    expect(tape.sideA).toHaveLength(1);
    expect(tape.sideA[0]).toMatchObject({
      id: '1',
      title: 'Song A',
      artist: 'Artist A',
      durationMs: 180000,
      durationLabel: '3:00',
      ytId: 'abc12345678',
      ytStatus: 'ok',
    });
    expect(tape.sideB).toEqual([]);
  });

  it('applies defaults for a near-empty payload', () => {
    const tape = decodeTape(fixture({}));
    expect(tape.tapeName).toBe('');
    expect(tape.theme).toBe('yellow');
    expect(tape.note).toBe('');
    expect(tape.sideA).toEqual([]);
    expect(tape.sideB).toEqual([]);
  });
});
