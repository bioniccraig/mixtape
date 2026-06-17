export const MAX_SIDE_MS = 45 * 60 * 1000; // 45 minutes per side

// Photographic cassette skins. Each skin = a body photo + measured reel centres
// (for the spinning overlay) and a label anchor (for the tape name).
// Coordinates are fractions of the image (1536×1024, 3:2).
export const TAPE_SKINS = [
  {
    id: 'rainbow',
    name: 'Rainbow',
    body:  '/skins/rainbow.jpg',
    reelImgs: ['/skins/rainbow-reel-l.png', '/skins/rainbow-reel-r.png'],
    reels: [[0.3153, 0.5157], [0.6748, 0.5229]],
    rad: 0.052,
    label: { x: 0.52, y: 0.25, w: 0.58, color: '#26262b' },
  },
  {
    id: 'green',
    name: 'Green',
    body:  '/skins/green.jpg',
    reelImgs: ['/skins/green-reel-l.png', '/skins/green-reel-r.png'],
    reels: [[0.3068, 0.5043], [0.6814, 0.5035]],
    rad: 0.052,
    label: { x: 0.55, y: 0.25, w: 0.55, color: '#26262b' },
  },
  {
    id: 'classic',
    name: 'Classic',
    body:  '/skins/classic.jpg',
    reelImgs: ['/skins/classic-reel-l.png', '/skins/classic-reel-r.png'],
    reels: [[0.3177, 0.4987], [0.6796, 0.4988]],
    rad: 0.052,
    label: { x: 0.56, y: 0.235, w: 0.52, color: '#26262b' },
  },
  { id: 'tape4',     name: 'Tape 4',     body: '/skins/tape4.png',     reelImgs: [], reels: [], rad: 0, label: { x: 0.52, y: 0.25, w: 0.55, color: '#26262b' } },
  { id: 'tape5',     name: 'Tape 5',     body: '/skins/tape5.png',     reelImgs: [], reels: [], rad: 0, label: { x: 0.52, y: 0.25, w: 0.55, color: '#26262b' } },
  { id: 'tape6',     name: 'Tape 6',     body: '/skins/tape6.png',     reelImgs: [], reels: [], rad: 0, label: { x: 0.52, y: 0.25, w: 0.55, color: '#26262b' } },
  { id: 'tape7',     name: 'Tape 7',     body: '/skins/tape7.png',     reelImgs: [], reels: [], rad: 0, label: { x: 0.52, y: 0.25, w: 0.55, color: '#26262b' } },
  { id: 'tape8',     name: 'Tape 8',     body: '/skins/tape8.png',     reelImgs: [], reels: [], rad: 0, label: { x: 0.52, y: 0.25, w: 0.55, color: '#26262b' } },
  { id: 'tape9',     name: 'Tape 9',     body: '/skins/tape9.png',     reelImgs: [], reels: [], rad: 0, label: { x: 0.52, y: 0.25, w: 0.55, color: '#26262b' } },
];

export const DEFAULT_SKIN = 'rainbow';

export function getSkin(id) {
  return TAPE_SKINS.find(s => s.id === id) || TAPE_SKINS[0];
}
