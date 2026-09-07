import { DECK_SIZE, SUIT_BY_ID, TOTAL_POINTS, createDeck, shuffle, trickWinner, trickValue } from './cards.js';

/**
 * Shubat rules. Pure logic - no canvas, no DOM; every shuffle comes from the
 * injected random source so a match can be replayed.
 *
 * A deal is thirty-two cards. Both players hold five; one card is turned up to
 * set the trump herd and sits at the bottom of the stock as the last card
 * anyone will draw. Winner of a trick leads the next and draws first.
 *
 * Leading the first trick is worth about six points over a deal, so a match is
 * two deals - each side leads one - and the totals decide it.
 *
 * While the stock lasts you may play anything - that is what keeps it quick.
 * Once the stock is empty you must follow the led suit if you can, which is
 * what makes the last five tricks a real endgame.
 */

export const HAND_SIZE = 5;
export const PLAYERS = ['you', 'rival'];
export const opponentOf = (player) => (player === 'you' ? 'rival' : 'you');

export const DEALS_PER_MATCH = 2;

export function createDeal({ random = Math.random, leader = 'you' } = {}) {
  const deck = shuffle(createDeck(), random);
  const hands = {
    you: deck.slice(0, HAND_SIZE),
    rival: deck.slice(HAND_SIZE, HAND_SIZE * 2),
  };
  const rest = deck.slice(HAND_SIZE * 2);
  const trumpCard = rest[rest.length - 1]; // the last card anyone draws

  return {
    hands,
    stock: rest,                  // drawn from the front; the trump card is last
    trumpCard,
    trumpSuit: trumpCard.suit,
    leader,
    turn: leader,
    table: { you: null, rival: null },
    pendingTrick: null,           // a completed trick waiting to be swept up
    won: { you: [], rival: [] },  // cards each player has collected
    tricks: [],
    trickNumber: 1,
    over: false,
    winner: null,
    reason: null,
  };
}

export const scoreOf = (state, player) => state.won[player].reduce((total, card) => total + card.points, 0);
export const stockLeft = (state) => state.stock.length;
export const mustFollowSuit = (state) => state.stock.length === 0;

/** The cards `player` may legally play right now. */
export function legalPlays(state, player) {
  if (state.over || state.pendingTrick || state.turn !== player) return [];
  const hand = state.hands[player];
  const led = state.table[state.leader];
  if (!led || player === state.leader) return hand.slice();
  if (!mustFollowSuit(state)) return hand.slice();
  const following = hand.filter((card) => card.suit === led.suit);
  return following.length > 0 ? following : hand.slice();
}

export function isLegalPlay(state, player, cardId) {
  return legalPlays(state, player).some((card) => card.id === cardId);
}

/**
 * Plays one card. When it completes a trick the trick is resolved, both players
 * draw, and the lead passes to the winner.
 */
export function playCard(state, player, cardId) {
  if (state.over) throw new Error('The match is over');
  if (state.pendingTrick) throw new Error('The trick on the table has not been settled');
  if (state.turn !== player) throw new Error(`It is ${state.turn}'s turn`);
  if (!isLegalPlay(state, player, cardId)) throw new Error(`${player} cannot play ${cardId}`);

  const hand = state.hands[player];
  const card = hand.find((entry) => entry.id === cardId);
  const next = {
    ...state,
    hands: { ...state.hands, [player]: hand.filter((entry) => entry.id !== cardId) },
    table: { ...state.table, [player]: card },
  };

  if (player === state.leader) {
    next.turn = opponentOf(state.leader);
    return next;
  }

  // Both cards are down. Work out who took it, but leave the cards on the table
  // and nobody to move until the trick is settled.
  const leader = state.leader;
  const follower = player;
  const led = next.table[leader];
  const followed = next.table[follower];
  const winner = trickWinner(led, followed, state.trumpSuit) === 'leader' ? leader : follower;
  next.turn = null;
  next.pendingTrick = {
    number: state.trickNumber,
    leader,
    winner,
    value: trickValue(led, followed),
    cards: { [leader]: led, [follower]: followed },
  };
  return next;
}

/** Sweeps a completed trick to its winner, draws for both, and passes the lead. */
export function settleTrick(state) {
  const trick = state.pendingTrick;
  if (!trick) return state;
  const winner = trick.winner;
  const loser = opponentOf(winner);
  const led = trick.cards[trick.leader];
  const followed = trick.cards[opponentOf(trick.leader)];

  // The winner draws first, so the last card of the stock - the trump - goes to
  // whoever lost the final draw.
  const stock = state.stock.slice();
  const hands = { ...state.hands };
  for (const player of [winner, loser]) {
    if (stock.length === 0) break;
    hands[player] = [...hands[player], stock.shift()];
  }

  const next = {
    ...state,
    hands,
    stock,
    won: { ...state.won, [winner]: [...state.won[winner], led, followed] },
    table: { you: null, rival: null },
    pendingTrick: null,
    tricks: [...state.tricks, trick],
    trickNumber: state.trickNumber + 1,
    leader: winner,
    turn: winner,
  };

  if (next.hands.you.length === 0 && next.hands.rival.length === 0) return finish(next);
  return next;
}

/** Play a card and sweep the trick if it completed one - for search and tests. */
export function playAndSettle(state, player, cardId) {
  const next = playCard(state, player, cardId);
  return next.pendingTrick ? settleTrick(next) : next;
}

function finish(state) {
  const you = scoreOf(state, 'you');
  const rival = scoreOf(state, 'rival');
  return {
    ...state,
    over: true,
    winner: you === rival ? null : you > rival ? 'you' : 'rival',
    reason: you === rival ? `dead level at ${you} each` : `${Math.max(you, rival)} to ${Math.min(you, rival)}`,
  };
}

/** Cards nobody can hold any more: played, collected, or the face-up trump. */
export function seenCards(state, viewer) {
  const seen = new Set();
  for (const trick of state.tricks) {
    for (const card of Object.values(trick.cards)) seen.add(card.id);
  }
  for (const card of Object.values(state.table)) if (card) seen.add(card.id);
  if (state.pendingTrick) for (const card of Object.values(state.pendingTrick.cards)) seen.add(card.id);
  for (const card of state.hands[viewer]) seen.add(card.id);
  if (state.stock.length > 0) seen.add(state.trumpCard.id);
  return seen;
}

/** Cards that could still be in the opponent's hand or the stock. */
export function unseenCards(state, viewer) {
  const seen = seenCards(state, viewer);
  return createDeck().filter((card) => !seen.has(card.id));
}

export function describeTrick(trick) {
  const cards = Object.entries(trick.cards)
    .map(([player, card]) => `${player === 'you' ? 'You' : 'Rival'} ${card.rank}${SUIT_BY_ID.get(card.suit).name[0]}`)
    .join(' v ');
  return `${cards} - ${trick.winner === 'you' ? 'you take' : 'rival takes'} ${trick.value}`;
}

export { DECK_SIZE, TOTAL_POINTS };
