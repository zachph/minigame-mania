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
export const CARD_FIELDS = ['id', 'name', 'rarity', 'cost', 'speed', 'power', 'hp'];

/* ------------------------------------------------------------- the points */

/**
 * Points are what you pay to put a card down, and there are two taps: a
 * quickening trickle each turn, and whatever a card you kill was worth.
 *
 * The second one is the interesting half. Killing something expensive hands you
 * its cost, so trading up does not just remove their card, it pays for your
 * next one - which means a board that is losing can climb back rather than
 * simply falling further behind.
 */
export const STARTING_POINTS = 5;

/** Per-turn income, widening as the game goes on. */
export const INCOME_BANDS = [
  { from: 1, to: 4, points: 1 },
  { from: 5, to: 8, points: 2 },
  { from: 9, to: Infinity, points: 3 },
];

/** What the turn's trickle is worth. */
export function incomeOnTurn(turn) {
  const band = INCOME_BANDS.find((entry) => turn >= entry.from && turn <= entry.to);
  return band ? band.points : 0;
}

/**
 * Points in hand at the start of `turn`, having killed nothing.
 *
 * Turn one is the 5 you start with and no more: income arrives from turn two
 * onwards, so "you start with 5" is true of the board you actually see first.
 */
export function pointsByTurn(turn) {
  let points = STARTING_POINTS;
  for (let t = 2; t <= turn; t += 1) points += incomeOnTurn(t);
  return points;
}

/** Whether a card is affordable right now. */
export const canAfford = (card, points) => Boolean(card) && points >= card.cost;

/** What a kill pays: exactly what the thing you killed cost to play. */
export const bountyFor = (card) => (card ? card.cost : 0);

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
