import { registerGame } from '../../core/registry.js';
import { createStrikeCards, GAME_ID } from './game.js';

registerGame({
  id: GAME_ID,
  name: 'Strike Cards',
  tagline: 'A card duel where the faster card swings first - and the slower one may never swing at all.',
  description: 'Two cards a side, points to spend, and a board you have to clear completely to win.',
  howTo: [
    'Cards have <strong>health, power and speed</strong>. Put one down each turn, up to <strong>two out at a time</strong>.',
    'Playing a card costs <strong>points</strong>. You open with 5, take 1 more each turn, 2 from turn five and 3 from turn nine.',
    '<strong>Knocking a card out pays you what it cost</strong>, so trading up funds your next play.',
    'When two cards fight, <strong>both hurt each other and the faster one lands first</strong> - kill it before it moves and it never swings back.',
    '<strong>Gear</strong> is spent for a permanent boost, and some cards <strong>grow into something bigger</strong> if they survive long enough.',
    'Win by knocking out <strong>every</strong> card they have.',
  ],
  create: createStrikeCards,
});
