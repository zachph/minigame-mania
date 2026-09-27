import { playProblem } from './rules.js';
import { other } from './battle.js';

/**
 * The opponent.
 *
 * It does not search ahead. It values a board the way a decent player would
 * describe one out loud - kill what you can kill, do not swing into something
 * that kills you back, and spend your points rather than sitting on them - and
 * that turns out to be enough to make it read as thinking.
 */

/** What an exchange would cost both sides, without changing anything. */
export function previewSwing(attacker, target) {
  let mine = attacker.hp;
  let theirs = target.hp;
  if (attacker.speed > target.speed) {
    theirs -= attacker.power;
    if (theirs > 0) mine -= target.power;
  } else if (target.speed > attacker.speed) {
    mine -= target.power;
    if (mine > 0) theirs -= attacker.power;
  } else {
    // A tie is a coin flip, so assume the worse half of it.
    mine -= target.power;
    if (mine > 0) theirs -= attacker.power;
  }
  return { iDie: mine <= 0, theyDie: theirs <= 0, myHpAfter: mine, theirHpAfter: theirs };
}

/**
 * How good a swing is, in points. Killing something is worth what it cost;
 * dying costs what yours cost; chip damage is worth a little.
 */
export function scoreSwing(attacker, target) {
  const { iDie, theyDie, theirHpAfter } = previewSwing(attacker, target);
  let score = 0;
  if (theyDie) score += target.cost * 10 + 5;
  else score += Math.min(attacker.power, target.hp) * 0.5;
  if (iDie) score -= attacker.cost * 10;
  if (theyDie && !iDie) score += 8;                   // a clean kill is the best thing going
  if (!theyDie && theirHpAfter <= 1) score += 2;      // leaving it on its last legs is worth something
  return score;
}

/**
 * The best target for one attacker, or null if every swing is a bad idea.
 *
 * `mustAct` drops the standard: two players who will only take good trades will
 * sit across a full board from each other until the sun goes out, so once a
 * side has nothing left to draw it takes the least bad swing going rather than
 * waiting for one it likes.
 */
export function chooseTarget(attacker, enemyBoard, { mustAct = false } = {}) {
  let best = null;
  let bestScore = mustAct ? -Infinity : 0;
  for (const target of enemyBoard) {
    const score = scoreSwing(attacker, target);
    if (score > bestScore) {
      bestScore = score;
      best = target;
    }
  }
  return best;
}

/** Nothing left to draw and nothing to field: waiting cannot improve this. */
export const shouldForceIt = (side) =>
  side.deck.length === 0 && !side.hand.some((card) => card.kind === 'strike');

/** Which card to put down: the most expensive thing affordable, since points expire unused. */
export function chooseCard(side) {
  let best = -1;
  let bestCost = -1;
  side.hand.forEach((card, index) => {
    if (card.kind !== 'strike') return;
    if (playProblem(side, card) !== null) return;
    if (card.cost > bestCost) {
      bestCost = card.cost;
      best = index;
    }
  });
  return best;
}

/** Gear goes on whatever is already out and worth improving. */
export function chooseGear(side) {
  const piece = side.hand.findIndex((card) => card.kind === 'gear' && card.cost <= side.points);
  if (piece < 0 || side.board.length === 0) return null;
  // Put it on the healthiest thing out, which is the one most likely to still
  // be standing next turn to use it.
  const target = [...side.board].sort((a, b) => b.hp - a.hp)[0];
  return { handIndex: piece, targetUid: target.uid };
}

/**
 * A whole turn, as a list of actions for the caller to apply. Returning the
 * plan rather than mutating means the same function can be used to show what
 * the opponent is about to do.
 */
export function planTurn(state, which) {
  const side = state.sides[which];
  const foe = state.sides[other(which)];
  const actions = [];

  const cardIndex = chooseCard(side);
  if (cardIndex >= 0) actions.push({ kind: 'play', handIndex: cardIndex });

  const mustAct = shouldForceIt(side);
  for (const attacker of side.board) {
    if (attacker.attackedThisTurn) continue;
    const target = chooseTarget(attacker, foe.board, { mustAct });
    if (target) actions.push({ kind: 'attack', attackerUid: attacker.uid, targetUid: target.uid });
  }

  return actions;
}
