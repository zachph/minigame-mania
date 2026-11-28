import { clamp } from '../../core/utils.js';
import {
  BALL_RADIUS,
  BIG_BLAST_WIDTH,
  BLASTER_SPOTS,
  BLAST_WIDTH,
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

/** Whether a fighter is in the middle of his Last Attack. */
export const inFinale = (fight, who) => fight.finales.some((f) => f.owner === who) || fight.converges.some((c) => c.owner === who);

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
    dash: null,        // Garou mid-dash: { dx, dy, left, hits, spec }
    windup: null,      // Saitama holding still: { left, hold, spec }
    undying: false,    // Undyne after she has come back
    undyingRolled: false,
    form: null,        // Goku's transformation: { id, name, power, regen, colour }
    formLevel: -1,     // how far up his forms he has gone; Ultra Instinct is past the end
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

export function createFight({ a, b, scaleA = 1, scaleB = 1, random = Math.random, limit = FIGHT_LIMIT, asks = false } = {}) {
  const fight = {
    random,
    limit,
    // Whether a player is there to answer Gojo's question. With nobody to
    // ask - simulations, tests - the answer counts as wrong.
    asks,
    pending: null,     // Gojo's Domain Expansion, waiting on the player's answer
    time: 0,
    sides: {
      a: { team: makeTeam(a, 'a'), front: 0, scale: scaleA },
      b: { team: makeTeam(b, 'b'), front: 0, scale: scaleB },
    },
    summons: [],       // Whis, while he is here
    helpers: [],       // Vegeta, once Goku is out: a second fighter for that side
    shots: [],         // Reversal Red, while in flight
    blasters: [],      // Gaster Blasters, while firing
    runs: [],          // Gaster Blaster runs in progress: which blast is next
    waves: [],         // Bone Waves, while they sweep
    finales: [],       // Sans's Last Attack, while he does it
    converges: [],     // the Roaring Knight's final attack, while it goes on
    swords: [],        // the Roaring Knight's swords: warning, then the strike
    swordRuns: [],     // swords still to come in a run
    spikes: [],        // bones jutting from a wall where someone was slammed
    volleys: [],       // Undyne's spears still to throw
    beams: [],         // Kamehameha, while it is firing
    zones: [],         // Hakai squares, while they last
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
/** How hard a fighter's attacks land: Goku's forms multiply everything he does. */
export const powerOf = (who) => who?.form?.power || who?.spec?.power || 1;

/** Goku moves up to whichever form his health has reached - never back down. */
function checkForms(fight, who) {
  const ability = abilityOf(who, 'forms');
  if (!ability || who.hp <= 0) return;
  ability.forms.forEach((form, level) => {
    if (level > who.formLevel && who.hp <= who.maxHp * form.below) {
      who.formLevel = level;
      who.form = form;
    }
  });
  if (who.form && who.form !== who.announcedForm) {
    who.announcedForm = who.form;
    fight.events.push({ kind: 'form', uid: who.uid, form: who.form.id });
    say(fight, `${who.name} goes ${who.form.name}`, { side: who.side });
  }
}

/** The hit that would have knocked Goku out leaves him on 1: Ultra Instinct. */
function goUltra(fight, who, ability) {
  who.hp = 1;
  who.formLevel = ability.forms.length;
  who.form = ability.last;
  who.announcedForm = ability.last;
  who.dodgesLeft = ability.last.dodges;
  fight.events.push({ kind: 'form', uid: who.uid, form: ability.last.id });
  say(fight, `${who.name} survives on 1 - Ultra Instinct`, { side: who.side });
}

/**
 * Sukuna would have knocked Gojo out: off comes the blindfold. Most of the
 * time it is his Domain Expansion - the fight freezes until the player
 * answers. Otherwise he calls it a nice match and stays in on 1.
 */
function takeOffBlindfold(fight, gojo, foe, domain) {
  gojo.blindfoldOff = true;
  gojo.hp = 1;
  fight.events.push({ kind: 'blindfold', uid: gojo.uid });
  if (fight.random() < domain.chance) {
    fight.pending = { kind: 'domain', gojo, foe };
    fight.events.push({ kind: 'domain', uid: gojo.uid });
    announce(fight, gojo, domain.name);
    if (!fight.asks) resolveDomain(fight, false);
  } else {
    fight.events.push({ kind: 'heal', uid: gojo.uid, amount: 1 });
    say(fight, `${gojo.name}: "Nice match."`, { side: gojo.side });
  }
}

/** How long the final attack's blades are, tip to tail. */
export const BLADE_SIZE = 36;

/**
 * The Roaring Knight would have gone down: it stays on 1 and does its final
 * attack. Blades start all round the edge of the box, each aimed at the Knight.
 */
function startConverge(fight, knight, ability) {
  knight.convergeUsed = true;
  knight.hp = 1;
  knight.burn = null;
  const blades = [];
  for (let i = 0; i < ability.blades; i += 1) {
    const angle = (i / ability.blades) * Math.PI * 2;
    blades.push({ angle, dist: CONVERGE_FAR, x: knight.x, y: knight.y, hitIn: false, hitOut: false });
  }
  fight.converges.push({ owner: knight, side: knight.side, ability, phase: 'gather', time: 0, blades });
  fight.events.push({ kind: 'converge', uid: knight.uid });
  announce(fight, knight, ability.name);
}

/** How far out the stars start, and how close in to the Knight they come. */
const CONVERGE_FAR = 460;
const CONVERGE_NEAR = 95;

/**
 * The final attack, a step at a time: stars close in on the Knight from a
 * ring all round it, hang there a moment, then fly back out past where they
 * started. Any star that touches the enemy hurts it once on the way in and
 * once on the way out.
 */
function tickConverges(fight, dt) {
  for (const c of fight.converges) {
    const { owner: knight, ability } = c;
    if (knight.hp <= 0) { c.done = true; continue; }
    c.time += dt;
    const foe = frontOf(fight, other(c.side));
    let dist;
    if (c.phase === 'gather') {
      const t = Math.min(1, c.time / ability.gather);
      dist = CONVERGE_FAR - (CONVERGE_FAR - CONVERGE_NEAR) * (1 - (1 - t) ** 2);
      if (t >= 1) { c.phase = 'hold'; c.time = 0; }
    } else if (c.phase === 'hold') {
      dist = CONVERGE_NEAR;
      if (c.time >= ability.hold) { c.phase = 'scatter'; c.time = 0; }
    } else {
      const t = Math.min(1, c.time / ability.scatter);
      dist = CONVERGE_NEAR + (CONVERGE_FAR * 1.2 - CONVERGE_NEAR) * t ** 1.5;
      if (t >= 1) c.done = true;
    }
    for (const b of c.blades) {
      b.dist = dist;
      b.x = knight.x + Math.cos(b.angle) * dist;
      b.y = knight.y + Math.sin(b.angle) * dist;
    }
    if (!foe || foe.hp <= 0) continue;
    for (const b of c.blades) {
      const key = c.phase === 'scatter' ? 'hitOut' : 'hitIn';
      if (b[key] || Math.hypot(foe.x - b.x, foe.y - b.y) > foe.radius + BLADE_SIZE * 0.6) continue;
      b[key] = true;
      hurt(fight, foe, ability.damage * fight.sides[c.side].scale, { from: knight, kind: 'blade' });
      if (foe.hp <= 0) break;
    }
  }
  fight.converges = fight.converges.filter((c) => !c.done);
}

/** The player's answer is in: right beats Sukuna outright, wrong heals Gojo to full. */
export function resolveDomain(fight, correct) {
  const pending = fight.pending;
  if (!pending) return;
  fight.pending = null;
  const { gojo, foe } = pending;
  fight.events.push({ kind: 'domain-over', uid: gojo.uid, correct });
  if (correct && foe.hp > 0) {
    foe.dodgesLeft = 0;
    hurt(fight, foe, foe.hp + 100000, { from: null, kind: 'domain' });
  } else if (!correct) {
    heal(fight, gojo, gojo.maxHp);
  }
}

export function hurt(fight, target, amount, { from = null, kind = 'bump' } = {}) {
  if (target.hp <= 0 || amount <= 0) return 0;
  amount *= powerOf(from);
  if (inFinale(fight, target)) return 0;      // nothing touches Sans during his Last Attack
  if (target.dodgesLeft > 0) {
    target.dodgesLeft -= 1;
    target.dodged += 1;
    fight.events.push({ kind: 'miss', uid: target.uid, left: target.dodgesLeft });
    const finale = abilityOf(target, 'finale');
    if (finale && !target.finaleUsed && target.dodgesLeft === finale.at) startFinale(fight, target, finale);
    return 0;
  }
  const dealt = Math.round(Math.min(amount, target.hp) * 10) / 10;
  target.hp = Math.round((target.hp - dealt) * 10) / 10;
  target.taken += dealt;
  if (from) from.dealt += dealt;
  fight.events.push({ kind: 'damage', uid: target.uid, amount: dealt, source: kind });

  const converge = abilityOf(target, 'converge');
  if (target.hp <= 0 && converge && !target.convergeUsed) {
    startConverge(fight, target, converge);
    return dealt;
  }
  const domain = abilityOf(target, 'domain');
  if (target.hp <= 0 && domain && !target.blindfoldOff && from?.id === domain.against) {
    takeOffBlindfold(fight, target, from, domain);
    return dealt;
  }
  const forms = abilityOf(target, 'forms');
  if (target.hp <= 0 && forms && target.formLevel < forms.forms.length) {
    goUltra(fight, target, forms);
    return dealt;
  }
  if (target.hp > 0) checkForms(fight, target);
  // A fighter with a second look changes into it at half health, for good.
  if (target.spec.halfHead && target.hp > 0 && target.hp <= target.maxHp / 2) target.halfForm = true;

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
    target.dash = null;
    target.windup = null;
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
  if (who.dash) {
    // Straight and fast - but Infinity halves it, as it halves any attack.
    const speed = who.dash.spec.speed * (speedFor(who, foe) / CRUISE);
    who.vx = who.dash.dx * speed;
    who.vy = who.dash.dy * speed;
    who.dash.left -= dt;
  }
  // Holding still for a windup: going nowhere, unless something throws him.
  if (who.windup && !who.launched && !who.dash) {
    who.vx = 0;
    who.vy = 0;
    return false;
  }
  const flying = Boolean(who.launched) || Boolean(who.dash);
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
  // During Sans's Last Attack bumps just bounce: he is busy, and nothing touches him.
  if (inFinale(fight, a) || inFinale(fight, b)) return null;
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
  if (inFinale(fight, who)) return;           // all he is doing is the Last Attack
  for (const ability of abilitiesOf(who)) {
    if (!isClock(ability)) continue;
    // A run of blasts holds the clock: the 8 seconds start when it is over.
    if (ability.kind === 'blaster' && fight.runs.some((run) => run.owner === who)) continue;
    who.timers[ability.kind] = (who.timers[ability.kind] || 0) + dt;
    if (who.timers[ability.kind] < ability.every) continue;
    who.timers[ability.kind] -= ability.every;
    useAbility(fight, who, foe, ability);
  }
}

/** One clock ability going off. */
function useAbility(fight, who, foe, ability) {
  if (ability.kind === 'forms') {
    if (who.form) heal(fight, who, who.form.regen);
  } else if (ability.kind === 'regen') {
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
  } else if (ability.kind === 'slash' && foe && foe.hp > 0) {
    // Long range: reaches the enemy anywhere in the box, instantly.
    announce(fight, who, ability.name);
    fight.events.push({ kind: 'slash', uid: foe.uid, x: foe.x, y: foe.y });
    hurt(fight, foe, ability.damage * fight.sides[who.side].scale, { from: who, kind: 'slash' });
  } else if (ability.kind === 'blaster' && foe && foe.hp > 0) {
    fight.runs.push({ owner: who, side: who.side, ability, step: -1, stepLeft: 0 });
    announce(fight, who, ability.name);
  } else if (ability.kind === 'bones' && foe && foe.hp > 0) {
    fight.waves.push({
      side: who.side,
      owner: who,
      lasts: ability.lasts,
      left: ability.lasts,
      next: ability.tick,
      tick: ability.tick,
      damage: ability.damage,
      from: fight.random() < 0.5 ? 'left' : 'right',
    });
    announce(fight, who, ability.name);
  } else if (ability.kind === 'swords' && foe && foe.hp > 0) {
    fight.swordRuns.push({ owner: who, side: who.side, ability, left: ability.count, next: 0, spin: fight.random() * Math.PI * 2 });
    announce(fight, who, ability.name);
  } else if (ability.kind === 'barrage' && foe && foe.hp > 0) {
    // One missile out in every direction, evenly round the circle.
    for (let i = 0; i < ability.count; i += 1) {
      const angle = (i / ability.count) * Math.PI * 2;
      fireShotAlong(fight, who, Math.cos(angle), Math.sin(angle), ability);
    }
    announce(fight, who, ability.name);
  } else if (ability.kind === 'shot' && foe && foe.hp > 0) {
    fireShot(fight, who, foe, ability);
    announce(fight, who, ability.name);
  } else if (ability.kind === 'zone' && foe && foe.hp > 0) {
    // Comes down where the enemy is now, and stays there - kept inside the box.
    const half = ability.stages[0].size / 2;
    fight.zones.push({
      side: who.side,
      owner: who,
      x: clamp(foe.x, BOX.x + Math.min(half, BOX.w / 2), BOX.x + BOX.w - Math.min(half, BOX.w / 2)),
      y: clamp(foe.y, BOX.y + Math.min(half, BOX.h / 2), BOX.y + BOX.h - Math.min(half, BOX.h / 2)),
      stages: ability.stages,
      stage: 0,
      stageLeft: ability.stages[0].lasts,
      next: ability.tick,
      tick: ability.tick,
      damage: ability.damage,
      colour: ability.colour,
    });
    announce(fight, who, ability.name);
  } else if (ability.kind === 'windup' && foe && foe.hp > 0) {
    who.windup = { left: ability.hold, hold: ability.hold, spec: ability };
    who.vx = 0;
    who.vy = 0;
    announce(fight, who, ability.name);
  } else if (ability.kind === 'dash' && foe && foe.hp > 0 && !who.launched) {
    startDash(who, foe, ability, 0);
    announce(fight, who, ability.name);
  } else if (ability.kind === 'beam' && foe && foe.hp > 0) {
    fight.beams.push({
      side: who.side,
      owner: who,
      lasts: ability.lasts,
      left: ability.lasts,
      next: ability.tick,
      tick: ability.tick,
      damage: ability.damage,
      colour: ability.colour,
      width: ability.width || 1,
    });
    announce(fight, who, ability.name);
  } else if (ability.kind === 'volley' && foe && foe.hp > 0) {
    // The first goes now; the rest follow one at a time in tickVolleys.
    fight.volleys.push({ owner: who, side: who.side, left: ability.count, next: 0, gap: ability.gap, shot: { ...ability.shot, name: ability.name } });
    announce(fight, who, ability.name);
  }
}

/**
 * A fighter holding still before letting go: when the hold runs out, the
 * thing it was holding is thrown at the enemy as it is at that moment.
 */
function tickWindup(fight, who, foe, dt) {
  if (!who.windup || who.hp <= 0) return;
  who.windup.left -= dt;
  if (who.windup.left > 0) return;
  const { spec } = who.windup;
  who.windup = null;
  if (foe && foe.hp > 0) fireShot(fight, who, foe, { ...spec.shot, name: spec.name });
}

/** Points a dash straight at where the enemy is now, not where it is going. */
function startDash(who, foe, spec, hits) {
  const dx = foe.x - who.x;
  const dy = foe.y - who.y;
  const d = Math.hypot(dx, dy) || 1;
  who.dash = { dx: dx / d, dy: dy / d, left: spec.reach, hits, spec };
  who.vx = (dx / d) * spec.speed;
  who.vy = (dy / d) * spec.speed;
}

/**
 * A dash landing: 10, a knockback, and - if the hit got through and there is
 * room for another - straight after them again. A dodged one ends it.
 */
function dashHit(fight, who, foe) {
  const { spec, dx, dy } = who.dash;
  const hits = who.dash.hits + 1;
  const dealt = hurt(fight, foe, spec.damage * fight.sides[who.side].scale, { from: who, kind: 'dash' });
  fight.events.push({ kind: 'bump', x: (who.x + foe.x) / 2, y: (who.y + foe.y) / 2 });
  fight.sinceBump = 0;
  if (dealt <= 0 || foe.hp <= 0) { endDash(who); return; }
  // Knocked back the way the dash was going, flying until a wall stops it.
  foe.launched = { from: who, damage: 0 };
  foe.vx = dx * spec.knockback;
  foe.vy = dy * spec.knockback;
  if (hits >= spec.maxHits) { endDash(who); return; }
  startDash(who, foe, spec, hits);
}

function endDash(who) {
  who.dash = null;
  who.hitLock = HIT_LOCK;
  setSpeed(who, CRUISE);
}

/** Throws one shot at where the enemy is now, not where it is going. */
function fireShot(fight, who, foe, spec) {
  fireShotAlong(fight, who, foe.x - who.x, foe.y - who.y, spec);
}

/** A shot from a fighter in a set direction, aimed or not. */
function fireShotAlong(fight, who, dx, dy, spec) {
  const d = Math.hypot(dx, dy) || 1;
  fight.shots.push({
    side: who.side,
    owner: who,
    x: who.x + (dx / d) * who.radius,
    y: who.y + (dy / d) * who.radius,
    dx: dx / d,
    dy: dy / d,
    speed: spec.speed,
    length: spec.length,
    damage: spec.damage,
    colour: spec.colour,
    name: spec.name,
    style: spec.style || 'beam',
    size: spec.size || 4,
    burns: Boolean(spec.burns),
  });
}

/**
 * Volleys being thrown: one shot every `gap` seconds until all are gone, each
 * aimed at the enemy as it is at that moment. A volley stops when its thrower
 * goes down; spears already in the air keep going.
 */
function tickVolleys(fight, dt) {
  for (const volley of fight.volleys) {
    volley.next -= dt;
    while (volley.next <= 1e-9 && volley.left > 0) {
      volley.next += volley.gap;
      volley.left -= 1;
      const foe = frontOf(fight, other(volley.side));
      if (foe && foe.hp > 0 && volley.owner.hp > 0) fireShot(fight, volley.owner, foe, volley.shot);
    }
  }
  fight.volleys = fight.volleys.filter((v) => v.left > 0 && v.owner.hp > 0);
}

/** How long the bones stay out of a wall after a slam. */
export const SPIKE_TIME = 0.45;

/** Sans's Last Attack starts: he says so, and the slams begin. */
function startFinale(fight, who, ability) {
  who.finaleUsed = true;
  fight.finales.push({ owner: who, side: who.side, ability, phase: 'slams', left: 0, slams: ability.slams, ring: ability.ring, angle: 0 });
  fight.events.push({ kind: 'finale', uid: who.uid });
  announce(fight, who, ability.name);
}

/**
 * The Last Attack, a step at a time: first the slams - the enemy thrown
 * straight at a wall, again and again, bones jutting out where they land -
 * then a ring of Gaster Blasters round them, firing one after another.
 * When the last blaster has gone, Sans is tired, and it is over.
 */
function tickFinales(fight, dt) {
  fight.spikes = fight.spikes.filter((spike) => (spike.left -= dt) > 0);
  for (const finale of fight.finales) {
    const { ability, owner } = finale;
    const foe = frontOf(fight, other(finale.side));
    finale.left -= dt;
    if (owner.hp <= 0) { finale.done = true; continue; }
    if (finale.left > 0) continue;
    if (finale.phase === 'slams') {
      if (finale.slams <= 0) { finale.phase = 'ring'; finale.angle = fight.random() * Math.PI * 2; continue; }
      if (!foe || foe.hp <= 0 || foe.launched) { finale.left = 0.05; continue; }
      const walls = [['left', -1, 0], ['right', 1, 0], ['up', 0, -1], ['down', 0, 1]];
      const [wall, dx, dy] = walls[Math.floor(fight.random() * walls.length)];
      foe.dash = null;
      foe.windup = null;
      foe.vx = dx * ability.slamSpeed;
      foe.vy = dy * ability.slamSpeed;
      foe.launched = { from: owner, damage: ability.slamDamage };
      foe.slamWall = wall;
      finale.slams -= 1;
      finale.left = ability.slamGap;
    } else if (finale.phase === 'ring') {
      if (finale.ring <= 0) {
        if (!fight.blasters.some((b) => b.finale === finale)) {
          finale.done = true;
          say(fight, `${owner.name} is tired`, { side: owner.side });
        } else finale.left = 0.1;
        continue;
      }
      if (!foe || foe.hp <= 0) { finale.left = 0.1; continue; }
      // Each blaster sits on a circle round the enemy and fires through them.
      const k = ability.ring - finale.ring;
      const angle = finale.angle + (k * Math.PI * 2) / ability.ring;
      const inBox = (x, y) => ({
        x: clamp(x, BOX.x + BLASTER_INSET, BOX.x + BOX.w - BLASTER_INSET),
        y: clamp(y, BOX.y + BLASTER_INSET, BOX.y + BOX.h - BLASTER_INSET),
      });
      const start = inBox(foe.x + Math.cos(angle) * ability.ringRadius, foe.y + Math.sin(angle) * ability.ringRadius);
      const end = inBox(foe.x - Math.cos(angle) * ability.ringRadius, foe.y - Math.sin(angle) * ability.ringRadius);
      fight.blasters.push({
        side: finale.side, owner, finale, start, end, big: false, width: BLAST_WIDTH,
        damage: ability.damage, left: ability.ringLasts, next: ability.tick, tick: ability.tick,
      });
      finale.ring -= 1;
      finale.left = ability.ringGap;
    }
  }
  fight.finales = fight.finales.filter((f) => !f.done);
}

/** Where a sword lands: a line right across the box, through a point, at an angle. */
export function swordLine(x, y, angle) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const reach = (sx, sy) => {
    let t = Infinity;
    if (sx > 0) t = Math.min(t, (BOX.x + BOX.w - x) / sx);
    if (sx < 0) t = Math.min(t, (BOX.x - x) / sx);
    if (sy > 0) t = Math.min(t, (BOX.y + BOX.h - y) / sy);
    if (sy < 0) t = Math.min(t, (BOX.y - y) / sy);
    return Number.isFinite(t) ? t : 0;
  };
  const back = reach(-dx, -dy);
  const on = reach(dx, dy);
  return { x1: x - dx * back, y1: y - dy * back, x2: x + dx * on, y2: y + dy * on };
}

/** How wide a sword is, for hitting. */
export const SWORD_WIDTH = 26;

/** Whether a fighter is touching a sword's line. */
export function onSword(sword, who) {
  const dx = sword.x2 - sword.x1;
  const dy = sword.y2 - sword.y1;
  const t = clamp(((who.x - sword.x1) * dx + (who.y - sword.y1) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(who.x - (sword.x1 + dx * t), who.y - (sword.y1 + dy * t)) <= who.radius + SWORD_WIDTH / 2;
}

/**
 * Sword Dance. A run puts swords down one after another round the outside of
 * the box, each pointing in through wherever the enemy is at that moment. A
 * sword waits, pointing, then slashes straight across; whatever it touches as
 * it does loses a quarter of its health (a dodge still saves Sans).
 */
function tickSwords(fight, dt) {
  for (const run of fight.swordRuns) {
    run.next -= dt;
    const foe = frontOf(fight, other(run.side));
    while (run.next <= 0 && run.left > 0 && run.owner.hp > 0) {
      run.next += run.ability.gap;
      run.left -= 1;
      if (!foe || foe.hp <= 0) continue;
      // Round the outside of the box, a different side each time, pointing in
      // through the enemy.
      const k = run.ability.count - run.left - 1;
      const around = run.spin + (k * Math.PI * 2) / run.ability.count;
      const cx = BOX.x + BOX.w / 2;
      const cy = BOX.y + BOX.h / 2;
      const angle = Math.atan2(foe.y - (cy + Math.sin(around) * BOX.h), foe.x - (cx + Math.cos(around) * BOX.w));
      fight.swords.push({
        owner: run.owner, side: run.side, ...swordLine(foe.x, foe.y, angle),
        warn: run.ability.warn, strike: run.ability.strike, share: run.ability.share, struck: false, hit: false,
      });
    }
  }
  fight.swordRuns = fight.swordRuns.filter((r) => r.left > 0 && r.owner.hp > 0);

  for (const sword of fight.swords) {
    if (sword.warn > 0) { sword.warn -= dt; continue; }
    sword.struck = true;
    sword.strike -= dt;
    const foe = frontOf(fight, other(sword.side));
    if (!sword.hit && foe && foe.hp > 0 && onSword(sword, foe)) {
      sword.hit = true;
      hurt(fight, foe, foe.maxHp * sword.share, { from: sword.owner, kind: 'sword' });
    }
  }
  fight.swords = fight.swords.filter((s) => s.strike > 0 && s.owner.hp > 0);
}

/**
 * A Gaster Blaster run: each step puts its blasts up for its time, then the
 * next step's go up. A run ends with its last step, or with Sans.
 */
function tickRuns(fight, dt) {
  for (const run of fight.runs) {
    run.stepLeft -= dt;
    if (run.stepLeft > 1e-9) continue;
    run.step += 1;
    const step = run.ability.steps[run.step];
    if (!step) { run.done = true; continue; }
    run.stepLeft += step.lasts;
    for (const blast of step.blasts) {
      fight.blasters.push({
        side: run.side,
        owner: run.owner,
        from: blast.from,
        to: blast.to,
        big: Boolean(blast.big),
        width: blast.width,
        damage: blast.damage,
        left: step.lasts,
        next: run.ability.tick,
        tick: run.ability.tick,
      });
    }
  }
  fight.runs = fight.runs.filter((run) => !run.done && run.owner.hp > 0);
}

/** How far blaster spots sit in from the walls: half a beam, so a wall beam runs along the wall. */
export const BLASTER_INSET = BLAST_WIDTH / 2;

/** How thick a blast's beam is. */
export const beamWidth = (blaster) => blaster.width || (blaster.big ? BIG_BLAST_WIDTH : BLAST_WIDTH);

/** Where a spot named in BLASTER_SPOTS is in the box. */
export function blasterSpot(name) {
  const [fx, fy] = BLASTER_SPOTS[name] || BLASTER_SPOTS.middle;
  const x = BOX.x + BLASTER_INSET + fx * (BOX.w - 2 * BLASTER_INSET);
  const y = BOX.y + BLASTER_INSET + fy * (BOX.h - 2 * BLASTER_INSET);
  return { x, y };
}

/** A blast's beam: from its blaster to where it fires, and which way it points. */
export function beamLine(blaster) {
  const start = blaster.start || blasterSpot(blaster.from);
  const end = blaster.end || blasterSpot(blaster.to);
  return { start, end, angle: Math.atan2(end.y - start.y, end.x - start.x) };
}

/** Whether a fighter is touching a blast's beam. */
export function onBeam(blaster, who) {
  const { start, end } = beamLine(blaster);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const t = clamp(((who.x - start.x) * dx + (who.y - start.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  const gap = Math.hypot(who.x - (start.x + dx * t), who.y - (start.y + dy * t));
  const half = beamWidth(blaster) / 2;
  return gap <= BALL_RADIUS + half;
}

/**
 * Blasts firing. Each beam stays where it was put and does its damage once a
 * tick to whoever for the other side is in it. Sans can dodge any attack, so
 * against him each tick that catches him costs a dodge. A blast goes when its
 * time is up, or when Sans does.
 */
function tickBlasters(fight, dt) {
  for (const blaster of fight.blasters) {
    blaster.left -= dt;
    blaster.next -= dt;
    const foe = frontOf(fight, other(blaster.side));
    while (blaster.next <= 1e-9 && blaster.left > -1e-9) {
      blaster.next += blaster.tick;
      if (foe && foe.hp > 0 && onBeam(blaster, foe)) {
        hurt(fight, foe, blaster.damage * fight.sides[blaster.side].scale, { from: blaster.owner, kind: 'blaster' });
      }
    }
  }
  fight.blasters = fight.blasters.filter((b) => b.left > 1e-9 && b.owner.hp > 0);
}

/**
 * The Bone Wave's shape: a long row of bones from the floor and the ceiling
 * sliding across the box, with a gap between them that weaves up and down.
 * Only a fighter touching a bone is hurt; one in the gap goes untouched.
 */
export const BONE_SPACING = 22;          // between one bone and the next
export const BONE_GAP = 112;             // the gap's height: room for a fighter, just
export const BONE_TRAIN = 1150;          // how long the row of bones is
export const BONE_WEAVES = 2.5;          // how many times the gap goes up and down along it
const BONE_SWING = (BOX.h - BONE_GAP) / 2 - 16;

/** How far the front of the row has come into the box. */
export const boneHead = (wave) => (1 - wave.left / wave.lasts) * (BOX.w + BONE_TRAIN);

/** How far back along the row the bone at x is, or null where there are no bones. */
export function boneAt(wave, x) {
  const along = wave.from === 'left' ? x - BOX.x : BOX.x + BOX.w - x;
  const back = boneHead(wave) - along;
  return back >= 0 && back <= BONE_TRAIN ? back : null;
}

/** Where the middle of the gap is, that far back along the row. */
export const boneGapAt = (back) => BOX.y + BOX.h / 2 + BONE_SWING * Math.sin((back / BONE_TRAIN) * Math.PI * 2 * BONE_WEAVES);

/** Whether a fighter is touching a bone. */
export function inBones(wave, who) {
  for (const dx of [-BALL_RADIUS * 0.8, 0, BALL_RADIUS * 0.8]) {
    const back = boneAt(wave, who.x + dx);
    if (back == null) continue;
    if (Math.abs(who.y - boneGapAt(back)) > BONE_GAP / 2 - BALL_RADIUS) return true;
  }
  return false;
}

/**
 * Bone Waves sweeping: once a tick, whoever for the other side is touching
 * a bone takes the damage. Sans dodges each one, as he dodges anything.
 */
function tickWaves(fight, dt) {
  for (const wave of fight.waves) {
    wave.left -= dt;
    wave.next -= dt;
    const foe = frontOf(fight, other(wave.side));
    while (wave.next <= 1e-9 && wave.left > -1e-9) {
      wave.next += wave.tick;
      if (foe && foe.hp > 0 && inBones(wave, foe)) hurt(fight, foe, wave.damage * fight.sides[wave.side].scale, { from: wave.owner, kind: 'bones' });
    }
  }
  fight.waves = fight.waves.filter((w) => w.left > 1e-9 && w.owner.hp > 0);
}

/**
 * Beams firing from their fighter, locked on to whoever is in front for the
 * other side: damage once a tick until the beam runs out or its fighter goes
 * down. Sans dodges each tick, as he dodges anything.
 */
function tickBeams(fight, dt) {
  for (const beam of fight.beams) {
    beam.left -= dt;
    beam.next -= dt;
    const foe = frontOf(fight, other(beam.side));
    while (beam.next <= 1e-9 && beam.left > -1e-9) {
      beam.next += beam.tick;
      if (foe && foe.hp > 0) hurt(fight, foe, beam.damage * fight.sides[beam.side].scale, { from: beam.owner, kind: 'beam' });
    }
  }
  fight.beams = fight.beams.filter((b) => b.left > 1e-9 && b.owner.hp > 0);
}

/** The side of a zone square right now, or 0 once it has run out. */
export const zoneSize = (zone) => zone.stages[zone.stage]?.size || 0;

/** True when a fighter is touching a zone square at all. */
export function inZone(zone, who) {
  const half = zoneSize(zone) / 2;
  const nearX = clamp(who.x, zone.x - half, zone.x + half);
  const nearY = clamp(who.y, zone.y - half, zone.y + half);
  return Math.hypot(who.x - nearX, who.y - nearY) <= who.radius;
}

/**
 * Hakai squares. Each shrinks a stage at a time and does its damage every
 * tick to the enemy, but only while they are in it - a square does not
 * follow anyone, so it can be walked out of, and it gets easier the smaller
 * it gets. Gone after its last stage, or when Beerus is.
 */
function tickZones(fight, dt) {
  for (const zone of fight.zones) {
    zone.stageLeft -= dt;
    while (zone.stageLeft <= 1e-9 && zone.stage < zone.stages.length) {
      zone.stage += 1;
      if (zone.stage < zone.stages.length) zone.stageLeft += zone.stages[zone.stage].lasts;
    }
    if (zone.stage >= zone.stages.length) continue;
    zone.next -= dt;
    const foe = frontOf(fight, other(zone.side));
    while (zone.next <= 1e-9) {
      zone.next += zone.tick;
      if (foe && foe.hp > 0 && inZone(zone, foe)) {
        hurt(fight, foe, zone.damage * fight.sides[zone.side].scale, { from: zone.owner, kind: 'zone' });
      }
    }
  }
  fight.zones = fight.zones.filter((z) => z.stage < z.stages.length && z.owner.hp > 0);
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
    if (foe && foe.hp > 0 && Math.hypot(foe.x - shot.x, foe.y - shot.y) <= foe.radius + (shot.size || 4)) {
      shot.spent = true;
      fight.events.push({ kind: 'shot-hit', x: shot.x, y: shot.y, colour: shot.colour });
      const dealt = hurt(fight, foe, shot.damage * fight.sides[shot.side].scale, { from: shot.owner, kind: 'shot' });
      // A shot that burns sets the owner's burn - but only if it landed, so a
      // dodged Fireball sets nothing alight.
      const burn = abilityOf(shot.owner, 'burn');
      if (shot.burns && burn && dealt > 0 && foe.hp > 0) {
        foe.burn = { left: burn.lasts, next: burn.every, every: burn.every, damage: burn.damage, from: shot.owner };
      }
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
    const before = lane.team[lane.front - 1];
    if (before?.spec.helper && before.hp <= 0) bringHelper(fight, before, next);
    fight.sinceBump = 0;
    fight.events.push({ kind: 'enter', uid: next.uid, side });
    say(fight, `${next.name} steps in`, { side });
  }
  // Whis leaves with Beerus.
  fight.summons = fight.summons.filter((s) => s.owner.hp > 0);
  fight.helpers = fight.helpers.filter((h) => h.hp > 0 && !isBeaten(fight.sides[h.side]));
}

/**
 * Goku is out: Vegeta comes to help whoever stepped in. They split one
 * fighter's health - the newcomer drops to half, Vegeta has the other half.
 * Sans keeps his 1. Only one Vegeta at a time.
 */
function bringHelper(fight, gone, next) {
  if (fight.helpers.some((h) => h.side === next.side && h.hp > 0)) return;
  if (next.maxHp > 1) {
    next.maxHp = Math.round(next.maxHp / 2);
    next.hp = Math.min(next.hp, next.maxHp);
  }
  const helper = makeFighter(gone.spec.helper, { slot: `${gone.slot}h`, side: next.side });
  helper.helps = next;
  const foe = frontOf(fight, other(next.side));
  Object.assign(helper, clearSpot(fight, helper, foe));
  setSpeed(helper, CRUISE);
  helper.entered = true;
  fight.helpers.push(helper);
  fight.events.push({ kind: 'enter', uid: helper.uid, side: next.side });
  say(fight, `${helper.name} comes to help`, { side: next.side });
}

/** Helpers fight beside the front fighter: their own clocks, moving, bumping the enemy. */
function tickHelpers(fight, dt) {
  for (const helper of fight.helpers) {
    if (helper.hp <= 0) continue;
    const foe = frontOf(fight, other(helper.side));
    if (!foe || foe.hp <= 0) continue;
    helper.hitLock = Math.max(0, helper.hitLock - dt);
    tickAbilities(fight, helper, foe, dt);
    tickBurn(fight, helper, dt);
    move(helper, foe, dt);
    const touching = Math.hypot(foe.x - helper.x, foe.y - helper.y) <= helper.radius + foe.radius;
    if (touching && foe.dash) dashHit(fight, foe, helper);
    else if (touching && !foe.launched) bump(fight, helper, foe);
  }
  fight.helpers = fight.helpers.filter((h) => h.hp > 0);
}

export function stepFight(fight, dt) {
  if (fight.over) return fight;
  // Frozen in the Domain until the player answers.
  if (fight.pending) { fight.events.length = 0; return fight; }
  fight.events.length = 0;
  let left = dt;
  while (left > 1e-9 && !fight.over && !fight.pending) {
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
      tickWindup(fight, who, foe, slice);
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
        if (who.launched || who.dash || who.windup) continue;
        const d = Math.hypot(foe.x - who.x, foe.y - who.y) || 1;
        who.vx = ((foe.x - who.x) / d) * CRUISE;
        who.vy = ((foe.y - who.y) / d) * CRUISE;
      }
      fight.sinceBump = 0;
    }

    for (const [who, foe] of [[fa, fb], [fb, fa]]) {
      const wall = move(who, foe, slice);
      if (who.dash && (wall || who.dash.left <= 0)) endDash(who);
      if (wall && who.launched) {
        const { from, damage } = who.launched;
        who.launched = null;
        setSpeed(who, CRUISE);
        fight.events.push({ kind: 'slam', uid: who.uid, x: who.x, y: who.y });
        if (who.slamWall) { fight.spikes.push({ wall: who.slamWall, left: SPIKE_TIME }); who.slamWall = null; }
        hurt(fight, who, damage * pressureAt(fight.time), { from, kind: 'slam' });
      }
    }
    const touching = Math.hypot(fb.x - fa.x, fb.y - fa.y) <= fa.radius + fb.radius;
    if (touching && fa.dash && !fb.dash) dashHit(fight, fa, fb);
    else if (touching && fb.dash && !fa.dash) dashHit(fight, fb, fa);
    // A thrown ball is out of the fight until it lands.
    else if (touching && !fa.launched && !fb.launched && !fa.dash && !fb.dash) bump(fight, fa, fb);

    tickHelpers(fight, slice);
    if (checkOver(fight)) break;

    for (const summon of fight.summons) {
      summon.left -= slice;
      summon.hitLock = Math.max(0, summon.hitLock - slice);
      const foe = frontOf(fight, other(summon.side));
      if (!foe) continue;
      move(summon, foe, slice);
      if (Math.hypot(foe.x - summon.x, foe.y - summon.y) <= summon.radius + foe.radius) summonBump(fight, summon, foe);
    }
    fight.summons = fight.summons.filter((s) => s.left > 0);
    tickVolleys(fight, slice);
    tickShots(fight, slice);
    tickFinales(fight, slice);
    tickConverges(fight, slice);
    tickSwords(fight, slice);
    tickRuns(fight, slice);
    tickBlasters(fight, slice);
    tickWaves(fight, slice);
    tickBeams(fight, slice);
    tickZones(fight, slice);
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
  while (!fight.over && guard < 100000) {
    if (fight.pending) resolveDomain(fight, false);
    stepFight(fight, step);
    guard += 1;
  }
  return fight.over || checkOver(fight);
}
