import { registerGame } from '../../core/registry.js';
import { createNopoly, GAME_ID } from './game.js';

registerGame({
  id: GAME_ID,
  name: 'Nopoly',
  tagline: 'Red against Blue on a chess board: six farmers, two golems, no mercy.',
  description: 'Eight pieces a side on an 8x8 board. Capture everything your opponent has.',
  howTo: [
    '<strong>Farmers</strong> (six a side) move <strong>one square</strong> up, down, left or right.',
    '<strong>Golems</strong> (two a side) move <strong>up to two squares</strong> in any of the eight directions.',
    'Nothing jumps: a piece in the way blocks the path. Landing on an enemy <strong>captures</strong> it.',
    'Red moves first. Click a piece, then a highlighted square - or use the arrow keys and <strong>Enter</strong>.',
    'Win by <strong>capturing every enemy piece</strong>. If 25 turns pass with no capture, the bigger army takes it.',
  ],
  create: createNopoly,
});
