import {
  LANES,
  boardOf,
  canAttack,
  coreOf,
  endTurn,
  fightersOf,
  legalPlays,
  opponentOf,
  playCard,
} from './rules.js';

/**
 * The rival. Each difficulty runs its own build of the deck and its own
 * appetite for risk; all three share the same scoring pass, which walks every
 * legal play, takes the best one, and repeats until nothing is worth the energy.
 */
export const DIFFICULTIES = {
  easy: { id: 'easy', name: 'Easy', recipe: 'basic', deckName: 'Trainee deck', handicap: -1, sloppiness: 0.55, floor: 90, trapValue: 20, blurb: 'A Trainee deck, a turn behind you on energy, played carelessly.' },
  normal: { id: 'normal', name: 'Normal', recipe: 'core', deckName: 'Standard deck', handicap: 0, sloppiness: 0.15, floor: 25, trapValue: 55, blurb: 'The Standard twenty, played straight.' },
  hard: { id: 'hard', name: 'Hard', recipe: 'elite', deckName: 'Prototype deck', handicap: 1, sloppiness: 0, floor: 15, trapValue: 80, blurb: 'A Prototype deck, a turn ahead of you on energy, and no mistakes.' },
};

/** What one of my fighters is worth sitting in a lane. */
const fighterValue = (fighter) => fighter.damage + fighter.hp * 0.45;

function laneScore(state, side, lane, card) {
  const enemy = opponentOf(side);
  const blocker = boardOf(state, enemy)[lane];
  let score = card.damage + card.hp * 0.45;

  if (!blocker) {
    score += card.damage * 0.6;              // an open lane is a road to the core
  } else {
    if (card.damage >= blocker.hp) score += 120;   // trades up
    if (blocker.damage >= card.hp) score -= 90;    // walks into a killer
    score += Math.min(card.hp, blocker.damage) * 0.3; // and blocks that damage
  }
  return score;
}

function effectScore(state, side, play, level) {
  const { card } = play;
  const enemy = opponentOf(side);
  const effect = card.effect || {};
  const target = play.targetSide ? boardOf(state, play.targetSide)[play.lane] : null;
  let score = 0;

  if (card.kind === 'trap') return level.trapValue;

  if (effect.damage) {
    const { amount, scope } = effect.damage;
    if (scope === 'core') score += amount * (coreOf(state, enemy) <= amount ? 12 : 1.1);
    else if (scope === 'all') {
      for (const fighter of fightersOf(state, enemy)) {
        score += Math.min(amount, fighter.hp) + (amount >= fighter.hp ? 90 : 0);
      }
    } else if (target) {
      score += Math.min(amount, target.hp) + (amount >= target.hp ? 110 : 0);
    }
  }

  if (effect.buff && target) {
    const usable = canAttack(state, side, target);
    if (effect.buff.stat === 'hp') score += effect.buff.amount * 0.5;
    else score += usable ? effect.buff.amount * 0.9 : effect.buff.amount * 0.2;
  }
  if (effect.buff?.scope === 'all') {
    score = fightersOf(state, side).filter((f) => canAttack(state, side, f)).length * effect.buff.amount * 0.9;
  }
  if (effect.heal && target) score += Math.min(effect.heal.amount, target.maxHp - target.hp) * 0.7;
  if (effect.heal?.scope === 'all') {
    score = fightersOf(state, side).reduce((total, f) => total + Math.min(effect.heal.amount, f.maxHp - f.hp), 0) * 0.7;
  }
  if (effect.shield && target) score += effect.shield.amount * 0.5;
  if (effect.silence && target) score += target.damage * 0.8;
  if (effect.drain && target) score += Math.min(effect.drain.amount, target.damage) * 0.8;
  if (effect.draw) score += effect.draw.count * 70;
  if (effect.energy) score += effect.energy.amount * 45;
  if (effect.discard) score += 55;
  if (effect.coreward) score += effect.coreward.amount * 0.4;
  if (effect.haste) {
    const fresh = fightersOf(state, side).filter((f) => !canAttack(state, side, f));
    score += fresh.reduce((total, f) => total + f.damage, 0) * 0.8;
  }
  if (effect.revive) score += 120;
  if (effect.move && target) score += 40;

  return score;
}

function scorePlay(state, side, play, level) {
  if (play.card.kind === 'fighter') return laneScore(state, side, play.lane, play.card);
  return effectScore(state, side, play, level);
}

/** Plays out the rival's whole turn: cards first, then the attack step. */
export function takeTurn(state, side = 'rival', difficulty = 'normal', random = Math.random) {
  const level = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  let guard = 0;

  while (!state.over && guard < 24) {
    const plays = legalPlays(state, side);
    if (plays.length === 0) break;
    const scored = plays.map((play) => ({ play, score: scorePlay(state, side, play, level) }));
    scored.sort((a, b) => b.score - a.score);
    // A careless rival often reaches for something other than its best play.
    const best = level.sloppiness > 0 && random() < level.sloppiness
      ? scored[Math.floor(random() * scored.length)]
      : scored[0];
    if (best.score <= level.floor) break; // not worth the energy
    state = playCard(state, side, best.play);
    guard += 1;
  }

  return state.over ? state : endTurn(state, side);
}

/** How much damage this side would push through right now, for the UI hint. */
export function threatOf(state, side) {
  const enemy = opponentOf(side);
  let total = 0;
  for (let lane = 0; lane < LANES; lane += 1) {
    const fighter = boardOf(state, side)[lane];
    if (!canAttack(state, side, fighter)) continue;
    if (!boardOf(state, enemy)[lane]) total += fighter.damage + fighter.turnDamage;
  }
  return total;
}

export { fighterValue };
