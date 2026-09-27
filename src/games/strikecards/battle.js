import { seededRandom } from '../../core/utils.js';
import {
  BOARD_LIMIT,
  PLAYS_PER_TURN,
  STARTING_POINTS,
  bountyFor,
  canPlaySupport,
  firstToAct,
  incomeOnTurn,
  playProblem,
  recall,
} from './rules.js';

/**
 * A Strike Cards match.
 *
 * Sides take turns. On yours you draw, may put one card down and play one
 * support, and then every card you have out swings at a target you choose.
 *
 * The swing is the heart of it: the two cards hurt each other, and the faster
 * one lands first. Kill it before it moves and it never hits you back - which
 * means attacking something quicker than you is a real risk, and speed is worth
 * as much as power.
 *
 * Nothing here draws anything. The whole match is a value you can step through
 * a turn at a time, which is what makes it testable and what lets an AI look
 * ahead by simply doing the same thing.
 */

export const OPENING_HAND = 5;
export const DRAW_PER_TURN = 1;

/**
 * A backstop, not a rule anybody should meet.
 *
 * Two careful players can refuse to attack forever: a full board, no swing
 * either of them likes, and nothing in the rules that makes them move. A normal
 * match is over inside 35 turns a side, so this only ever catches a match that
 * had stopped being one.
 */
export const TURN_LIMIT = 60;

let uid = 0;
const nextUid = () => (uid += 1);

/** A card in a match is the printed card plus what has happened to it. */
export function instance(card) {
  return {
    ...card,
    uid: `c${nextUid()}`,
    maxHp: card.hp,
    hp: card.hp,
    attackedThisTurn: false,
  };
}

const shuffled = (cards, random) => {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

function makeSide(deck, supports, random) {
  const shuffledDeck = shuffled(deck.map(instance), random);
  return {
    points: STARTING_POINTS,
    board: [],
    hand: shuffledDeck.slice(0, OPENING_HAND),
    deck: shuffledDeck.slice(OPENING_HAND),
    supports: shuffled([...supports], random),
    graveyard: [],
    turn: 0,
    cardsPlayedThisTurn: 0,
    supportsPlayedThisTurn: 0,
    kills: 0,
  };
}

export function createMatch({ decks, supports = { a: [], b: [] }, random = seededRandom(1), first = 'a' } = {}) {
  const state = {
    random,
    sides: {
      a: makeSide(decks.a, supports.a, random),
      b: makeSide(decks.b, supports.b, random),
    },
    active: first,
    over: false,
    winner: null,
    reason: null,
    log: [],
  };
  beginTurn(state);
  return state;
}

export const other = (side) => (side === 'a' ? 'b' : 'a');
export const activeSide = (state) => state.sides[state.active];

const say = (state, text, extra = {}) => state.log.push({ turn: activeSide(state).turn, side: state.active, text, ...extra });

/* ------------------------------------------------------------ the turn */

/** Income, a card off the top, and a fresh allowance of plays. */
export function beginTurn(state) {
  const side = state.sides[state.active];
  side.turn += 1;
  side.cardsPlayedThisTurn = 0;
  side.supportsPlayedThisTurn = 0;
  for (const card of side.board) card.attackedThisTurn = false;

  // Anything that lasted "until the turn ends" ends here, on both boards - a
  // Sidestep played on their turn should not still be helping on yours.
  for (const key of ['a', 'b']) {
    for (const card of state.sides[key].board) {
      for (const [stat, amount] of Object.entries(card.temp || {})) card[stat] -= amount;
      card.temp = {};
    }
  }

  // Turn one is the five you start with; the trickle begins on turn two.
  if (side.turn > 1) {
    const income = incomeOnTurn(side.turn);
    side.points += income;
    say(state, `+${income} points`, { kind: 'income', points: side.points });
  }

  for (let i = 0; i < DRAW_PER_TURN; i += 1) draw(state, state.active);
}

export function draw(state, which) {
  const side = state.sides[which];
  if (side.deck.length === 0) return null;
  const card = side.deck.shift();
  side.hand.push(card);
  return card;
}

export function endTurn(state) {
  if (state.over) return state;
  state.active = other(state.active);
  beginTurn(state);
  checkOver(state);
  return state;
}

/** Most kills takes it, then most cards still standing; level on both is a draw. */
function callIt(state) {
  const score = (side) => [side.kills, side.board.length + side.hand.length + side.deck.length];
  const [aKills, aLeft] = score(state.sides.a);
  const [bKills, bLeft] = score(state.sides.b);
  state.over = true;
  state.reason = 'nobody would commit';
  if (aKills !== bKills) state.winner = aKills > bKills ? 'a' : 'b';
  else if (aLeft !== bLeft) state.winner = aLeft > bLeft ? 'a' : 'b';
  else state.winner = null;
  return state;
}

/* ---------------------------------------------------------- the actions */

/** Puts a card from hand onto the board, if the turn and the points allow. */
export function playCard(state, handIndex) {
  const side = activeSide(state);
  const card = side.hand[handIndex];
  const problem = playProblem(side, card);
  if (problem) return { error: problem };

  side.hand.splice(handIndex, 1);
  side.board.push(card);
  side.points -= card.cost;
  side.cardsPlayedThisTurn += 1;
  say(state, `${card.name} takes the field (${card.cost} points)`, { kind: 'play', uid: card.uid });
  return { card };
}

/**
 * Plays a piece of gear onto one of your own cards.
 *
 * Gear is spent, not worn: it costs its points, the boost goes into the card
 * for good, and the gear itself goes to the graveyard. The card is not holding
 * anything afterwards, which is why a second piece can go on the same card
 * later and stack on top of the first.
 */
export function playGear(state, handIndex, targetUid) {
  const side = activeSide(state);
  const piece = side.hand[handIndex];
  if (!piece || piece.kind !== 'gear') return { error: 'That is not gear.' };
  if (side.points < piece.cost) return { error: `${piece.name} costs ${piece.cost} - you have ${side.points}.` };

  const target = side.board.find((card) => card.uid === targetUid);
  if (!target) return { error: 'Put it on one of your own cards.' };

  side.hand.splice(handIndex, 1);
  side.points -= piece.cost;
  side.graveyard.push(piece);

  const gained = [];
  for (const [stat, amount] of Object.entries(piece.boost || {})) {
    target[stat] = (target[stat] || 0) + amount;
    if (stat === 'hp') target.maxHp += amount;
    gained.push(`${amount > 0 ? '+' : ''}${amount} ${stat}`);
  }
  target.boosts = (target.boosts || 0) + 1;

  say(state, `${piece.name} on ${target.name} (${gained.join(', ')})`, { kind: 'gear', uid: target.uid });
  return { gear: piece, target };
}

/** Plays a support. `which` may be the side that is not active, for an instant. */
export function playSupport(state, which, supportIndex, apply) {
  const side = state.sides[which];
  const support = side.supports[supportIndex];
  const isYourTurn = state.active === which;

  if (!support) return { error: 'No such support.' };
  if (side.supportsPlayedThisTurn >= PLAYS_PER_TURN.support) return { error: 'One support a turn.' };
  if (!canPlaySupport(support, { isYourTurn })) return { error: `${support.name} can only be played on your turn.` };

  side.supports.splice(supportIndex, 1);
  side.supportsPlayedThisTurn += 1;
  say(state, `${support.name}`, { kind: 'support', side: which });
  if (apply) apply(state, which, support);
  return { support };
}

/** The support that pulls a card back out of the graveyard, free. */
export function recallFromGraveyard(state, which, graveIndex) {
  const side = state.sides[which];
  const card = side.graveyard[graveIndex];
  if (!card) return { error: 'Nothing there to bring back.' };
  side.graveyard.splice(graveIndex, 1);
  const back = instance(recall(card));
  side.hand.push(back);
  say(state, `${back.name} claws its way back, and it comes free`, { kind: 'recall', uid: back.uid });
  return { card: back };
}

/* ----------------------------------------------------------- the swing */

/**
 * One card swings at another. Both hurt each other; the faster goes first, and
 * a card killed before it moves never gets its blow in.
 */
export function attack(state, attackerUid, targetUid) {
  const side = activeSide(state);
  const foe = state.sides[other(state.active)];
  const attacker = side.board.find((card) => card.uid === attackerUid);
  const target = foe.board.find((card) => card.uid === targetUid);

  if (!attacker) return { error: 'That card is not on your board.' };
  if (attacker.attackedThisTurn) return { error: `${attacker.name} has already swung this turn.` };
  if (!target) return { error: 'Nothing there to hit.' };

  attacker.attackedThisTurn = true;
  const first = firstToAct(attacker, target, state.random) === 'a' ? attacker : target;
  const second = first === attacker ? target : attacker;
  say(state, `${attacker.name} goes for ${target.name} - ${first.name} is faster`, { kind: 'attack' });

  const hit = (from, to) => {
    to.hp -= from.power;
    say(state, `${from.name} hits ${to.name} for ${from.power}`, { kind: 'damage', uid: to.uid, hp: Math.max(0, to.hp) });
  };

  hit(first, second);
  if (second.hp > 0) hit(second, first);
  else say(state, `${second.name} never got its blow in`, { kind: 'text' });

  for (const card of [attacker, target]) reap(state, card);

  checkOver(state);
  return { attacker, target };
}

/**
 * Moves a card that has run out of health off the board and pays whoever put it
 * there. Everything that can kill goes through here, so a support bolt pays a
 * bounty exactly as a swing does.
 */
export function reap(state, card) {
  if (!card || card.hp > 0) return false;
  const ownerKey = state.sides.a.board.some((entry) => entry.uid === card.uid) ? 'a' : 'b';
  if (!state.sides[ownerKey].board.some((entry) => entry.uid === card.uid)) return false;

  const owner = state.sides[ownerKey];
  const killer = state.sides[other(ownerKey)];
  owner.board = owner.board.filter((entry) => entry.uid !== card.uid);
  owner.graveyard.push(card);
  killer.points += bountyFor(card);
  killer.kills += 1;
  say(state, `${card.name} falls - ${bountyFor(card)} points for it`, { kind: 'faint', uid: card.uid });
  return true;
}

/* ---------------------------------------------------- what a support does */

const findCard = (state, uid) =>
  state.sides.a.board.find((c) => c.uid === uid) || state.sides.b.board.find((c) => c.uid === uid) || null;

const ownerOf = (state, card) => (state.sides.a.board.some((c) => c.uid === card.uid) ? 'a' : 'b');

/**
 * Runs a support's effect. `target` is a card uid, or an index into the
 * graveyard for the one that brings something back.
 */
export function applySupport(state, which, support, target) {
  const effect = support.effect;
  if (!effect) return { error: `${support.name} does nothing.` };

  if (effect.kind === 'recall') return recallFromGraveyard(state, which, target ?? 0);

  const card = findCard(state, target);
  if (!card) return { error: 'Nothing there to aim it at.' };
  const side = ownerOf(state, card);
  if (effect.target === 'friendly' && side !== which) return { error: `${support.name} is for your own cards.` };
  if (effect.target === 'enemy' && side === which) return { error: `${support.name} is for theirs.` };

  if (effect.kind === 'heal') {
    const healed = Math.min(effect.amount, card.maxHp - card.hp);
    card.hp += healed;
    say(state, `${card.name} patched up for ${healed}`, { kind: 'heal', uid: card.uid, hp: card.hp });
    return { healed };
  }

  if (effect.kind === 'damage') {
    card.hp -= effect.amount;
    say(state, `${card.name} takes ${effect.amount}`, { kind: 'damage', uid: card.uid, hp: Math.max(0, card.hp) });
    reap(state, card);
    checkOver(state);
    return { damage: effect.amount };
  }

  if (effect.kind === 'buff') {
    card[effect.stat] += effect.amount;
    if (effect.stat === 'hp') card.maxHp += effect.amount;
    if (effect.lasts === 'turn') {
      card.temp = card.temp || {};
      card.temp[effect.stat] = (card.temp[effect.stat] || 0) + effect.amount;
    }
    say(state, `${card.name} takes +${effect.amount} ${effect.stat}${effect.lasts === 'turn' ? ' for the turn' : ''}`, { kind: 'buff', uid: card.uid });
    return { buffed: effect.stat };
  }

  return { error: `${support.name} does nothing the battle knows about.` };
}

/* -------------------------------------------------------------- the end */

/**
 * Beaten means you have nothing left that can fight: nothing on the board, and
 * no striker in hand or deck to put there.
 *
 * Gear does not count. A hand of Swords with an empty board and an empty deck
 * is not a defence - it is a player who can never act again, and before this
 * checked for strikers rather than cards, such a match ran forever with neither
 * side able to end it.
 */
const canFight = (card) => card.kind !== 'gear';

const canStillFight = (side) =>
  side.board.length > 0 || side.hand.some(canFight) || side.deck.some(canFight);

export const isBeaten = (side) => !canStillFight(side);

export function checkOver(state) {
  if (state.over) return state;
  const aBeaten = isBeaten(state.sides.a);
  const bBeaten = isBeaten(state.sides.b);
  if (!aBeaten && !bBeaten) {
    if (state.sides.a.turn > TURN_LIMIT || state.sides.b.turn > TURN_LIMIT) return callIt(state);
    return state;
  }

  state.over = true;
  state.winner = aBeaten && bBeaten ? null : aBeaten ? 'b' : 'a';
  state.reason = state.winner ? 'every card knocked out' : 'both sides wiped out';
  return state;
}
