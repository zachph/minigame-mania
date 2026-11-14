import { clamp } from '../../core/utils.js';
import {
  BASE_TEMPO,
  CHARGE_FULL,
  DAMAGE_SPREAD,
  FIGHT_LIMIT,
  OPENING_CHARGE,
  PRESSURE_FROM,
  PRESSURE_RATE,
  getFighter,
} from './content.js';

/**
 * A Faceoff fight, with no idea that a screen exists.
 *
 * Nobody takes turns. Every fighter fills a bar at its own speed and acts the
 * moment it is full, which is why speed is worth more here than anywhere else
 * in the collection: a Flicker simply gets more goes than a Bulwark.
 *
 * Only the front fighter of each side is in it. When one falls the next of
 * that three walks in, and a side is beaten when it has nobody left to send.
 *
 * `stepFight` is the whole thing. Hand it a fight and a timestep and it
 * advances; hand it the same seed twice and it plays out identically, which is
 * what lets a few thousand of them settle the balance.
 */

const MAX_SUB_STEP = 1 / 30;

/* ---------------------------------------------------------- the fighters */

/**
 * One fighter, ready to fight. `scale` lifts the numbers for the later floors
 * of the tower without needing nine more entries in the roster.
 */
export function makeFighter(id, { scale = 1, slot = 0, side = 'a' } = {}) {
  const spec = getFighter(id);
  const hp = Math.round(spec.hp * scale);
  return {
    uid: `${side}${slot}-${id}`,
    id,
    side,
    slot,
    spec,
    name: spec.name,
    maxHp: hp,
    hp,
    attack: spec.attack * scale,
    speed: spec.speed,
    guard: spec.guard || 0,
    charge: 0,
    ready: 0,          // how many times its ability is charged
    acts: 0,           // goes taken, which is what `ready` counts towards
    effects: [],       // poison and the like, each ticking on its own clock
    brace: 0,          // seconds of extra guard left
    riposte: 0,        // seconds of hitting back left
    riposteShare: 0,
    usedOnce: false,   // for the abilities that only ever happen once
    dealt: 0,
    taken: 0,
    healed: 0,
  };
}

export function makeTeam(ids, { scale = 1, side = 'a' } = {}) {
  return ids.map((id, slot) => makeFighter(id, { scale, slot, side }));
}

/* ------------------------------------------------------------- the fight */

export function createFight({ a, b, scaleA = 1, scaleB = 1, random = Math.random, limit = FIGHT_LIMIT } = {}) {
  return openBars({
    random,
    limit,
    time: 0,
    sides: {
      a: { team: makeTeam(a, { scale: scaleA, side: 'a' }), front: 0 },
      b: { team: makeTeam(b, { scale: scaleB, side: 'b' }), front: 0 },
    },
    log: [],
    events: [],      // one step's worth of things worth drawing
    over: null,      // { winner: 'a' | 'b' | 'draw', reason }
  });
}

/** Starts the two front fighters part way up their bars, by chance. */
function openBars(fight) {
  for (const side of ['a', 'b']) {
    const who = frontOf(fight, side);
    if (who) who.charge = fight.random() * CHARGE_FULL * OPENING_CHARGE;
  }
  return fight;
}

export const other = (side) => (side === 'a' ? 'b' : 'a');
export const frontOf = (fight, side) => fight.sides[side].team[fight.sides[side].front] || null;
export const standing = (side) => side.team.filter((f) => f.hp > 0);
export const isBeaten = (side) => side.team.every((f) => f.hp <= 0);

const say = (fight, text, extra = {}) => {
  fight.log.push({ at: fight.time, text, ...extra });
  if (fight.log.length > 60) fight.log.shift();
  fight.events.push({ kind: 'say', text, ...extra });
};

/* -------------------------------------------------------------- damage */

/**
 * What one hit takes off. Guard is flat rather than a percentage so a heavy
 * defender shrugs off a flurry of small hits and still feels a big one - which
 * is the whole reason Flicker and Edge are different fighters rather than two
 * sets of numbers.
 */
export function damageOf(attacker, defender, multiplier = 1) {
  const raw = attacker.attack * multiplier;
  const soaked = defender.guard + defender.brace;
  return Math.max(1, Math.round((raw - soaked) * 10) / 10);
}

/**
 * The same hit, with the wobble on it. `damageOf` is the average and stays
 * pure so a test can state exactly what a matchup is worth; this is what the
 * fight actually uses, and it is the reason the same two fighters do not play
 * out the same way twice.
 */
export function rollDamage(fight, attacker, defender, multiplier = 1) {
  const average = damageOf(attacker, defender, multiplier);
  const swing = 1 - DAMAGE_SPREAD + fight.random() * DAMAGE_SPREAD * 2;
  return Math.max(1, Math.round(average * swing * pressureAt(fight.time) * 10) / 10);
}

/** How much harder everything hits by now. One before the grace runs out. */
export const pressureAt = (time) =>
  1 + Math.max(0, time - PRESSURE_FROM) * PRESSURE_RATE;

/**
 * Puts damage on a fighter and settles everything that answers it: the riposte
 * that sends some back, and the rally that refuses to go down. Everything that
 * can hurt anyone goes through here, so none of those can be stepped around.
 */
export function hurt(fight, target, amount, { from = null, kind = 'hit' } = {}) {
  if (target.hp <= 0 || amount <= 0) return 0;
  const dealt = Math.round(Math.min(amount, target.hp) * 10) / 10;
  target.hp = Math.round((target.hp - dealt) * 10) / 10;
  target.taken += dealt;
  if (from) from.dealt += dealt;
  fight.events.push({ kind: 'damage', uid: target.uid, amount: dealt, source: kind });

  // Hitting a Mirror is its own decision.
  if (from && target.riposte > 0 && kind === 'hit') {
    const back = Math.round(dealt * target.riposteShare * 10) / 10;
    if (back > 0 && from.hp > 0) {
      from.hp = Math.round(Math.max(0, from.hp - back) * 10) / 10;
      from.taken += back;
      fight.events.push({ kind: 'damage', uid: from.uid, amount: back, source: 'riposte' });
      say(fight, `${target.name} turns ${back} of it back`, { uid: from.uid });
      checkDown(fight, from);
    }
  }

  checkDown(fight, target);
  return dealt;
}

export function heal(fight, target, amount) {
  if (target.hp <= 0) return 0;
  const given = Math.round(Math.min(amount, target.maxHp - target.hp) * 10) / 10;
  if (given <= 0) return 0;
  target.hp = Math.round((target.hp + given) * 10) / 10;
  target.healed += given;
  fight.events.push({ kind: 'heal', uid: target.uid, amount: given });
  return given;
}

/** A fighter that has run out, unless it has something to say about that. */
function checkDown(fight, who) {
  if (who.hp > 0) return false;
  const spec = who.spec.ability;
  if (spec.kind === 'rally' && !who.usedOnce) {
    who.usedOnce = true;
    who.hp = Math.round(who.maxHp * spec.share * 10) / 10;
    who.effects.length = 0;
    fight.events.push({ kind: 'rally', uid: who.uid });
    say(fight, `${who.name} gets back up`, { uid: who.uid });
    return false;
  }
  who.hp = 0;
  who.charge = 0;
  fight.events.push({ kind: 'down', uid: who.uid });
  say(fight, `${who.name} is done`, { uid: who.uid });
  return true;
}

/* ----------------------------------------------------------- the actions */

/**
 * Everything a fighter can do with its go. A fighter names one of these and
 * supplies the numbers; adding a new one is adding a key, which is what makes
 * the roster replaceable without touching the fight.
 */
export const ABILITIES = {
  /** One much bigger hit. */
  strike(fight, me, foe, spec) {
    const amount = rollDamage(fight, me, foe, spec.multiplier);
    hurt(fight, foe, amount, { from: me });
    return `${me.name} opens ${foe.name} up for ${amount}`;
  },

  /** Several small ones, which guard eats into far more. */
  flurry(fight, me, foe, spec) {
    let total = 0;
    for (let i = 0; i < spec.hits && foe.hp > 0; i += 1) {
      total += hurt(fight, foe, rollDamage(fight, me, foe, 0.55), { from: me });
    }
    return `${me.name} rattles off ${spec.hits} for ${Math.round(total * 10) / 10}`;
  },

  /** Hits, and keeps most of it. */
  drain(fight, me, foe, spec) {
    const dealt = hurt(fight, foe, rollDamage(fight, me, foe, spec.multiplier), { from: me });
    const kept = heal(fight, me, dealt * spec.share);
    return `${me.name} takes ${dealt} and keeps ${Math.round(kept * 10) / 10}`;
  },

  /** Damage that arrives later, and does not care about guard. */
  poison(fight, me, foe, spec) {
    foe.effects.push({ kind: 'poison', damage: spec.damage, left: spec.ticks, interval: spec.interval, next: spec.interval, from: me });
    return `${me.name} sets ${foe.name} rotting`;
  },

  /** Heals the worst off, the ones waiting included. */
  mend(fight, me, foe, spec) {
    const side = fight.sides[me.side];
    const pool = spec.bench ? side.team : [me];
    const hurtOnes = pool.filter((f) => f.hp > 0 && f.hp < f.maxHp);
    if (hurtOnes.length === 0) return `${me.name} has nobody to patch up`;
    const worst = hurtOnes.reduce((low, f) => (f.hp / f.maxHp < low.hp / low.maxHp ? f : low));
    const given = heal(fight, worst, spec.amount);
    return `${me.name} patches ${worst === me ? 'itself' : worst.name} for ${Math.round(given * 10) / 10}`;
  },

  /** Takes less for a while. */
  brace(fight, me, foe, spec) {
    me.brace = spec.guard;
    me.braceLeft = spec.duration;
    return `${me.name} digs in`;
  },

  /** Sends part of what it takes straight back. */
  riposte(fight, me, foe, spec) {
    me.riposte = spec.duration;
    me.riposteShare = spec.share;
    return `${me.name} squares up - hitting it will cost you`;
  },

  /** Empties their bar, so whatever was coming is not coming yet. */
  stall(fight, me, foe, spec) {
    const lost = Math.min(foe.charge, spec.drain);
    foe.charge -= lost;
    // It hits as well. A go spent purely on tempo loses the damage race, and
    // the first version of Halt won one fight in eight because of it.
    const amount = rollDamage(fight, me, foe, spec.multiplier ?? 1);
    hurt(fight, foe, amount, { from: me });
    return `${me.name} holds ${foe.name} up and hits for ${amount}`;
  },

  /**
   * Never runs. A rally is not something a fighter spends a go on - it happens
   * in `checkDown`, the first time it would go down. It is listed here so the
   * roster check still finds a kind it knows, and so nothing has to special
   * case a fighter whose whole trick is passive.
   *
   * Giving it a go of its own was the first version, and it meant the fighter
   * spent its second life on an attack and then stayed down the one time it
   * mattered. It won none of its fights.
   */
  rally(fight, me, foe) {
    const amount = rollDamage(fight, me, foe);
    hurt(fight, foe, amount, { from: me });
    return `${me.name} hits for ${amount}`;
  },
};

/** The plain hit a fighter makes when its ability is not charged. */
function basicHit(fight, me, foe) {
  const amount = rollDamage(fight, me, foe);
  hurt(fight, foe, amount, { from: me });
  say(fight, `${me.name} hits ${foe.name} for ${amount}`, { uid: foe.uid, side: me.side });
}

/**
 * One fighter's go. The ability lands every `charge` acts; the rest are plain
 * hits, so a fighter with a cheap ability is doing its special thing most of
 * the time and an expensive one is mostly punching.
 */
export function takeTurn(fight, me) {
  const foe = frontOf(fight, other(me.side));
  if (!foe || me.hp <= 0) return;
  me.acts += 1;
  const spec = me.spec.ability;
  const due = spec.charge > 0 && me.acts % spec.charge === 0;
  // A `passive` ability is never spent on a go - something else watches for it.
  const canFire = due && !spec.passive && !(spec.once && me.usedOnce);

  if (!canFire) {
    basicHit(fight, me, foe);
    return;
  }
  const run = ABILITIES[spec.kind];
  if (!run) throw new Error(`${me.name} has an unknown ability: ${spec.kind}`);
  if (spec.once) me.usedOnce = true;
  const line = run(fight, me, foe, spec);
  fight.events.push({ kind: 'ability', uid: me.uid, name: spec.name, side: me.side });
  say(fight, line, { side: me.side, ability: spec.name });
}

/* ---------------------------------------------------------------- ticking */

function tickEffects(fight, who, dt) {
  if (who.hp <= 0) return;
  for (const effect of who.effects) {
    effect.next -= dt;
    if (effect.next > 0) continue;
    effect.next += effect.interval;
    effect.left -= 1;
    if (effect.kind === 'poison') {
      hurt(fight, who, effect.damage * pressureAt(fight.time), { from: effect.from, kind: 'poison' });
    }
  }
  who.effects = who.effects.filter((effect) => effect.left > 0);
}

function tickWindows(who, dt) {
  if (who.braceLeft > 0) {
    who.braceLeft -= dt;
    if (who.braceLeft <= 0) who.brace = 0;
  }
  if (who.riposte > 0) {
    who.riposte -= dt;
    if (who.riposte <= 0) who.riposteShare = 0;
  }
}

/** Brings the next one in when the front fighter is done. */
function sendNext(fight, side) {
  const lane = fight.sides[side];
  while (lane.front < lane.team.length && lane.team[lane.front].hp <= 0) lane.front += 1;
  const next = frontOf(fight, side);
  if (next && !next.entered) {
    next.entered = true;
    fight.events.push({ kind: 'enter', uid: next.uid, side });
    say(fight, `${next.name} steps up`, { side, uid: next.uid });
  }
  return next;
}

export function stepFight(fight, dt) {
  if (fight.over) return fight;
  fight.events.length = 0;

  let left = dt;
  while (left > 1e-9 && !fight.over) {
    const slice = Math.min(left, MAX_SUB_STEP);
    left -= slice;
    fight.time += slice;

    for (const side of ['a', 'b']) {
      for (const who of fight.sides[side].team) {
        tickWindows(who, slice);
        tickEffects(fight, who, slice);
      }
    }

    for (const side of ['a', 'b']) sendNext(fight, side);
    if (checkOver(fight)) break;

    // Bars fill, and whoever fills first goes first. Ties are broken by speed
    // and then by the coin, so no seat is quietly better than the other.
    const fighters = ['a', 'b'].map((side) => frontOf(fight, side)).filter(Boolean);
    for (const who of fighters) {
      if (who.hp <= 0) continue;
      who.charge += who.speed * BASE_TEMPO * slice;
    }
    const acting = fighters
      .filter((who) => who.hp > 0 && who.charge >= CHARGE_FULL)
      .sort((x, y) => (y.charge - x.charge) || (y.speed - x.speed) || (fight.random() - 0.5));
    for (const who of acting) {
      if (who.hp <= 0 || fight.over) continue;
      who.charge -= CHARGE_FULL;
      takeTurn(fight, who);
      for (const side of ['a', 'b']) sendNext(fight, side);
      if (checkOver(fight)) break;
    }
  }
  return fight;
}

/** The share of a side's health still on its feet, bench included. */
export function healthShare(side) {
  const total = side.team.reduce((sum, f) => sum + f.maxHp, 0);
  const left = side.team.reduce((sum, f) => sum + Math.max(0, f.hp), 0);
  return total > 0 ? left / total : 0;
}

export function checkOver(fight) {
  if (fight.over) return fight.over;
  const aOut = isBeaten(fight.sides.a);
  const bOut = isBeaten(fight.sides.b);
  if (aOut && bOut) fight.over = { winner: 'draw', reason: 'you both ran out together' };
  else if (bOut) fight.over = { winner: 'a', reason: 'nobody left to send' };
  else if (aOut) fight.over = { winner: 'b', reason: 'nobody left to send' };
  else if (fight.time >= fight.limit) {
    const mine = healthShare(fight.sides.a);
    const theirs = healthShare(fight.sides.b);
    if (Math.abs(mine - theirs) < 1e-9) fight.over = { winner: 'draw', reason: 'time, and nothing in it' };
    else fight.over = { winner: mine > theirs ? 'a' : 'b', reason: 'time - more left standing' };
  }
  if (fight.over) fight.events.push({ kind: 'over', ...fight.over });
  return fight.over;
}

/** Runs a whole fight with no screen attached. The balance work lives on this. */
export function runFight(fight, step = 1 / 30) {
  let guard = 0;
  while (!fight.over && guard < 100000) {
    stepFight(fight, step);
    guard += 1;
  }
  return fight.over || checkOver(fight);
}

export { clamp };
