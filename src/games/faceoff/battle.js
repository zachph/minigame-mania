import { clamp } from '../../core/utils.js';
import {
  BALL_RADIUS,
  BOX,
  BUMP_DAMAGE,
  BUMP_SPREAD,
  CRUISE,
  FIGHT_LIMIT,
  HIT_LOCK,
  HOMING,
  STALL_AFTER,
  PRESSURE_FROM,
  PRESSURE_RATE,
  getFighter,
} from './content.js';

/**
 * A Faceoff fight with no screen attached.
 *
 * The front fighter of each side is a ball in the box. Both keep moving at the
 * same speed, bounce off the walls, and lean towards each other so they keep
 * meeting. Every collision costs both of them health. When one runs out, the
 * next of that three is dropped into the box.
 *
 * Everything that hurts anyone goes through `hurt`, so Sans's dodges and any
 * ability added later answer every source of damage the same way.
 */

const MAX_SUB_STEP = 1 / 120;

export function makeFighter(id, { slot = 0, side = 'a' } = {}) {
  const spec = getFighter(id);
  return {
    uid: `${side}${slot}-${id}`,
    id,
    side,
    slot,
    spec,
    name: spec.name,
    maxHp: spec.hp,
    hp: spec.hp,
    dodgesLeft: spec.dodges,
    radius: BALL_RADIUS,
    mass: 1,
    x: 0, y: 0, vx: 0, vy: 0,
    hitLock: 0,
    dealt: 0,
    taken: 0,
    dodged: 0,
    entered: false,
  };
}

export function makeTeam(ids, side) {
  return ids.map((id, slot) => makeFighter(id, { slot, side }));
}

/** Drops a fighter into its own half of the box, heading somewhere random. */
export function place(fight, who) {
  const left = who.side === 'a';
  who.x = BOX.x + BOX.w * (left ? 0.22 : 0.78);
  who.y = BOX.y + BOX.h * (0.3 + fight.random() * 0.4);
  const angle = (left ? 0 : Math.PI) + (fight.random() - 0.5) * 1.6;
  who.vx = Math.cos(angle) * CRUISE;
  who.vy = Math.sin(angle) * CRUISE;
  who.hitLock = 0.3;
  who.entered = true;
}

export function createFight({ a, b, scaleA = 1, scaleB = 1, random = Math.random, limit = FIGHT_LIMIT } = {}) {
  const fight = {
    random,
    limit,
    time: 0,
    sides: {
      a: { team: makeTeam(a, 'a'), front: 0, scale: scaleA },
      b: { team: makeTeam(b, 'b'), front: 0, scale: scaleB },
    },
    log: [],
    events: [],
    over: null,
    sinceBump: 0,
  };
  for (const side of ['a', 'b']) place(fight, frontOf(fight, side));
  return fight;
}

export const other = (side) => (side === 'a' ? 'b' : 'a');
export const frontOf = (fight, side) => fight.sides[side].team[fight.sides[side].front] || null;
export const isBeaten = (side) => side.team.every((f) => f.hp <= 0);

const say = (fight, text, extra = {}) => {
  fight.log.push({ at: fight.time, text, ...extra });
  if (fight.log.length > 60) fight.log.shift();
};

export const pressureAt = (time) => 1 + Math.max(0, time - PRESSURE_FROM) * PRESSURE_RATE;

/**
 * Puts damage on a fighter. An attack that reaches a fighter with dodges left
 * misses instead and uses one up - that is Sans: one health, and the first
 * twenty-four things that come at him go nowhere.
 */
export function hurt(fight, target, amount, { from = null, kind = 'bump' } = {}) {
  if (target.hp <= 0 || amount <= 0) return 0;
  if (target.dodgesLeft > 0) {
    target.dodgesLeft -= 1;
    target.dodged += 1;
    fight.events.push({ kind: 'miss', uid: target.uid, left: target.dodgesLeft });
    return 0;
  }
  const dealt = Math.round(Math.min(amount, target.hp) * 10) / 10;
  target.hp = Math.round((target.hp - dealt) * 10) / 10;
  target.taken += dealt;
  if (from) from.dealt += dealt;
  fight.events.push({ kind: 'damage', uid: target.uid, amount: dealt, source: kind });
  if (target.hp <= 0) {
    target.hp = 0;
    fight.events.push({ kind: 'down', uid: target.uid });
    say(fight, `${target.name} is out`, { side: target.side });
  }
  return dealt;
}

export function heal(fight, target, amount) {
  if (target.hp <= 0) return 0;
  const given = Math.min(amount, target.maxHp - target.hp);
  if (given <= 0) return 0;
  target.hp = Math.round((target.hp + given) * 10) / 10;
  fight.events.push({ kind: 'heal', uid: target.uid, amount: given });
  return given;
}

/* ---------------------------------------------------------------- motion */

const speedOf = (b) => Math.hypot(b.vx, b.vy);

function setSpeed(b, speed) {
  const now = speedOf(b) || 1;
  b.vx = (b.vx / now) * speed;
  b.vy = (b.vy / now) * speed;
}

/**
 * How fast a ball may move right now. Normally the cruise speed; inside
 * Gojo's Infinity, a share of it. Gojo is never slowed by his own.
 */
export function speedFor(who, foe) {
  const aura = foe?.spec.ability;
  if (!aura || aura.kind !== 'infinity' || foe.hp <= 0) return CRUISE;
  const dist = Math.hypot(foe.x - who.x, foe.y - who.y);
  return dist <= aura.range ? CRUISE * aura.slow : CRUISE;
}

/** True while `who` is inside the other fighter's Infinity. */
export const inInfinity = (who, foe) => speedFor(who, foe) < CRUISE;

/** Moves one ball: lean towards the other, keep cruising, stay in the box. */
export function move(who, foe, dt) {
  if (foe) {
    const dx = foe.x - who.x;
    const dy = foe.y - who.y;
    const dist = Math.hypot(dx, dy) || 1;
    who.vx += (dx / dist) * CRUISE * HOMING * dt;
    who.vy += (dy / dist) * CRUISE * HOMING * dt;
  }
  setSpeed(who, speedFor(who, foe));
  who.x += who.vx * dt;
  who.y += who.vy * dt;

  const r = who.radius;
  if (who.x < BOX.x + r) { who.x = BOX.x + r; who.vx = Math.abs(who.vx); }
  if (who.x > BOX.x + BOX.w - r) { who.x = BOX.x + BOX.w - r; who.vx = -Math.abs(who.vx); }
  if (who.y < BOX.y + r) { who.y = BOX.y + r; who.vy = Math.abs(who.vy); }
  if (who.y > BOX.y + BOX.h - r) { who.y = BOX.y + BOX.h - r; who.vy = -Math.abs(who.vy); }
}

/**
 * Two balls meeting: they bounce apart, and each takes damage. The one that
 * was moving into the other more takes less, so a clean hit beats being hit,
 * but every bump costs both of them something.
 */
export function bump(fight, a, b) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dist = Math.hypot(dx, dy);
  if (dist < 1e-6) { dx = 1; dy = 0; dist = 1; }
  const nx = dx / dist;
  const ny = dy / dist;

  const approachA = Math.max(0, a.vx * nx + a.vy * ny);
  const approachB = Math.max(0, -(b.vx * nx + b.vy * ny));

  // Push apart and reflect both along the line between them.
  const gap = a.radius + b.radius - dist;
  if (gap > 0) {
    a.x -= nx * gap / 2; a.y -= ny * gap / 2;
    b.x += nx * gap / 2; b.y += ny * gap / 2;
  }
  const va = a.vx * nx + a.vy * ny;
  const vb = b.vx * nx + b.vy * ny;
  a.vx += (vb - va) * nx; a.vy += (vb - va) * ny;
  b.vx += (va - vb) * nx; b.vy += (va - vb) * ny;
  setSpeed(a, CRUISE);
  setSpeed(b, CRUISE);

  if (a.hitLock > 0 || b.hitLock > 0) return null;
  a.hitLock = HIT_LOCK;
  b.hitLock = HIT_LOCK;

  const total = approachA + approachB || 1;
  const pressure = pressureAt(fight.time);
  const roll = () => 1 - BUMP_SPREAD + fight.random() * BUMP_SPREAD * 2;
  const share = (approach) => clamp(approach / total, 0.25, 0.75) * 2;
  const toB = BUMP_DAMAGE * share(approachA) * roll() * pressure * fight.sides[a.side].scale;
  const toA = BUMP_DAMAGE * share(approachB) * roll() * pressure * fight.sides[b.side].scale;

  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;
  fight.sinceBump = 0;
  fight.events.push({ kind: 'bump', x, y });
  hurt(fight, b, toB, { from: a });
  hurt(fight, a, toA, { from: b });
  return { toA, toB };
}

/** Brings the next of a three into the box once the one in it is out. */
function sendNext(fight, side) {
  const lane = fight.sides[side];
  while (lane.front < lane.team.length && lane.team[lane.front].hp <= 0) lane.front += 1;
  const next = frontOf(fight, side);
  if (next && !next.entered) {
    place(fight, next);
    fight.sinceBump = 0;
    fight.events.push({ kind: 'enter', uid: next.uid, side });
    say(fight, `${next.name} steps in`, { side });
  }
}

export function stepFight(fight, dt) {
  if (fight.over) return fight;
  fight.events.length = 0;
  let left = dt;
  while (left > 1e-9 && !fight.over) {
    const slice = Math.min(left, MAX_SUB_STEP);
    left -= slice;
    fight.time += slice;

    for (const side of ['a', 'b']) sendNext(fight, side);
    if (checkOver(fight)) break;

    const a = frontOf(fight, 'a');
    const b = frontOf(fight, 'b');
    for (const who of [a, b]) who.hitLock = Math.max(0, who.hitLock - slice);

    // Break an orbit: point both straight at each other.
    fight.sinceBump += slice;
    if (fight.sinceBump > STALL_AFTER) {
      for (const [who, foe] of [[a, b], [b, a]]) {
        const d = Math.hypot(foe.x - who.x, foe.y - who.y) || 1;
        who.vx = ((foe.x - who.x) / d) * CRUISE;
        who.vy = ((foe.y - who.y) / d) * CRUISE;
      }
      fight.sinceBump = 0;
    }
    move(a, b, slice);
    move(b, a, slice);
    if (Math.hypot(b.x - a.x, b.y - a.y) <= a.radius + b.radius) bump(fight, a, b);
    if (checkOver(fight)) break;
  }
  return fight;
}

export function healthShare(side) {
  const total = side.team.reduce((sum, f) => sum + f.maxHp, 0);
  const left = side.team.reduce((sum, f) => sum + Math.max(0, f.hp), 0);
  return total > 0 ? left / total : 0;
}

/** Fighters still standing, counted - used to settle a fight on the clock. */
const alive = (side) => side.team.filter((f) => f.hp > 0).length;

export function checkOver(fight) {
  if (fight.over) return fight.over;
  const aOut = isBeaten(fight.sides.a);
  const bOut = isBeaten(fight.sides.b);
  if (aOut && bOut) fight.over = { winner: 'draw', reason: 'both out at once' };
  else if (bOut) fight.over = { winner: 'a', reason: 'nobody left to send' };
  else if (aOut) fight.over = { winner: 'b', reason: 'nobody left to send' };
  else if (fight.time >= fight.limit) {
    // Counted fighters first, so Sans on his one health is not a free loss.
    const diff = alive(fight.sides.a) - alive(fight.sides.b)
      || healthShare(fight.sides.a) - healthShare(fight.sides.b);
    fight.over = Math.abs(diff) < 1e-9
      ? { winner: 'draw', reason: 'time, and nothing in it' }
      : { winner: diff > 0 ? 'a' : 'b', reason: 'time - more left standing' };
  }
  if (fight.over) fight.events.push({ kind: 'over', ...fight.over });
  return fight.over;
}

export function runFight(fight, step = 1 / 30) {
  let guard = 0;
  while (!fight.over && guard < 100000) { stepFight(fight, step); guard += 1; }
  return fight.over || checkOver(fight);
}
