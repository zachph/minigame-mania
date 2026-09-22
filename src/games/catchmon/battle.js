import { abilityOf, effectiveness, effectivenessLabel } from './types.js';
import { getMove } from './moves.js';

/**
 * The battle engine. Pure logic: no canvas, no DOM, and every random roll goes
 * through the injected `rng`, so a battle can be replayed exactly in tests.
 *
 * A turn is: both sides commit an action, `resolveTurn()` applies them in
 * order and returns a list of events for the presentation layer to play back.
 */

export const SIDES = ['player', 'enemy'];
export const MAX_STAGE = 3;
export const STAGE_STEP = 1.25;

export const STATUSES = {
  burn: { id: 'burn', name: 'Burn', short: 'BRN', turns: 3, dot: 0.06, atkScale: 0.85,
    onApply: 'is scorched!', tick: 'is burning.' },
  chill: { id: 'chill', name: 'Chill', short: 'CHL', turns: 3, spdScale: 0.5,
    onApply: 'is chilled to the bone!', tick: null },
  stun: { id: 'stun', name: 'Stun', short: 'STN', turns: 2, skipChance: 0.3,
    onApply: 'is stunned!', tick: null },
  root: { id: 'root', name: 'Root', short: 'RTD', turns: 3, blocksSwitch: true,
    onApply: 'is rooted in place!', tick: null },
};

const SWITCH_PRIORITY = 6;
const CRIT_CHANCE = 0.06;
const CRIT_MULTIPLIER = 1.6;
const STAB = 1.25;

export function createFighter(character, side, slot) {
  return {
    uid: `${side}-${slot}`,
    side,
    slot,
    character,
    maxHp: character.stats.hp,
    hp: character.stats.hp,
    stages: { atk: 0, def: 0, spd: 0 },
    status: null,
    cooldowns: {},
    usesLeft: Object.fromEntries(
      character.moves.map((moveId) => [moveId, getMove(moveId).uses ?? Infinity])
    ),
    shielded: false,
    fainted: false,
    kos: 0,
  };
}

export function stageMultiplier(stage) {
  return STAGE_STEP ** Math.max(-MAX_STAGE, Math.min(MAX_STAGE, stage));
}

export function effectiveStat(fighter, stat) {
  let value = fighter.character.stats[stat] * stageMultiplier(fighter.stages[stat]);
  const status = fighter.status && STATUSES[fighter.status.id];
  if (status) {
    if (stat === 'atk' && status.atkScale) value *= status.atkScale;
    if (stat === 'spd' && status.spdScale) value *= status.spdScale;
  }
  return value;
}

/**
 * Damage for one hit. `roll` and `critRoll` are supplied so the same function
 * can produce an average-case preview for the AI (`previewDamage`).
 */
export function computeDamage(attacker, defender, move, { variance = 1, crit = false } = {}) {
  const atk = effectiveStat(attacker, 'atk');
  const def = effectiveStat(defender, 'def');
  const typeMult = move.type ? effectiveness(move.type, defender.character.type) : 1;
  const stab = move.type && move.type === attacker.character.type ? STAB : 1;
  const critMult = crit ? CRIT_MULTIPLIER : 1;
  const raw = (move.power * (atk / (def + 55)) * 1.15 + 2) * typeMult * stab * critMult * variance;
  return { damage: Math.max(1, Math.round(raw)), typeMult, crit };
}

/** Average damage a move would deal right now - used by the AI, never for real hits. */
export function previewDamage(attacker, defender, move) {
  if (move.power <= 0) return 0;
  const hits = move.hits ? (move.hits[0] + move.hits[1]) / 2 : 1;
  const accuracy = move.accuracy / 100;
  return computeDamage(attacker, defender, move, { variance: 0.975 }).damage * hits * accuracy;
}

export class Battle {
  constructor({ playerTeam, enemyTeam, rng = Math.random, turnLimit = 40 }) {
    this.rng = rng;
    this.turnLimit = turnLimit;
    this.teams = {
      player: playerTeam.map((character, slot) => createFighter(character, 'player', slot)),
      enemy: enemyTeam.map((character, slot) => createFighter(character, 'enemy', slot)),
    };
    this.active = { player: 0, enemy: 0 };
    this.actions = { player: null, enemy: null };
    this.pendingSwitch = { player: false, enemy: false };
    this.turn = 1;
    this.over = false;
    this.winner = null;
  }

  /* ------------------------------------------------------------- queries */

  activeOf(side) {
    return this.teams[side][this.active[side]];
  }

  benchOf(side) {
    return this.teams[side].filter((fighter, index) => index !== this.active[side] && !fighter.fainted);
  }

  foeSide(side) {
    return side === 'player' ? 'enemy' : 'player';
  }

  /** Moves plus whether each is usable this turn. */
  moveOptions(side) {
    const fighter = this.activeOf(side);
    return fighter.character.moves.map((moveId) => {
      const move = getMove(moveId);
      const cooldown = fighter.cooldowns[moveId] || 0;
      const usesLeft = fighter.usesLeft[moveId];
      return {
        move,
        cooldown,
        usesLeft,
        limited: Number.isFinite(usesLeft),
        ready: cooldown === 0 && usesLeft > 0,
      };
    });
  }

  canSwitch(side) {
    const fighter = this.activeOf(side);
    const status = fighter.status && STATUSES[fighter.status.id];
    if (status?.blocksSwitch && !fighter.fainted) return false;
    return this.benchOf(side).length > 0;
  }

  /** Every legal action for a side this turn. */
  availableActions(side) {
    const actions = this.moveOptions(side)
      .filter((option) => option.ready)
      .map((option) => ({ kind: 'move', moveId: option.move.id }));
    if (this.canSwitch(side)) {
      for (const [index, fighter] of this.teams[side].entries()) {
        if (index !== this.active[side] && !fighter.fainted) actions.push({ kind: 'switch', index });
      }
    }
    // A fighter with everything on cooldown can always fall back on struggling on.
    return actions.length ? actions : [{ kind: 'move', moveId: this.moveOptions(side)[0].move.id }];
  }

  setAction(side, action) {
    this.actions[side] = action;
  }

  ready() {
    return Boolean(this.actions.player && this.actions.enemy);
  }

  /* ------------------------------------------------------------ resolving */

  /** Applies both committed actions and returns the events to play back. */
  resolveTurn() {
    if (this.over) return [];
    if (!this.ready()) throw new Error('Both sides must choose an action first');

    const events = [];
    const order = this._turnOrder();
    for (const side of order) {
      if (this.over) break;
      const fighter = this.activeOf(side);
      if (fighter.fainted) continue;
      const action = this.actions[side];
      if (action.kind === 'switch') this._performSwitch(side, action.index, events);
      else this._performMove(side, action.moveId, events);
      this._checkFaints(events);
    }

    if (!this.over) this._endOfTurn(events);
    this.actions = { player: null, enemy: null };
    if (!this.over && this.turn >= this.turnLimit) this._callTheMatch(events);
    if (!this.over) this.turn += 1;
    return events;
  }

  _turnOrder() {
    const score = (side) => {
      const action = this.actions[side];
      if (action.kind === 'switch') return SWITCH_PRIORITY;
      return getMove(action.moveId).priority;
    };
    const playerPriority = score('player');
    const enemyPriority = score('enemy');
    if (playerPriority !== enemyPriority) return playerPriority > enemyPriority ? ['player', 'enemy'] : ['enemy', 'player'];
    const playerSpeed = effectiveStat(this.activeOf('player'), 'spd');
    const enemySpeed = effectiveStat(this.activeOf('enemy'), 'spd');
    if (playerSpeed !== enemySpeed) return playerSpeed > enemySpeed ? ['player', 'enemy'] : ['enemy', 'player'];
    return this.rng() < 0.5 ? ['player', 'enemy'] : ['enemy', 'player'];
  }

  _performSwitch(side, index, events) {
    const leaving = this.activeOf(side);
    const entering = this.teams[side][index];
    if (!entering || entering.fainted || index === this.active[side]) return;
    leaving.stages = { atk: 0, def: 0, spd: 0 };
    leaving.shielded = false;
    this.active[side] = index;
    events.push({
      kind: 'switch',
      side,
      slot: index,
      from: leaving.character.name,
      text: `${side === 'player' ? 'Go' : 'The rival sends out'} ${entering.character.name}!`,
    });
  }

  _performMove(side, moveId, events) {
    const attacker = this.activeOf(side);
    const foeSide = this.foeSide(side);
    const defender = this.activeOf(foeSide);
    const move = getMove(moveId);

    const status = attacker.status && STATUSES[attacker.status.id];
    if (status?.skipChance && this.rng() < status.skipChance) {
      events.push({
        kind: 'blocked',
        side,
        text: `${attacker.character.name} is stunned and can't move!`,
      });
      return;
    }

    if (move.cooldown > 0) attacker.cooldowns[move.id] = move.cooldown + 1; // ticked down this same turn
    if (Number.isFinite(attacker.usesLeft[move.id])) attacker.usesLeft[move.id] -= 1;
    events.push({ kind: 'move', side, moveId: move.id, text: `${attacker.character.name} used ${move.name}!` });

    if (this.rng() * 100 >= move.accuracy) {
      events.push({ kind: 'miss', side, text: `It missed!` });
      return;
    }

    // Slipstream: a Wind fighter can duck anything on its turns, however
    // accurate the move was.
    if (move.power > 0 && this._dodges(defender)) {
      events.push({
        kind: 'miss',
        side: foeSide,
        text: `${defender.character.name} slipped out of the way!`,
      });
      return;
    }

    if (move.power > 0) {
      if (defender.shielded) {
        events.push({ kind: 'blocked', side: foeSide, text: `${defender.character.name} blocked it!` });
        return;
      }
      const hitCount = move.hits ? this._randomInt(move.hits[0], move.hits[1]) : 1;
      // Rolled once for the whole attack, so a volley is not three rolls at it.
      const abilityMult = this._attackMultiplier(attacker, events);
      let total = 0;
      let typeMult = 1;
      for (let hit = 0; hit < hitCount && !defender.fainted; hit += 1) {
        const crit = this.rng() < CRIT_CHANCE;
        const variance = 0.9 + this.rng() * 0.15;
        const result = computeDamage(attacker, defender, move, { variance, crit });
        typeMult = result.typeMult;
        const dealt = abilityMult === 1 ? result.damage : Math.max(1, Math.round(result.damage * abilityMult));
        total += this._damage(defender, dealt, events, { crit: result.crit, source: side });
      }
      if (hitCount > 1) events.push({ kind: 'text', text: `Hit ${hitCount} times!` });
      const label = effectivenessLabel(typeMult);
      if (label) events.push({ kind: 'text', text: label, typeMult });
      if (move.effect?.drain && total > 0) {
        this._heal(attacker, Math.round(total * move.effect.drain), events, `${attacker.character.name} drained health!`);
      }
      if (total > 0) {
        this._typeAbilityOnHit(attacker, defender, total, events);
        this._backlash(attacker, defender, total, events);
      }
      if (move.effect?.recoil && total > 0) {
        this._damage(attacker, Math.round(total * move.effect.recoil), events, { recoil: true });
      }
    }

    this._applyEffect(move, attacker, defender, events);
  }

  /**
   * Whether this fighter's type lets it dodge right now.
   *
   * Wind's Slipstream comes round every second turn rather than every turn, so
   * it is something to play around instead of a flat accuracy tax.
   */
  _dodges(defender) {
    const ability = abilityOf(defender.character.type);
    if (!ability || ability.kind !== 'dodge' || defender.fainted) return false;
    if (ability.everyTurns && this.turn % ability.everyTurns !== 0) return false;
    return this.rng() * 100 < ability.chance;
  }

  /**
   * How much harder this fighter's type makes it hit right now.
   *
   * Dark's Ambush is a roll; Water's Undertow is not, it just reads how much
   * health is already gone. Both land before the damage does, which is why they
   * sit here rather than with the after-the-hit abilities below.
   */
  _attackMultiplier(attacker, events) {
    const ability = abilityOf(attacker.character.type);
    if (!ability) return 1;

    if (ability.kind === 'surge') {
      if (this.rng() * 100 >= ability.chance) return 1;
      events.push({
        kind: 'ability',
        side: attacker.side,
        ability: ability.name,
        text: `${attacker.character.name} struck from the dark!`,
      });
      return ability.multiplier;
    }

    if (ability.kind === 'ramp') {
      const lost = 1 - attacker.hp / attacker.maxHp;
      // 1 - 800/1000 is 0.19999999999999996, which would floor to no step at all.
      const steps = Math.floor(lost / ability.perLost + 1e-9);
      if (steps <= 0) return 1;
      const multiplier = 1 + steps * ability.gain;
      events.push({
        kind: 'ability',
        side: attacker.side,
        ability: ability.name,
        text: `${attacker.character.name} is running deep - ${multiplier.toFixed(1)}x!`,
      });
      return multiplier;
    }

    return 1;
  }

  /**
   * Rock's Backlash. This one belongs to whoever was hit: a share of the damage
   * goes straight back into the attacker, the way a recoil move works.
   */
  _backlash(attacker, defender, dealt, events) {
    const ability = abilityOf(defender.character.type);
    if (!ability || ability.kind !== 'thorns' || attacker.fainted) return;
    if (this.rng() * 100 >= ability.chance) return;
    const back = Math.max(1, Math.round(dealt * ability.share));
    events.push({
      kind: 'ability',
      side: defender.side,
      ability: ability.name,
      text: `${defender.character.name}'s ${ability.name}!`,
    });
    this._damage(attacker, back, events, { recoil: true });
  }

  /** Fire's Kindle and Grass's Rootfeed, both rolled after a hit lands. */
  _typeAbilityOnHit(attacker, defender, dealt, events) {
    const ability = abilityOf(attacker.character.type);
    if (!ability) return;
    if (this.rng() * 100 >= ability.chance) return;

    if (ability.kind === 'burn' && !defender.fainted && !defender.status) {
      events.push({ kind: 'ability', side: attacker.side, ability: ability.name, text: `${attacker.character.name}'s ${ability.name}!` });
      this._applyStatus(defender, 'burn', events);
      return;
    }
    if (ability.kind === 'lifesteal' && attacker.hp < attacker.maxHp) {
      events.push({ kind: 'ability', side: attacker.side, ability: ability.name, text: `${attacker.character.name}'s ${ability.name}!` });
      this._heal(attacker, Math.round(dealt * ability.share), events, `${attacker.character.name} fed on the wound!`);
    }
  }

  _applyEffect(move, attacker, defender, events) {
    const effect = move.effect;
    if (!effect) return;
    if (effect.shield) {
      attacker.shielded = true;
      events.push({ kind: 'status', side: attacker.side, text: `${attacker.character.name} braced for impact!` });
    }
    if (effect.heal) {
      this._heal(attacker, Math.round(attacker.maxHp * effect.heal), events, `${attacker.character.name} recovered health!`);
    }
    if (effect.cure && attacker.status) {
      const cured = STATUSES[attacker.status.id].name;
      attacker.status = null;
      events.push({ kind: 'status', side: attacker.side, text: `${attacker.character.name} shook off its ${cured}!` });
    }
    if (effect.stat) {
      const target = effect.target === 'self' ? attacker : defender;
      if (!target.fainted && this.rng() * 100 < (effect.chance ?? 100)) {
        this._changeStage(target, effect.stat, effect.stages, events);
      }
    }
    if (effect.status) {
      const target = effect.target === 'self' ? attacker : defender;
      if (!target.fainted && this.rng() * 100 < (effect.chance ?? 100)) {
        this._applyStatus(target, effect.status, events);
      }
    }
  }

  _changeStage(fighter, stat, stages, events) {
    const before = fighter.stages[stat];
    fighter.stages[stat] = Math.max(-MAX_STAGE, Math.min(MAX_STAGE, before + stages));
    if (fighter.stages[stat] === before) {
      events.push({ kind: 'text', text: `${fighter.character.name}'s ${stat.toUpperCase()} won't budge!` });
      return;
    }
    const direction = stages > 0 ? 'rose' : 'fell';
    const amount = Math.abs(stages) > 1 ? 'sharply ' : '';
    events.push({
      kind: 'stat',
      side: fighter.side,
      stat,
      stages,
      text: `${fighter.character.name}'s ${stat.toUpperCase()} ${amount}${direction}!`,
    });
  }

  _applyStatus(fighter, statusId, events) {
    const status = STATUSES[statusId];
    if (fighter.status?.id === statusId) {
      events.push({ kind: 'text', text: `${fighter.character.name} is already ${status.name.toLowerCase()}ed.` });
      return;
    }
    fighter.status = { id: statusId, turns: status.turns };
    events.push({
      kind: 'status',
      side: fighter.side,
      status: statusId,
      text: `${fighter.character.name} ${status.onApply}`,
    });
  }

  _damage(fighter, amount, events, meta = {}) {
    const dealt = Math.min(fighter.hp, Math.max(0, amount));
    fighter.hp -= dealt;
    events.push({
      kind: 'damage',
      side: fighter.side,
      slot: fighter.slot,
      amount: dealt,
      hpAfter: fighter.hp,
      maxHp: fighter.maxHp,
      crit: Boolean(meta.crit),
      recoil: Boolean(meta.recoil),
      text: meta.crit ? 'A critical hit!' : meta.recoil ? `${fighter.character.name} is hurt by the recoil!` : null,
    });
    return dealt;
  }

  _heal(fighter, amount, events, text) {
    const healed = Math.min(fighter.maxHp - fighter.hp, Math.max(0, amount));
    fighter.hp += healed;
    events.push({
      kind: 'heal',
      side: fighter.side,
      slot: fighter.slot,
      amount: healed,
      hpAfter: fighter.hp,
      maxHp: fighter.maxHp,
      text: healed > 0 ? text : `${fighter.character.name} is already at full health.`,
    });
  }

  _checkFaints(events) {
    for (const side of SIDES) {
      const fighter = this.activeOf(side);
      if (fighter.hp > 0 || fighter.fainted) continue;
      fighter.fainted = true;
      fighter.status = null;
      fighter.stages = { atk: 0, def: 0, spd: 0 };
      const foe = this.activeOf(this.foeSide(side));
      if (!foe.fainted) foe.kos += 1;
      events.push({
        kind: 'faint',
        side,
        slot: fighter.slot,
        text: `${fighter.character.name} is out of the fight!`,
      });
    }
    this._checkGameOver(events);
    if (this.over) return;
    for (const side of SIDES) {
      this.pendingSwitch[side] = this.activeOf(side).fainted;
    }
  }

  /** Out of time: the side with more health left standing takes it. */
  _callTheMatch(events) {
    const health = (side) =>
      this.teams[side].reduce((total, fighter) => total + fighter.hp / fighter.maxHp, 0);
    const playerHealth = health('player');
    const enemyHealth = health('enemy');
    this.over = true;
    this.winner = playerHealth === enemyHealth ? null : playerHealth > enemyHealth ? 'player' : 'enemy';
    events.push({
      kind: 'end',
      side: this.winner,
      timeout: true,
      text:
        this.winner === 'player'
          ? 'Time! You had the healthier team - you win!'
          : this.winner === 'enemy'
            ? 'Time! The rival team was in better shape...'
            : 'Time! Neither team could finish it.',
    });
  }

  _checkGameOver(events) {
    for (const side of SIDES) {
      if (this.teams[side].every((fighter) => fighter.fainted)) {
        this.over = true;
        this.winner = this.foeSide(side);
        events.push({
          kind: 'end',
          side: this.winner,
          text: this.winner === 'player' ? 'You win the battle!' : 'Your team is out of fighters...',
        });
        return;
      }
    }
  }

  _endOfTurn(events) {
    for (const side of SIDES) {
      const fighter = this.activeOf(side);
      fighter.shielded = false;
      if (fighter.fainted || !fighter.status) continue;
      const status = STATUSES[fighter.status.id];
      if (status.dot) {
        this._damage(fighter, Math.max(1, Math.round(fighter.maxHp * status.dot)), events);
        if (status.tick) events.push({ kind: 'text', text: `${fighter.character.name} ${status.tick}` });
      }
      fighter.status.turns -= 1;
      if (fighter.status.turns <= 0) {
        fighter.status = null;
        events.push({ kind: 'status', side, text: `${fighter.character.name} shook off its ${status.name.toLowerCase()}.` });
      }
    }
    for (const side of SIDES) {
      for (const fighter of this.teams[side]) {
        for (const moveId of Object.keys(fighter.cooldowns)) {
          fighter.cooldowns[moveId] = Math.max(0, fighter.cooldowns[moveId] - 1);
        }
      }
    }
    this._checkFaints(events);
  }

  /** Sends in a replacement after a faint. */
  applyForcedSwitch(side, index) {
    const entering = this.teams[side][index];
    if (!entering || entering.fainted) throw new Error('That fighter cannot be sent out');
    this.active[side] = index;
    this.pendingSwitch[side] = false;
    return {
      kind: 'switch',
      side,
      slot: index,
      text: `${side === 'player' ? 'Go' : 'The rival sends out'} ${entering.character.name}!`,
    };
  }

  _randomInt(min, max) {
    return min + Math.floor(this.rng() * (max - min + 1));
  }
}

/** Deterministic RNG so tests (and replays) can pin a battle down. */
export function makeRng(seed = 1) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}
