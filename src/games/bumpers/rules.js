import { clamp } from '../../core/utils.js';
import {
  FIELD,
  HIT_BASE,
  HIT_CURVE,
  HIT_FLOOR,
  HIT_LOCK,
  HIT_REFERENCE,
  ROUND_LIMIT,
  STAGGER_OUTPUT,
  STAGGER_TIME,
  getCharacter,
} from './content.js';
import { bounceOffWalls, collide, overlapping, setSpeed, shoveFrom, speedOf, stepMotion } from './physics.js';

/**
 * The rules of a Bumpers duel: health, abilities, and who wins.
 *
 * A match is a plain object you step with `stepMatch(match, dt, commands)`.
 * There is no canvas, no clock and no randomness in here, so a test can fight a
 * whole round in a loop and a simulation can fight ten thousand.
 */

const MAX_SUB_STEP = 1 / 120;  // physics runs fine-grained so nobody tunnels

/* ----------------------------------------------------------- the fighters */

export function createFighter(characterId, side, spawn) {
  const spec = getCharacter(characterId);
  return {
    side,
    spec,
    name: spec.name,
    x: spawn.x,
    y: spawn.y,
    vx: spawn.vx ?? 0,
    vy: spawn.vy ?? 0,
    radius: spec.radius,
    mass: spec.mass,
    baseMass: spec.mass,
    thrust: spec.thrust,
    top: spec.top,
    power: spec.power,
    hp: spec.hp,
    maxHp: spec.hp,
    cooldown: 0,
    rooted: false,
    guard: 0,        // seconds of reduced damage left
    spike: 0,        // seconds of bonus damage left
    anchor: 0,       // seconds of Set left
    dash: 0,         // seconds of dash afterglow, for the trail
    hitLock: 0,      // seconds before this pair may trade again
    stagger: 0,      // seconds of reeling, during which your hits do little
    thrustScale: 1,
    dealt: 0,
    taken: 0,
  };
}

/** Opposite corners, pointed at each other, so round one starts immediately. */
export function spawnPoints(field = FIELD) {
  const insetX = field.w * 0.22;
  const midY = field.y + field.h / 2;
  return [
    { x: field.x + insetX, y: midY, vx: 140, vy: -90 },
    { x: field.x + field.w - insetX, y: midY, vx: -140, vy: 90 },
  ];
}

export function createMatch(aId, bId, { field = FIELD, limit = ROUND_LIMIT } = {}) {
  const [left, right] = spawnPoints(field);
  return {
    field,
    limit,
    time: 0,
    a: createFighter(aId, 'a', left),
    b: createFighter(bId, 'b', right),
    events: [],   // one round's worth of things worth drawing or hearing
    over: null,   // { winner: 'a' | 'b' | 'draw', reason }
  };
}

export const fightersOf = (match) => [match.a, match.b];
export const otherSide = (side) => (side === 'a' ? 'b' : 'a');

/* -------------------------------------------------------------- the damage */

/**
 * What one ball does to the other in a collision.
 *
 * `approach` is the speed the attacker carried into the hit, and nothing else
 * about the attacker's motion matters. Below `HIT_FLOOR` it is a nudge and
 * costs nothing. Being heavier than the ball you hit scales it up, but only on
 * the square root, so Boulder is worth about one and a half Zips rather than
 * three and a half.
 */
export function damageFor(attacker, defender, approach) {
  if (approach < HIT_FLOOR) return 0;
  const massEdge = clamp(Math.sqrt(attacker.mass / defender.mass), 0.55, 1.9);
  const spike = attacker.spike > 0 ? 1.5 : 1;
  const guard = defender.guard > 0 ? 0.45 : 1;
  const reeling = attacker.stagger > 0 ? STAGGER_OUTPUT : 1;
  const carried = Math.pow(approach / HIT_REFERENCE, HIT_CURVE);
  const raw = HIT_BASE * attacker.power * carried * massEdge * spike * guard * reeling;
  return Math.round(raw * 10) / 10;
}

/* ------------------------------------------------------------ the abilities */

/**
 * Every ability a character can carry. A character names one of these in its
 * `ability.kind` and supplies the numbers; adding a new kind is adding a key.
 *
 * `fire` is handed the match, the fighter using it and its opponent, and may
 * return a short label for the log.
 */
export const ABILITIES = {
  /** A hard shove in the direction you are already travelling. */
  dash(match, me, foe, spec) {
    const speed = Math.max(speedOf(me), 1);
    me.vx = (me.vx / speed) * spec.speed;
    me.vy = (me.vy / speed) * spec.speed;
    me.dash = 0.35;
    return 'dash';
  },

  /** Plants you. Nothing shifts you, and you shift nothing. */
  anchor(match, me, foe, spec) {
    me.anchor = spec.duration;
    me.rooted = true;
    me.mass = spec.mass;
    return 'anchor';
  },

  /** Throws the other ball away from you. Deals nothing by itself. */
  shockwave(match, me, foe, spec) {
    const reach = spec.radius + me.radius + foe.radius;
    if (Math.hypot(foe.x - me.x, foe.y - me.y) <= reach) {
      shoveFrom(foe, me.x, me.y, spec.push);
      match.events.push({ kind: 'shock', x: me.x, y: me.y, radius: spec.radius, side: me.side, hit: true });
      return 'shockwave-hit';
    }
    match.events.push({ kind: 'shock', x: me.x, y: me.y, radius: spec.radius, side: me.side, hit: false });
    return 'shockwave-miss';
  },

  /** A short window where everything hurts you less. */
  guard(match, me, foe, spec) {
    me.guard = spec.duration;
    return 'guard';
  },

  /** Your next few seconds of hits land harder. */
  spikes(match, me, foe, spec) {
    me.spike = spec.duration;
    return 'spikes';
  },

  /** Drags them towards you, if they are within reach. */
  hook(match, me, foe, spec) {
    const reach = spec.radius + me.radius + foe.radius;
    if (Math.hypot(foe.x - me.x, foe.y - me.y) > reach) {
      match.events.push({ kind: 'hook', x: me.x, y: me.y, toX: foe.x, toY: foe.y, side: me.side, hit: false });
      return 'hook-miss';
    }
    shoveFrom(foe, me.x, me.y, -spec.pull);
    match.events.push({ kind: 'hook', x: me.x, y: me.y, toX: foe.x, toY: foe.y, side: me.side, hit: true });
    return 'hook-hit';
  },

  /** Patches you up, once in a while. */
  mend(match, me, foe, spec) {
    me.hp = Math.min(me.maxHp, me.hp + spec.amount);
    return 'mend';
  },
};

export const canUseAbility = (fighter) => fighter.cooldown <= 0 && !fighter.spent;

/** Fires a fighter's ability if it is off cooldown. Returns true if it went. */
export function useAbility(match, me, foe) {
  if (!canUseAbility(me)) return false;
  const spec = me.spec.ability;
  const run = ABILITIES[spec.kind];
  if (!run) throw new Error(`${me.spec.name} has an unknown ability: ${spec.kind}`);
  me.cooldown = spec.cooldown;
  const label = run(match, me, foe, spec) || spec.kind;
  match.events.push({ kind: 'ability', side: me.side, name: spec.name, label });
  return true;
}

/* ----------------------------------------------------------------- the step */

function tickTimers(fighter, dt) {
  fighter.cooldown = Math.max(0, fighter.cooldown - dt);
  fighter.guard = Math.max(0, fighter.guard - dt);
  fighter.spike = Math.max(0, fighter.spike - dt);
  fighter.dash = Math.max(0, fighter.dash - dt);
  fighter.hitLock = Math.max(0, fighter.hitLock - dt);
  fighter.stagger = Math.max(0, fighter.stagger - dt);
  if (fighter.anchor > 0) {
    fighter.anchor = Math.max(0, fighter.anchor - dt);
    if (fighter.anchor === 0) {
      fighter.rooted = false;
      fighter.mass = fighter.baseMass;
      // Let go of the floor gently rather than springing away from a standstill.
      setSpeed(fighter, 140);
    }
  }
}

const steerOf = (command) => {
  const x = command?.x ?? 0;
  const y = command?.y ?? 0;
  const length = Math.hypot(x, y);
  if (length <= 1) return { x, y };
  return { x: x / length, y: y / length };
};

/**
 * Advances a match by `dt` seconds.
 *
 * `commands` is `{ a: { x, y, ability }, b: { ... } }`: a steering direction of
 * length at most one, and whether that side is asking for its ability this
 * frame. Anything missing counts as letting go of the controls.
 */
export function stepMatch(match, dt, commands = {}) {
  if (match.over) return match;
  match.events.length = 0;

  const { a, b } = match;
  for (const [fighter, foe] of [[a, b], [b, a]]) {
    if (commands[fighter.side]?.ability) useAbility(match, fighter, foe);
  }

  let left = dt;
  while (left > 1e-9) {
    const slice = Math.min(left, MAX_SUB_STEP);
    left -= slice;

    for (const fighter of [a, b]) {
      tickTimers(fighter, slice);
      stepMotion(fighter, steerOf(commands[fighter.side]), slice);
      const wall = bounceOffWalls(fighter, match.field);
      if (wall > 240) match.events.push({ kind: 'wall', x: fighter.x, y: fighter.y, force: wall, side: fighter.side });
    }

    if (overlapping(a, b)) {
      const hit = collide(a, b);
      if (a.hitLock <= 0 && b.hitLock <= 0 && hit.closing >= HIT_FLOOR) {
        const toB = damageFor(a, b, hit.approachA);
        const toA = damageFor(b, a, hit.approachB);
        b.hp = Math.max(0, Math.round((b.hp - toB) * 10) / 10);
        a.hp = Math.max(0, Math.round((a.hp - toA) * 10) / 10);
        a.dealt += toB;
        b.dealt += toA;
        a.taken += toA;
        b.taken += toB;
        a.hitLock = HIT_LOCK;
        b.hitLock = HIT_LOCK;
        if (toA > 0) a.stagger = STAGGER_TIME;
        if (toB > 0) b.stagger = STAGGER_TIME;
        match.events.push({
          kind: 'clash',
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          closing: hit.closing,
          toA,
          toB,
        });
      }
    }

    match.time += slice;
    if (checkOver(match)) break;
  }
  return match;
}

/** Decides whether the round is finished, and writes the verdict if it is. */
export function checkOver(match) {
  if (match.over) return match.over;
  const { a, b } = match;
  if (a.hp <= 0 && b.hp <= 0) {
    // You went out in the same exchange, which happens often when every hit is
    // mutual. Rather than call it a draw, it goes to whoever hit harder over
    // the round - you both fell, but one of you was winning.
    const edge = a.dealt - b.dealt;
    if (Math.abs(edge) < 1e-9) match.over = { winner: 'draw', reason: 'you both went out together' };
    else match.over = { winner: edge > 0 ? 'a' : 'b', reason: 'you both went out - they hit harder' };
  }
  else if (b.hp <= 0) match.over = { winner: 'a', reason: 'knocked out' };
  else if (a.hp <= 0) match.over = { winner: 'b', reason: 'knocked out' };
  else if (match.time >= match.limit) {
    const share = (f) => f.hp / f.maxHp;
    const diff = share(a) - share(b);
    if (Math.abs(diff) < 1e-9) match.over = { winner: 'draw', reason: 'time, and nothing between you' };
    else match.over = { winner: diff > 0 ? 'a' : 'b', reason: 'time - more health left' };
  }
  return match.over;
}

/** How full a health bar is, 0..1. */
export const healthShare = (fighter) => clamp(fighter.hp / fighter.maxHp, 0, 1);
