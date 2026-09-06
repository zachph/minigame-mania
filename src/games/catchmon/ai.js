import { ROSTER, TEAM_SIZE } from './roster.js';
import { effectiveness } from './types.js';
import { getMove } from './moves.js';
import { STATUSES, effectiveStat, previewDamage } from './battle.js';

/**
 * The rival trainer. Drafts a team that answers yours, then plays a
 * score-the-options turn: finish a foe if it can, heal or buff when it is safe,
 * and switch out of a matchup it is losing badly.
 */

/**
 * Drafts the rival team before the player picks, with one fighter per type and
 * no repeated role, so the player can counter-pick what they can see.
 */
export function draftTeam(rng = Math.random) {
  const picked = [];
  const usedTypes = new Set();
  const usedRoles = new Set();
  while (picked.length < TEAM_SIZE) {
    const pool = ROSTER.filter(
      (character) =>
        !usedTypes.has(character.type) &&
        !usedRoles.has(character.role) &&
        !picked.includes(character)
    );
    const choices = pool.length ? pool : ROSTER.filter((character) => !picked.includes(character));
    const pick = choices[Math.floor(rng() * choices.length)];
    picked.push(pick);
    usedTypes.add(pick.type);
    usedRoles.add(pick.role);
  }
  return picked;
}

/** A random legal team, used for the "surprise me" button. */
export function randomTeam(rng = Math.random, exclude = []) {
  const banned = new Set(exclude);
  const picked = [];
  while (picked.length < TEAM_SIZE) {
    const pool = ROSTER.filter((character) => !banned.has(character.id));
    const pick = pool[Math.floor(rng() * pool.length)];
    picked.push(pick);
    banned.add(pick.id);
  }
  return picked;
}

function scoreMove(battle, side, moveId) {
  const attacker = battle.activeOf(side);
  const defender = battle.activeOf(battle.foeSide(side));
  const move = getMove(moveId);
  const hpRatio = attacker.hp / attacker.maxHp;

  if (move.power > 0) {
    const damage = previewDamage(attacker, defender, move);
    let score = (damage / defender.maxHp) * 100;
    if (damage >= defender.hp) score += 90; // take the knockout
    return score;
  }

  const effect = move.effect || {};
  let score = 0;
  if (effect.heal) {
    const missing = 1 - hpRatio;
    score = missing > 0.45 ? 55 + missing * 40 : missing * 25;
    if (effect.cure && attacker.status) score += 15;
  }
  if (effect.shield) {
    score = 18 + (hpRatio < 0.35 ? 22 : 0);
  }
  if (effect.stat) {
    const target = effect.target === 'self' ? attacker : defender;
    const room = effect.stages > 0 ? 3 - target.stages[effect.stat] : 3 + target.stages[effect.stat];
    score = room <= 0 ? 0 : 26 + room * 5;
    if (hpRatio < 0.35) score *= 0.5; // no time for setup
  }
  if (effect.status) {
    const status = STATUSES[effect.status];
    score = defender.status?.id === effect.status ? 0 : 34;
    if (status.blocksSwitch && battle.benchOf(battle.foeSide(side)).length === 0) score = 8;
  }
  return score;
}

function switchScore(battle, side, index) {
  const current = battle.activeOf(side);
  const foe = battle.activeOf(battle.foeSide(side));
  const candidate = battle.teams[side][index];
  const currentMatchup = effectiveness(foe.character.type, current.character.type);
  const candidateMatchup = effectiveness(foe.character.type, candidate.character.type);
  const offense = effectiveness(candidate.character.type, foe.character.type);

  let score = 0;
  if (currentMatchup > 1) score += 26;           // currently being walloped
  if (candidateMatchup < 1) score += 22;         // the bench answers it
  if (offense > 1) score += 18;
  if (current.hp / current.maxHp < 0.25) score += 14;
  score *= candidate.hp / candidate.maxHp;       // do not send in a near-dead fighter
  if (effectiveStat(current, 'spd') < effectiveStat(foe, 'spd')) score -= 8; // eating a free hit
  return score;
}

/** Chooses the rival's action for the turn. */
export function chooseAction(battle, side = 'enemy', rng = Math.random) {
  const options = battle.availableActions(side).map((action) => {
    const score =
      action.kind === 'move'
        ? scoreMove(battle, side, action.moveId)
        : switchScore(battle, side, action.index);
    return { action, score: score + rng() * 6 }; // a little noise so it is not perfectly predictable
  });
  options.sort((a, b) => b.score - a.score);
  return options[0].action;
}

/** Chooses a replacement after a knockout. */
export function chooseReplacement(battle, side = 'enemy') {
  const foe = battle.activeOf(battle.foeSide(side));
  let best = null;
  let bestScore = -Infinity;
  for (const [index, fighter] of battle.teams[side].entries()) {
    if (fighter.fainted) continue;
    const defense = effectiveness(foe.character.type, fighter.character.type);
    const offense = effectiveness(fighter.character.type, foe.character.type);
    const score = (offense - defense) * 40 + (fighter.hp / fighter.maxHp) * 30;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}
