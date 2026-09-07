import { registerGame } from '../../core/registry.js';
import { createShubat, GAME_ID } from './game.js';

registerGame({
  id: GAME_ID,
  name: 'Shubat',
  tagline: 'A card duel over four herds. Take the tricks worth taking.',
  description: 'Thirty-two cards, two deals, one rival. The biggest cards win tricks and score the most.',
  howTo: [
    'Four herds of eight. A card’s number is <strong>both its strength and its worth</strong> - an eight wins the trick and scores eight.',
    'One card is turned up to set the <strong>trump herd</strong>, which beats any other herd.',
    'Play <strong>any card</strong> while the stock lasts. The higher card of the led herd takes the trick; a trump takes it outright.',
    'The winner leads the next trick and draws first. <strong>Once the stock is empty you must follow the led herd</strong> if you can.',
    '<strong>Two deals a match</strong> - you lead one, the rival leads the other. Most points over both wins.',
  ],
  create: createShubat,
});
