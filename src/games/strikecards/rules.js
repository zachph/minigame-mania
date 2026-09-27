/**
 * Strike Cards: what a card is, and who goes first.
 *
 * A strike card is speed, power and hp. Speed decides everything about
 * sequencing - who swings first, and whose support lands first when both
 * players reach for one at the same moment - so the comparison lives here on
 * its own, where it can be tested without a battle around it.
 */

/** How many support cards exist, and how many of those can be played off-turn. */
export const SUPPORT_COUNT = 15;
export const INSTANT_SUPPORT_COUNT = 5;

/** The shape every strike card fills in. */
export const CARD_FIELDS = ['id', 'name', 'rarity', 'speed', 'power', 'hp'];

/** A support is either played on your own turn, or the moment you need it. */
export const SUPPORT_TIMING = {
  turn: { id: 'turn', name: 'On your turn', blurb: 'Played on your own turn, like anything else.' },
  instant: { id: 'instant', name: 'Any time', blurb: 'Can be played even when it is not your turn.' },
};

/**
 * Which of two cards acts first. Faster wins; level on speed, the coin decides,
 * because a tie that always broke the same way would make one seat better than
 * the other before a card was played.
 *
 * Returns 'a', or 'b'.
 */
export function firstToAct(a, b, random = Math.random) {
  if (!a) return 'b';
  if (!b) return 'a';
  if (a.speed !== b.speed) return a.speed > b.speed ? 'a' : 'b';
  return random() < 0.5 ? 'a' : 'b';
}

/**
 * The order two sides resolve in this turn: the faster card swings first, and
 * the same order decides whose support lands first when both play one.
 */
export function turnOrder(cards, random = Math.random) {
  const first = firstToAct(cards.a, cards.b, random);
  return first === 'a' ? ['a', 'b'] : ['b', 'a'];
}

/** Whether a support may be played right now. */
export function canPlaySupport(support, { isYourTurn }) {
  if (!support) return false;
  if (isYourTurn) return true;
  return support.timing === 'instant';
}

/** The instants in a list - the five that break the turn order. */
export const instantsIn = (supports) => supports.filter((support) => support.timing === 'instant');
