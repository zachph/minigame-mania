import { registerGame } from '../../core/registry.js';
import { createBumpers, GAME_ID } from './game.js';

registerGame({
  id: GAME_ID,
  name: 'Bumpers',
  tagline: 'Two balls in one room. Only the speed you carry into a hit counts for anything.',
  description: 'A bouncing duel: steer, line up a run, and take their health off them before they take yours.',
  howTo: [
    'Steer with <strong>WASD or the arrow keys</strong>, and press <strong>Space</strong> for your ability.',
    'Neither ball ever stops. You are always drifting, so you are always able to be hit.',
    'When you collide, <strong>you both take damage</strong> - but only for the speed you were carrying <em>into</em> the hit. Drift into someone charging and the whole exchange is theirs.',
    'Arriving twice as fast hurts <strong>more than twice as much</strong>, so a lined-up run beats leaning on them.',
    'Right after you are hit you are <strong>reeling</strong>: you go flying, but for a moment you cannot hurt anyone with the speed they just gave you.',
    'Being <strong>heavier</strong> than what you hit scales the damage up, and every ball carries one ability on a cooldown.',
    'Climb the <strong>ladder</strong> of six opponents keeping your health between rounds, or play <strong>two on one keyboard</strong> for a best of three.',
  ],
  create: createBumpers,
});
