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

/* --------------------------------------------------------- what a turn is */

/** One of each, however many points are going spare. */
export const PLAYS_PER_TURN = { card: 1, support: 1 };

/**
 * Two cards a side, and only one goes down per turn - so a full board takes
 * two turns to build and one bad trade to lose half of.
 */
export const BOARD_LIMIT = 2;

/** Whether this side may still put a strike card down this turn. */
export const canPlayCard = (side, card) =>
  side.cardsPlayedThisTurn < PLAYS_PER_TURN.card
  && side.board.length < BOARD_LIMIT
  && canAfford(card, side.points);

/** Why a card cannot go down, for the button that is greyed out. */
export function playProblem(side, card) {
  if (!card) return 'Nothing selected.';
  if (side.cardsPlayedThisTurn >= PLAYS_PER_TURN.card) return 'One card a turn.';
  if (side.board.length >= BOARD_LIMIT) return `Only ${BOARD_LIMIT} cards out at a time.`;
  if (!canAfford(card, side.points)) return `${card.name} costs ${card.cost} - you have ${side.points}.`;
  return null;
}

/** You pick what to hit, so long as it is actually there. */
export const canAttack = (target, defenderBoard) =>
  Boolean(target) && defenderBoard.some((card) => card.uid === target.uid);

/** Whether this side may still play a support this turn, on or off its turn. */
export const canUseSupport = (side, support, { isYourTurn }) =>
  side.supportsPlayedThisTurn < PLAYS_PER_TURN.support && canPlaySupport(support, { isYourTurn });

/* ---------------------------------------------------------- the graveyard */

/**
 * A card pulled back out of the graveyard comes back free. That is the whole
 * trick of the one support that does it: the card you most want back is the
 * expensive one you just lost, and it returns costing nothing.
 */
export function recall(card) {
  if (!card) return null;
  return { ...card, cost: 0, recalled: true };
}

/**
 * You lose when there is nothing left to knock out - nothing on the board,
 * nothing in hand, nothing left to draw.
 */
export const isBeaten = (side) =>
  side.board.length === 0 && side.hand.length === 0 && side.deck.length === 0;

/** 'a', 'b', or null while both still have something. */
export function loser(sides) {
  const aBeaten = isBeaten(sides.a);
  const bBeaten = isBeaten(sides.b);
  if (aBeaten && bBeaten) return 'both';
  if (aBeaten) return 'a';
  if (bBeaten) return 'b';
  return null;
}

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
