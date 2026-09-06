import { registerGame } from '../../core/registry.js';
import { createCatchmon, GAME_ID } from './game.js';

registerGame({
  id: GAME_ID,
  name: 'Catchmon',
  tagline: 'Sixty seconds. One field of wild mons. Fill your dex.',
  description: 'Wild Catchmon roam the meadow. Land a ball on one and hope it holds.',
  howTo: [
    '<strong>Aim</strong> with the mouse (or arrow keys / WASD).',
    '<strong>Hold</strong> to charge a focused throw, <strong>release</strong> to throw. Space works too.',
    'Land the ball <strong>dead centre</strong> on a mon for the best odds.',
    'A near miss <strong>spooks</strong> everything nearby, and scared mons are harder to catch.',
    'Every catch refunds a ball and builds your <strong>streak multiplier</strong>. Rarer mons score more.',
  ],
  create: createCatchmon,
});
