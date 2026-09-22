import { registerGame } from '../../core/registry.js';
import { createCatchmon, GAME_ID } from './game.js';

registerGame({
  id: GAME_ID,
  name: 'Catchmon',
  tagline: 'Three-on-three type battles with a roster of thirty final evolutions.',
  description: 'Draft three Catchmon against the rival team, then out-think it in a turn-based battle.',
  howTo: [
    'Six types in a cycle: each one is <strong>strong against the next two</strong> and <strong>resisted by the previous two</strong>.',
    'Pick <strong>three of the thirty</strong> fighters. The rival team is shown first, so counter it.',
    'Each turn, choose a <strong>move</strong> or <strong>switch</strong>. Higher speed acts first; priority moves jump the queue.',
    'Some types carry an <strong>ability</strong> that fires on its own: <strong>Fire</strong> burns what it hits, <strong>Grass</strong> feeds on the wounds it makes, and <strong>Wind</strong> slips out of the way on every second turn.',
    'Heavy moves need to <strong>recharge</strong>, and heals are <strong>limited</strong> - do not plan on stalling.',
    'Win by knocking out all three rivals. Faster, healthier wins score more.',
  ],
  create: createCatchmon,
});
