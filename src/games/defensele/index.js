import { registerGame } from '../../core/registry.js';
import { createDefensele, GAME_ID } from './game.js';

registerGame({
  id: GAME_ID,
  name: 'Defensele',
  tagline: 'Ten defenders, one road, seventeen waves that never wait for you.',
  description: 'Hold the road. Build while they walk, because nothing pauses between waves.',
  howTo: [
    'Enemies walk the road from the left to your base. Every one that reaches it <strong>costs you lives</strong>.',
    'Pick a defender from the bar and click <strong>open ground</strong> to build it. <strong>Bastion is the exception</strong> - it goes in the road itself and blocks the way until it is rubble.',
    'Gold comes from kills and from each wave arriving. Click a defender you built to <strong>sell</strong> it back.',
    '<strong>Nothing pauses.</strong> The next wave starts on its own timer whether or not you are ready.',
    'Seventeen waves, and the last two are nothing but Skeleflames. Turn them all back and the road is yours.',
  ],
  create: createDefensele,
});
