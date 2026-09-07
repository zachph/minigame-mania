import { registerGame } from '../../core/registry.js';
import { createShubat, GAME_ID } from './game.js';

registerGame({
  id: GAME_ID,
  name: 'Shubat',
  tagline: 'Deck duel across three lanes: Iron Warrior against String Brain.',
  description: 'Pick a starter deck, hold three lanes, and put the other core down first.',
  howTo: [
    'Pick a starter deck: <strong>Iron Warrior</strong> (cheap, fast, smashes through) or <strong>String Brain</strong> (slow, enormous, outlasts you). Twenty cards: <strong>5 fighters, 10 supports, 2 instants, 3 traps</strong>.',
    'You get <strong>one more energy each turn</strong>. Fighters cost what their numbers are worth, so the big ones land late.',
    'Three lanes. A fighter only fights whatever stands opposite it - an <strong>empty lane is a straight road to the core</strong>.',
    'Fighters cannot attack the turn they land. <strong>Traps</strong> are set face down and fire on their own during the rival turn.',
    'Put the rival core to zero. Each difficulty brings <strong>its own build of the deck</strong>.',
  ],
  create: createShubat,
});
