import { SUIT_BY_ID, trickWinner } from './cards.js';
import { HAND_SIZE, legalPlays, mustFollowSuit, opponentOf, playAndSettle, scoreOf, unseenCards } from './rules.js';

/**
 * The rival. It never looks at your hand while cards are hidden: it plays off
 * its own hand plus what everyone has seen.
 *
 * Once the stock is empty, though, every remaining card is public by counting -
 * whatever is unseen is in your hand - so at that point Hard switches to a full
 * search of the last few tricks. That is deduction, not peeking.
 */
export const DIFFICULTIES = {
  easy: { id: 'easy', name: 'Easy', counts: false, solves: false, sloppiness: 0.45, blurb: 'Plays by feel, and often the wrong card.' },
  normal: { id: 'normal', name: 'Normal', counts: false, solves: false, sloppiness: 0.12, blurb: 'Wins tricks worth winning, dumps the rest.' },
  hard: { id: 'hard', name: 'Hard', counts: true, solves: true, sloppiness: 0, blurb: 'Counts the cards and plays the endgame out exactly.' },
};

const VALUABLE_TRICK = 5; // a led card worth this much is worth fighting for

const lowest = (cards) => cards.reduce((best, card) => (card.points < best.points ? card : best), cards[0]);
const highest = (cards) => cards.reduce((best, card) => (card.points > best.points ? card : best), cards[0]);

/** Cards of `suit` that could still be against us, from what we have seen. */
function outstanding(state, player, suit) {
  return unseenCards(state, player).filter((card) => card.suit === suit);
}

function beats(candidate, led, trumpSuit) {
  return trickWinner(led, candidate, trumpSuit) === 'follower';
}

/* ------------------------------------------------------------- heuristics */

function chooseLead(state, player, level) {
  const hand = state.hands[player];
  const trump = state.trumpSuit;
  const plain = hand.filter((card) => card.suit !== trump);
  const trumps = hand.filter((card) => card.suit === trump);

  // Cash a high plain card only once nothing can trump it. A card no rank can
  // beat is still worth nothing if the other side is void in the suit and
  // holding a trump - which is exactly how leading "winners" loses points.
  if (level.counts && outstanding(state, player, trump).length === 0) {
    const winners = plain.filter((card) => {
      const higher = outstanding(state, player, card.suit).filter((other) => other.rank > card.rank);
      return higher.length === 0 && card.points >= 4;
    });
    if (winners.length > 0) return highest(winners);
  }

  // Trumps are for taking other people's points, not for leading.
  if (plain.length > 0) return lowest(plain);
  return lowest(trumps);
}

function chooseFollow(state, player, level) {
  const options = legalPlays(state, player);
  const led = state.table[state.leader];
  const trump = state.trumpSuit;
  const pot = led.points;

  const winners = options.filter((card) => beats(card, led, trump));
  const losers = options.filter((card) => !beats(card, led, trump));

  if (winners.length > 0) {
    const cheapest = lowest(winners);
    const worthIt = pot >= VALUABLE_TRICK || cheapest.points <= 2 || losers.length === 0;
    // Do not burn a valuable trump on a cheap trick when a discard is available.
    const overpaying = cheapest.suit === trump && led.suit !== trump
      && cheapest.points >= VALUABLE_TRICK && pot < VALUABLE_TRICK;
    if (worthIt && !(overpaying && losers.length > 0)) return cheapest;
  }
  return lowest(losers.length > 0 ? losers : options);
}

/* ----------------------------------------------------------- endgame solve */

/**
 * With the stock gone, both hands are known by counting, so the last tricks can
 * be played out exactly. Returns the best card for `player` by final points.
 */
function solveEndgame(state, player) {
  const best = search(state, player, -Infinity, Infinity);
  return best.card;
}

function search(state, player, alpha, beta) {
  if (state.over) return { score: scoreOf(state, player), card: null };
  const mover = state.turn;
  const options = legalPlays(state, mover);
  if (options.length === 0) return { score: scoreOf(state, player), card: null };

  const maximizing = mover === player;
  let bestScore = maximizing ? -Infinity : Infinity;
  let bestCard = options[0];

  for (const card of options) {
    const { score } = search(playAndSettle(state, mover, card.id), player, alpha, beta);
    if (maximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestCard = card;
    }
    if (maximizing) alpha = Math.max(alpha, bestScore);
    else beta = Math.min(beta, bestScore);
    if (beta <= alpha) break;
  }
  return { score: bestScore, card: bestCard };
}

/* --------------------------------------------------------------- entry point */

export function chooseCard(state, player = 'rival', difficulty = 'normal', random = Math.random) {
  const level = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  const options = legalPlays(state, player);
  if (options.length === 0) return null;
  if (options.length === 1) return options[0];

  if (level.sloppiness > 0 && random() < level.sloppiness) {
    return options[Math.floor(random() * options.length)];
  }

  // Everything left is public once the stock is empty: play it out exactly.
  if (level.solves && mustFollowSuit(state) && state.hands[opponentOf(player)].length <= HAND_SIZE) {
    return solveEndgame(state, player);
  }

  return player === state.leader ? chooseLead(state, player, level) : chooseFollow(state, player, level);
}

export { SUIT_BY_ID };
