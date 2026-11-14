import { registerGame } from '../../core/registry.js';
import { createFaceoff, GAME_ID } from './game.js';

registerGame({
  id: GAME_ID,
  name: 'Faceoff',
  tagline: 'Nine fighters, one battle box. Pick three and watch them bump it out.',
  description: 'Undertale-style box fights: every collision costs both fighters health.',
  howTo: [
    'Pick <strong>three of the nine</strong>. The first one you choose goes into the box first.',
    'Two fighters at a time bounce around the box. <strong>Every bump costs both of them health</strong> - whoever was moving into the other takes less.',
    'Everyone has <strong>250 HP</strong>. Sans has 1, but <strong>the first 24 attacks miss him</strong>.',
    'When one is out, the next of that three steps in. Knock out all three to win.',
    'You do not steer anything. <strong>Click to watch faster.</strong>',
    '<strong>Sandbox</strong> is one fight. <strong>Tower</strong> is ten floors carrying your wounds up. <strong>Story</strong> is six set fights.',
  ],
  create: createFaceoff,
});
