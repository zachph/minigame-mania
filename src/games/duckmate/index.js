import { registerGame } from '../../core/registry.js';
import { createDuckmate, GAME_ID } from './game.js';

registerGame({
  id: GAME_ID,
  name: 'Duckmate',
  tagline: 'Red against Blue: a Fish, a Dog, a Bird and a Duck apiece.',
  description: 'Rock-paper-scissors on a chess board. Fish take Dogs, Dogs take Birds, Birds take Fish - and Ducks take anything.',
  howTo: [
    '<strong>Fish</strong> can only take <strong>Dogs</strong>. <strong>Dogs</strong> can only take <strong>Birds</strong>. <strong>Birds</strong> can only take <strong>Fish</strong>.',
    '<strong>Ducks</strong> can take anything, and <strong>nothing can take a Duck except another Duck</strong>.',
    'Every piece moves <strong>one square in any direction</strong>, diagonals too. You cannot land on a piece you cannot take.',
    'Red starts in the top-right corner, Blue in the bottom-left. Red moves first.',
    'Click a piece, then a highlighted square - or use the arrow keys and <strong>Enter</strong>.',
    'Win by <strong>taking the enemy Duck</strong>, or by <strong>taking their Fish, Dog and Bird</strong>. A side with no move left loses; 30 turns with nothing taken is a draw.',
  ],
  create: createDuckmate,
});
