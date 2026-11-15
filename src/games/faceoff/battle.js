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
  LAUNCH_SPEED,
  PRESSURE_FROM,
  PRESSURE_RATE,
  STALL_AFTER,
  TELEPORT_CLEAR,
  getFighter,
} from './content.js';

/**
 * A Faceoff fight with no screen attached.
 *
 * The front fighter of each side is a ball in the box. Both keep moving at the
 * same speed, bounce off the walls, and lean towards each other so they keep
 * meeting. Every collision costs health. When one runs out, the next of that
 * three is dropped in.
 *
 * Abilities come in three kinds, and each has one home here:
 *   - on a clock (Sukuna, Sans, Goku, Beerus): `tickAbilities`
 *   - on a hit they land (Ralsei, Garou, Saitama): `strike`
 *   - on going down (Undyne): `hurt`
 * plus Gojo's Infinity, which is always on and lives in `speedFor`.
 *
 * Every point of damage goes through `hurt`, so Sans's dodges answer all of
 * them the same way: a bump, a burn tick, a wall, a Serious Punch.
 */

const MAX_SUB_STEP = 1 / 120;

/** Every ability a fighter has. */
export const abilitiesOf = (who) => who?.spec?.abilities || [];

/** The fighter's ability of this kind, or null. */
export const abilityOf = (who, kind) => abilitiesOf(who).find((ability) => ability.kind === kind) || null;

/** Abilities that go off on a timer, as opposed to on a hit or always. */
export const isClock = (ability) => Boolean(ability.every) && ability.kind !== 'burn';

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
    // Seconds towards each clock ability's next go, one timer per ability.
    timers: Object.fromEntries(spec.abilities.filter(isClock).map((a) => [a.kind, 0])),
    burn: null,        // { left, next, damage, every, from } while burning
    launched: null,    // { from, damage } while flying at a wall
    undying: false,    // Undyne after she has come back
    undyingRolled: false,
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
    summons: [],       // Whis, while he is here
    shots: [],         // Reversal Red, while in flight
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

const announce = (fight, who, name) => {
  fight.events.push({ kind: 'ability', uid: who.uid, name });
  say(fight, `${who.name}: ${name}`, { side: who.side });
};

export const pressureAt = (time) => 1 + Math.max(0, time - PRESSURE_FROM) * PRESSURE_RATE;

/* ---------------------------------------------------------------- damage */

/** Undyne coming back as Undyne the Undying. */
export function becomeUndying(who) {
  const ability = abilityOf(who, 'undying');
  who.undying = true;
  who.undyingRolled = true;
  who.name = ability.name;
  who.maxHp = ability.hp;
  who.hp = ability.hp;
  who.burn = null;
}

/**
 * Puts damage on a fighter. An attack that reaches a fighter with dodges left
 * misses and uses one up - Sans: one health, and the first twenty-four things
 * that come at him go nowhere. A fighter that runs out may get one more go:
 * Undyne rolls, once, to come back undying.
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
    const ability = abilityOf(target, 'undying');
    if (ability && !target.undyingRolled) {
      target.undyingRolled = true;
      if (fight.random() < ability.chance) {
        becomeUndying(target);
        fight.events.push({ kind: 'undying', uid: target.uid });
        say(fight, 'Undyne refuses to die', { side: target.side });
        return dealt;
      }
    }
    target.hp = 0;
    target.burn = null;
    target.launched = null;
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

/**
 * One hit landed by `from` on `to`, with whatever `from` adds on a hit:
 * Saitama's Serious Punch, Garou's second hit, Ralsei's burn.
 */
export function strike(fight, from, to, amount) {
  const punch = abilityOf(from, 'instakill');
  if (punch && fight.random() < punch.chance) {
    announce(fight, from, punch.name);
    // Everything it has. A dodge still eats it, and Undyne still gets her roll.
    return hurt(fight, to, to.hp + 100000, { from, kind: 'instakill' });
  }
  let dealt = hurt(fight, to, amount, { from });
  const twice = abilityOf(from, 'double');
  if (twice && to.hp > 0 && fight.random() < twice.chance) {
    announce(fight, from, twice.name);
    dealt += hurt(fight, to, amount, { from });
  }
  const burn = abilityOf(from, 'burn');
  if (burn && to.hp > 0 && fight.random() < burn.chance) {
    // A fresh burn replaces one already going, back to the full fifteen.
    to.burn = { left: burn.lasts, next: burn.every, every: burn.every, damage: burn.damage, from };
    announce(fight, from, burn.name);
  }
  return dealt;
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
  const aura = abilityOf(foe, 'infinity');
  if (!aura || foe.hp <= 0) return CRUISE;
  const dist = Math.hypot(foe.x - who.x, foe.y - who.y);
  return dist <= aura.range ? CRUISE * aura.slow : CRUISE;
}

export const inInfinity = (who, foe) => speedFor(who, foe) < CRUISE;

/**
 * Moves one ball: lean towards the other, keep cruising, stay in the box.
 * Returns true if it hit a wall. A ball Sans has thrown flies straight and
 * fast, ignoring everything, until it does.
 */
export function move(who, foe, dt) {
  const flying = Boolean(who.launched);
  if (!flying) {
    if (foe) {
      const dx = foe.x - who.x;
      const dy = foe.y - who.y;
      const dist = Math.hypot(dx, dy) || 1;
      who.vx += (dx / dist) * CRUISE * HOMING * dt;
      who.vy += (dy / dist) * CRUISE * HOMING * dt;
    }
    setSpeed(who, speedFor(who, foe));
  }
  who.x += who.vx * dt;
  who.y += who.vy * dt;

  const r = who.radius;
  let wall = false;
  if (who.x < BOX.x + r) { who.x = BOX.x + r; who.vx = Math.abs(who.vx); wall = true; }
  if (who.x > BOX.x + BOX.w - r) { who.x = BOX.x + BOX.w - r; who.vx = -Math.abs(who.vx); wall = true; }
  if (who.y < BOX.y + r) { who.y = BOX.y + r; who.vy = Math.abs(who.vy); wall = true; }
  if (who.y > BOX.y + BOX.h - r) { who.y = BOX.y + BOX.h - r; who.vy = -Math.abs(who.vy); wall = true; }
  return wall;
}

/** The shared part of any collision: push apart, swap motion along the line. */
function separate(a, b) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dist = Math.hypot(dx, dy);
  if (dist < 1e-6) { dx = 1; dy = 0; dist = 1; }
  const nx = dx / dist;
  const ny = dy / dist;
  const approachA = Math.max(0, a.vx * nx + a.vy * ny);
  const approachB = Math.max(0, -(b.vx * nx + b.vy * ny));
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
  return { approachA, approachB };
}

const roll = (fight) => 1 - BUMP_SPREAD + fight.random() * BUMP_SPREAD * 2;

/**
 * Two fighters meeting. Each takes damage; the one moving into the other more
 * takes less, lands first, and a fighter knocked out by that hit never gets
 * its own in.
 */
export function bump(fight, a, b) {
  const { approachA, approachB } = separate(a, b);
  if (a.hitLock > 0 || b.hitLock > 0) return null;
  a.hitLock = HIT_LOCK;
  b.hitLock = HIT_LOCK;

  const total = approachA + approachB || 1;
  const pressure = pressureAt(fight.time);
  const share = (approach) => clamp(approach / total, 0.25, 0.75) * 2;
  const toB = BUMP_DAMAGE * share(approachA) * roll(fight) * pressure * fight.sides[a.side].scale;
  const toA = BUMP_DAMAGE * share(approachB) * roll(fight) * pressure * fight.sides[b.side].scale;

  fight.sinceBump = 0;
  fight.events.push({ kind: 'bump', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const aFirst = approachA > approachB || (approachA === approachB && fight.random() < 0.5);
  const [first, second, toSecond, toFirst] = aFirst ? [a, b, toB, toA] : [b, a, toA, toB];
  strike(fight, first, second, toSecond);
  if (second.hp > 0) strike(fight, second, first, toFirst);
  return { toA, toB };
}

/** Whis meeting the enemy: he deals a bump's worth and takes nothing. */
export function summonBump(fight, summon, foe) {
  separate(summon, foe);
  if (summon.hitLock > 0 || foe.launched) return 0;
  summon.hitLock = HIT_LOCK;
  const amount = BUMP_DAMAGE * roll(fight) * pressureAt(fight.time) * fight.sides[summon.side].scale;
  fight.events.push({ kind: 'bump', x: (summon.x + foe.x) / 2, y: (summon.y + foe.y) / 2 });
  return hurt(fight, foe, amount, { from: summon.owner, kind: 'whis' });
}

/* -------------------------------------------------------------- abilities */

/** Picks a spot in the box at least TELEPORT_CLEAR from the enemy. */
function clearSpot(fight, who, foe) {
  const r = who.radius;
  for (let tries = 0; tries < 30; tries += 1) {
    const x = BOX.x + r + fight.random() * (BOX.w - r * 2);
    const y = BOX.y + r + fight.random() * (BOX.h - r * 2);
    if (!foe || Math.hypot(foe.x - x, foe.y - y) >= TELEPORT_CLEAR) return { x, y };
  }
  return { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 };
}

/**
 * Abilities on a clock. Only the two in the box tick - a fighter waiting on
 * the bench is not doing anything yet.
 */
function tickAbilities(fight, who, foe, dt) {
  if (who.hp <= 0) return;
  for (const ability of abilitiesOf(who)) {
    if (!isClock(ability)) continue;
    who.timers[ability.kind] = (who.timers[ability.kind] || 0) + dt;
    if (who.timers[ability.kind] < ability.every) continue;
    who.timers[ability.kind] -= ability.every;
    useAbility(fight, who, foe, ability);
  }
}

/** One clock ability going off. */
function useAbility(fight, who, foe, ability) {
  if (ability.kind === 'regen') {
    const given = heal(fight, who, who.maxHp * ability.share);
    if (given > 0) say(fight, `${who.name} heals ${Math.round(given)}`, { side: who.side });
  } else if (ability.kind === 'launch' && foe && foe.hp > 0 && !foe.launched) {
    const angle = fight.random() * Math.PI * 2;
    foe.vx = Math.cos(angle) * LAUNCH_SPEED;
    foe.vy = Math.sin(angle) * LAUNCH_SPEED;
    foe.launched = { from: who, damage: ability.damage };
    announce(fight, who, ability.name);
  } else if (ability.kind === 'teleport') {
    const from = { x: who.x, y: who.y };
    Object.assign(who, clearSpot(fight, who, foe));
    fight.sinceBump = 0;
    fight.events.push({ kind: 'teleport', uid: who.uid, from, to: { x: who.x, y: who.y } });
    announce(fight, who, ability.name);
  } else if (ability.kind === 'summon' && foe) {
    const spot = clearSpot(fight, who, foe);
    fight.summons.push({
      kind: 'whis',
      name: 'Whis',
      side: who.side,
      owner: who,
      x: spot.x, y: spot.y,
      vx: (foe.x - spot.x), vy: (foe.y - spot.y),
      radius: BALL_RADIUS * 0.85,
      hitLock: 0.3,
      left: ability.lasts,
    });
    setSpeed(fight.summons.at(-1), CRUISE);
    announce(fight, who, ability.name);
  } else if (ability.kind === 'shot' && foe && foe.hp > 0) {
    // Aimed at where the enemy is now, not where it is going.
    const dx = foe.x - who.x;
    const dy = foe.y - who.y;
    const d = Math.hypot(dx, dy) || 1;
    fight.shots.push({
      side: who.side,
      owner: who,
      x: who.x + (dx / d) * who.radius,
      y: who.y + (dy / d) * who.radius,
      dx: dx / d,
      dy: dy / d,
      speed: ability.speed,
      length: ability.length,
      damage: ability.damage,
      colour: ability.colour,
      name: ability.name,
    });
    announce(fight, who, ability.name);
  }
}

/**
 * Shots in flight. A shot flies straight until it touches the enemy in the
 * box - then it does its damage, which still goes through `hurt` - or leaves
 * the box. A shot whose fighter has gone flies on regardless.
 */
function tickShots(fight, dt) {
  for (const shot of fight.shots) {
    shot.x += shot.dx * shot.speed * dt;
    shot.y += shot.dy * shot.speed * dt;
    const foe = frontOf(fight, other(shot.side));
    if (foe && foe.hp > 0 && Math.hypot(foe.x - shot.x, foe.y - shot.y) <= foe.radius + 4) {
      shot.spent = true;
      fight.events.push({ kind: 'shot-hit', x: shot.x, y: shot.y, colour: shot.colour });
      hurt(fight, foe, shot.damage * fight.sides[shot.side].scale, { from: shot.owner, kind: 'shot' });
    }
    if (shot.x < BOX.x || shot.x > BOX.x + BOX.w || shot.y < BOX.y || shot.y > BOX.y + BOX.h) shot.spent = true;
  }
  fight.shots = fight.shots.filter((shot) => !shot.spent);
}

function tickBurn(fight, who, dt) {
  const burn = who.burn;
  if (!burn || who.hp <= 0) return;
  burn.next -= dt;
  while (burn.next <= 0 && who.burn) {
    burn.next += burn.every;
    burn.left -= burn.every;
    hurt(fight, who, burn.damage, { from: burn.from, kind: 'burn' });
    if (who.burn && burn.left <= 1e-9) who.burn = null;
  }
}

/**
 * Seconds until a fighter's clock ability goes next - `kind` picks which, and
 * without it the first one it has. Null if it has none.
 */
export function nextAbilityIn(who, kind = null) {
  const ability = kind ? abilityOf(who, kind) : abilitiesOf(who).find(isClock);
  if (!ability || !isClock(ability)) return null;
  return Math.max(0, ability.every - (who.timers[ability.kind] || 0));
}

/** Kept for Sukuna: seconds until he heals next. */
export const nextHealIn = (who) => nextAbilityIn(who, 'regen');

/* -------------------------------------------------------------- the clock */

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
  // Whis leaves with Beerus.
  fight.summons = fight.summons.filter((s) => s.owner.hp > 0);
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
    for (const [who, foe] of [[a, b], [b, a]]) {
      who.hitLock = Math.max(0, who.hitLock - slice);
      tickAbilities(fight, who, foe, slice);
      tickBurn(fight, who, slice);
    }
    for (const side of ['a', 'b']) sendNext(fight, side);
    if (checkOver(fight)) break;
    const fa = frontOf(fight, 'a');
    const fb = frontOf(fight, 'b');

    // Break an orbit: point both straight at each other.
    fight.sinceBump += slice;
    if (fight.sinceBump > STALL_AFTER) {
      for (const [who, foe] of [[fa, fb], [fb, fa]]) {
        if (who.launched) continue;
        const d = Math.hypot(foe.x - who.x, foe.y - who.y) || 1;
        who.vx = ((foe.x - who.x) / d) * CRUISE;
        who.vy = ((foe.y - who.y) / d) * CRUISE;
      }
      fight.sinceBump = 0;
    }

    for (const [who, foe] of [[fa, fb], [fb, fa]]) {
      const wall = move(who, foe, slice);
      if (wall && who.launched) {
        const { from, damage } = who.launched;
        who.launched = null;
        setSpeed(who, CRUISE);
        fight.events.push({ kind: 'slam', uid: who.uid, x: who.x, y: who.y });
        hurt(fight, who, damage * pressureAt(fight.time), { from, kind: 'slam' });
      }
    }
    // A thrown ball is out of the fight until it lands.
    if (!fa.launched && !fb.launched && Math.hypot(fb.x - fa.x, fb.y - fa.y) <= fa.radius + fb.radius) {
      bump(fight, fa, fb);
    }

    for (const summon of fight.summons) {
      summon.left -= slice;
      summon.hitLock = Math.max(0, summon.hitLock - slice);
      const foe = frontOf(fight, other(summon.side));
      if (!foe) continue;
      move(summon, foe, slice);
      if (Math.hypot(foe.x - summon.x, foe.y - summon.y) <= summon.radius + foe.radius) summonBump(fight, summon, foe);
    }
    fight.summons = fight.summons.filter((s) => s.left > 0);
    tickShots(fight, slice);
    if (checkOver(fight)) break;
  }
  return fight;
}

export function healthShare(side) {
  const total = side.team.reduce((sum, f) => sum + f.maxHp, 0);
  const left = side.team.reduce((sum, f) => sum + Math.max(0, f.hp), 0);
  return total > 0 ? left / total : 0;
}

const alive = (side) => side.team.filter((f) => f.hp > 0).length;

export function checkOver(fight) {
  if (fight.over) return fight.over;
  const aOut = isBeaten(fight.sides.a);
  const bOut = isBeaten(fight.sides.b);
  if (aOut && bOut) fight.over = { winner: 'draw', reason: 'both out at once' };
  else if (bOut) fight.over = { winner: 'a', reason: 'nobody left to send' };
  else if (aOut) fight.over = { winner: 'b', reason: 'nobody left to send' };
  else if (fight.time >= fight.limit) {
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
