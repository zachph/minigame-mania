import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/core/utils.js';
import {
  CHARACTERS,
  DRIFT_SPEED,
  FIELD,
  HIT_FLOOR,
  LADDER,
  getCharacter,
} from '../src/games/bumpers/content.js';
import {
  bounceOffWalls,
  collide,
  overlapping,
  setSpeed,
  shoveFrom,
  speedOf,
  stepMotion,
} from '../src/games/bumpers/physics.js';
import {
  ABILITIES,
  canUseAbility,
  checkOver,
  createFighter,
  createMatch,
  damageFor,
  healthShare,
  spawnPoints,
  stepMatch,
  useAbility,
} from '../src/games/bumpers/rules.js';
import { createBot } from '../src/games/bumpers/ai.js';
import {
  SEAT_TINT,
  drawArena,
  drawBanner,
  drawFighter,
  drawHud,
  drawPopup,
  drawRing,
  drawSpark,
  drawTrail,
} from '../src/games/bumpers/art.js';
import { createFakeContext } from './helpers.js';

const ball = (extra = {}) => ({
  x: 480, y: 300, vx: 0, vy: 0, radius: 20, mass: 1, thrust: 900, top: 380, ...extra,
});

/* -------------------------------------------------------------- physics */

test('a ball bounces back off a wall and stays inside the arena', () => {
  const b = ball({ x: FIELD.x + 5, vx: -400 });
  const impact = bounceOffWalls(b, FIELD);
  assert.equal(impact, 400);
  assert.ok(b.x >= FIELD.x + b.radius, 'pushed back inside');
  assert.ok(b.vx > 0, 'now travelling away from the wall');
  assert.ok(b.vx < 400, 'and a little slower for it');
});

test('a wall it is nowhere near reports no impact', () => {
  const b = ball({ vx: 400 });
  assert.equal(bounceOffWalls(b, FIELD), 0);
});

test('nothing ever comes to a stop', () => {
  const b = ball({ vx: 1, vy: 0 });
  for (let i = 0; i < 200; i += 1) stepMotion(b, { x: 0, y: 0 }, 1 / 60);
  assert.ok(speedOf(b) >= DRIFT_SPEED - 1e-6, `still drifting, got ${speedOf(b)}`);
});

test('steering cannot push you past your own top speed', () => {
  const b = ball({ vx: 10 });
  for (let i = 0; i < 600; i += 1) stepMotion(b, { x: 1, y: 0 }, 1 / 60);
  assert.ok(speedOf(b) <= b.top + 1, `capped near ${b.top}, got ${speedOf(b)}`);
});

test('a dash can fling you past it, because that cap is on your engine', () => {
  const b = ball({ vx: 700 });
  stepMotion(b, { x: 0, y: 0 }, 1 / 60);
  assert.ok(speedOf(b) > b.top, 'still over the cap with no steering');
});

test('setSpeed on a motionless ball picks an axis instead of dividing by zero', () => {
  const b = ball();
  setSpeed(b, 100);
  assert.ok(Number.isFinite(b.vx) && Number.isFinite(b.vy));
  assert.equal(Math.round(speedOf(b)), 100);
});

test('a collision reports only the speed each side carried into it', () => {
  const a = ball({ x: 400, vx: 300 });
  const b = ball({ x: 438, vx: 0 });
  const hit = collide(a, b);
  assert.equal(Math.round(hit.approachA), 300);
  assert.equal(hit.approachB, 0, 'the one standing still brought nothing');
  assert.equal(Math.round(hit.closing), 300);
});

test('a charge hands its momentum over', () => {
  const a = ball({ x: 400, vx: 300 });
  const b = ball({ x: 438, vx: 0 });
  collide(a, b);
  assert.ok(b.vx > 250, 'the one that was hit goes flying');
  assert.ok(a.vx < 60, 'and the one that did it is left slow');
});

test('two balls exactly on top of each other still resolve', () => {
  const a = ball({ x: 480, y: 300 });
  const b = ball({ x: 480, y: 300 });
  const hit = collide(a, b);
  assert.ok(Number.isFinite(hit.nx) && Number.isFinite(hit.ny));
  assert.ok(!overlapping(a, b) || Math.hypot(b.x - a.x, b.y - a.y) > 0);
});

test('a rooted ball gives no ground and takes no push', () => {
  const a = ball({ x: 400, vx: 600 });
  const b = ball({ x: 438, vx: 0, rooted: true, mass: 6 });
  const before = { x: b.x, vx: b.vx };
  collide(a, b);
  assert.equal(b.x, before.x, 'it did not budge');
  assert.equal(b.vx, before.vx, 'and it picked up no speed');
  assert.ok(a.vx < 0, 'the one that hit it came straight back off');
});

test('a shove pushes directly away from the point', () => {
  const b = ball({ x: 500, y: 300 });
  shoveFrom(b, 480, 300, 200);
  assert.equal(Math.round(b.vx), 200);
  assert.equal(Math.round(b.vy), 0);
});

/* --------------------------------------------------------------- damage */

const fighterOf = (id, extra = {}) => Object.assign(createFighter(id, 'a', { x: 0, y: 0 }), extra);

test('a gentle nudge costs nothing', () => {
  const a = fighterOf('pebble');
  const b = fighterOf('pebble');
  assert.equal(damageFor(a, b, HIT_FLOOR - 1), 0);
});

test('the one who brought the speed is the one who deals the hit', () => {
  const charger = fighterOf('pebble');
  const drifter = fighterOf('pebble');
  assert.ok(damageFor(charger, drifter, 400) > 0);
  assert.equal(damageFor(drifter, charger, 0), 0, 'bringing nothing deals nothing');
});

test('arriving twice as fast hurts more than twice as much', () => {
  const a = fighterOf('pebble');
  const b = fighterOf('pebble');
  const slow = damageFor(a, b, 200);
  const fast = damageFor(a, b, 400);
  assert.ok(fast > slow * 2, `${fast} should beat twice ${slow}`);
});

test('being heavier than what you hit scales the damage up, but only so far', () => {
  const heavy = fighterOf('boulder');
  const light = fighterOf('zip');
  const even = fighterOf('pebble');
  const onLight = damageFor(heavy, light, 300) / heavy.power;
  const onEven = damageFor(heavy, even, 300) / heavy.power;
  assert.ok(onLight > onEven, 'the lighter target takes more');
  assert.ok(onLight / onEven < 1.9, 'and the advantage is capped');
});

test('reeling from a hit, you cannot cash in the speed they gave you', () => {
  const a = fighterOf('pebble');
  const b = fighterOf('pebble');
  const clean = damageFor(a, b, 400);
  a.stagger = 0.5;
  assert.ok(damageFor(a, b, 400) < clean * 0.5, 'a staggered hit is worth far less');
});

test('guarding cuts what you take', () => {
  const a = fighterOf('pebble');
  const b = fighterOf('pebble');
  const open = damageFor(a, b, 400);
  b.guard = 0.5;
  assert.ok(damageFor(a, b, 400) < open);
});

/* ------------------------------------------------------------ abilities */

test('every character carries an ability the rules know how to run', () => {
  for (const spec of CHARACTERS) {
    assert.ok(spec.ability, `${spec.name} has no ability`);
    assert.ok(ABILITIES[spec.ability.kind], `${spec.name} uses an unknown ability: ${spec.ability.kind}`);
    assert.ok(spec.ability.cooldown > 0, `${spec.name}'s ability has no cooldown`);
    assert.ok(spec.ability.name, `${spec.name}'s ability has no name`);
  }
});

test('every rung of the ladder names a character that exists', () => {
  for (const rung of LADDER) {
    assert.doesNotThrow(() => getCharacter(rung.character), `no such fighter: ${rung.character}`);
    assert.ok(rung.skill >= 0 && rung.skill <= 1, 'skill is a 0..1 dial');
  }
});

test('the ladder gets harder, never easier', () => {
  for (let i = 1; i < LADDER.length; i += 1) {
    assert.ok(LADDER[i].skill > LADDER[i - 1].skill, `rung ${i + 1} is not harder than rung ${i}`);
  }
});

test('an unknown ability is a loud failure, not a silent no-op', () => {
  const match = createMatch('pebble', 'pebble');
  match.a.spec = { ...match.a.spec, ability: { kind: 'telekinesis', cooldown: 1, name: 'Nope' } };
  assert.throws(() => useAbility(match, match.a, match.b), /unknown ability/);
});

test('an ability goes on cooldown and will not fire again until it is back', () => {
  const match = createMatch('pebble', 'pebble');
  assert.equal(canUseAbility(match.a), true);
  assert.equal(useAbility(match, match.a, match.b), true);
  assert.equal(canUseAbility(match.a), false);
  assert.equal(useAbility(match, match.a, match.b), false, 'it did not fire twice');
});

test('a dash flings you along the way you were already pointing', () => {
  const match = createMatch('pebble', 'pebble');
  match.a.vx = 100;
  match.a.vy = 0;
  useAbility(match, match.a, match.b);
  assert.equal(Math.round(speedOf(match.a)), match.a.spec.ability.speed);
  assert.ok(match.a.vx > 0, 'and in the same direction');
});

test('Set roots you, then lets go on its own', () => {
  const match = createMatch('boulder', 'pebble');
  useAbility(match, match.a, match.b);
  assert.equal(match.a.rooted, true);
  assert.ok(match.a.mass > match.a.baseMass);
  for (let i = 0; i < 200; i += 1) stepMatch(match, 1 / 60, {});
  assert.equal(match.a.rooted, false, 'it let go');
  assert.equal(match.a.mass, match.a.baseMass, 'and went back to its own weight');
});

test('a shockwave only throws them if they are close enough', () => {
  const near = createMatch('zip', 'pebble');
  near.b.x = near.a.x + 40;
  near.b.y = near.a.y;
  near.b.vx = 0;
  near.b.vy = 0;
  useAbility(near, near.a, near.b);
  assert.ok(near.b.vx > 100, 'the near one got thrown');

  const far = createMatch('zip', 'pebble');
  far.b.x = far.a.x + 600;
  far.b.vx = 0;
  far.b.vy = 0;
  useAbility(far, far.a, far.b);
  assert.equal(far.b.vx, 0, 'the far one was untouched');
});

test('the spare ability kinds all do what they say', () => {
  const match = createMatch('pebble', 'pebble');
  ABILITIES.guard(match, match.a, match.b, { duration: 2 });
  assert.equal(match.a.guard, 2);
  ABILITIES.spikes(match, match.a, match.b, { duration: 3 });
  assert.equal(match.a.spike, 3);
  match.a.hp = 20;
  ABILITIES.mend(match, match.a, match.b, { amount: 1000 });
  assert.equal(match.a.hp, match.a.maxHp, 'mending never overfills');
  match.b.x = match.a.x + 40;
  match.b.y = match.a.y;
  match.b.vx = 0;
  ABILITIES.hook(match, match.a, match.b, { radius: 120, pull: 300 });
  assert.ok(match.b.vx < 0, 'the hook dragged them back towards you');
});

/* ------------------------------------------------------------- a match */

test('both sides start apart, facing in, and inside the arena', () => {
  const [left, right] = spawnPoints(FIELD);
  assert.ok(left.x < right.x);
  for (const spot of [left, right]) {
    assert.ok(spot.x > FIELD.x && spot.x < FIELD.x + FIELD.w);
    assert.ok(spot.y > FIELD.y && spot.y < FIELD.y + FIELD.h);
  }
});

test('a match ends when someone runs out of health', () => {
  const match = createMatch('pebble', 'pebble');
  match.b.hp = 0;
  assert.deepEqual(checkOver(match), { winner: 'a', reason: 'knocked out' });
});

test('running out of time goes to whoever has more health left, as a share', () => {
  const match = createMatch('pebble', 'boulder');
  match.time = match.limit;
  match.a.hp = 60;   // of 100
  match.b.hp = 65;   // of 130, so a smaller share
  assert.equal(checkOver(match).winner, 'a');
});

test('going out together goes to whoever hit harder, not to a draw', () => {
  const match = createMatch('pebble', 'pebble');
  match.a.hp = 0;
  match.b.hp = 0;
  match.a.dealt = 90;
  match.b.dealt = 70;
  assert.equal(checkOver(match).winner, 'a');
});

test('and it is only a draw when there is genuinely nothing in it', () => {
  const match = createMatch('pebble', 'pebble');
  match.a.hp = 0;
  match.b.hp = 0;
  assert.equal(checkOver(match).winner, 'draw');
});

test('a finished match does not keep stepping', () => {
  const match = createMatch('pebble', 'pebble');
  match.b.hp = 0;
  checkOver(match);
  const before = { x: match.a.x, y: match.a.y, time: match.time };
  stepMatch(match, 1 / 60, { a: { x: 1, y: 0 } });
  assert.equal(match.a.x, before.x);
  assert.equal(match.time, before.time);
});

test('health never goes below zero or above the maximum', () => {
  const match = createMatch('zip', 'boulder');
  for (let i = 0; i < 60 * 90 && !match.over; i += 1) {
    stepMatch(match, 1 / 60, { a: { x: 1, y: 0.2 }, b: { x: -1, y: -0.2 } });
    for (const side of ['a', 'b']) {
      assert.ok(match[side].hp >= 0, 'health went negative');
      assert.ok(match[side].hp <= match[side].maxHp, 'health went over the maximum');
      assert.ok(healthShare(match[side]) >= 0 && healthShare(match[side]) <= 1);
    }
  }
});

test('neither ball ever leaves the arena, however hard it is thrown', () => {
  const match = createMatch('zip', 'boulder');
  match.a.vx = 4000;
  match.a.vy = -3200;
  for (let i = 0; i < 60 * 30 && !match.over; i += 1) {
    stepMatch(match, 1 / 60, { a: { x: 1, y: -1 }, b: { x: -1, y: 1 } });
    for (const side of ['a', 'b']) {
      const f = match[side];
      assert.ok(f.x >= FIELD.x - 1 && f.x <= FIELD.x + FIELD.w + 1, `${side} left sideways at ${f.x}`);
      assert.ok(f.y >= FIELD.y - 1 && f.y <= FIELD.y + FIELD.h + 1, `${side} left vertically at ${f.y}`);
    }
  }
});

test('a round always reaches a verdict inside its time limit', () => {
  for (const [x, y] of [['pebble', 'boulder'], ['zip', 'pebble'], ['boulder', 'zip']]) {
    const match = createMatch(x, y);
    const A = createBot('a', 0.5, seededRandom(11));
    const B = createBot('b', 0.5, seededRandom(29));
    let guard = 0;
    while (!match.over && guard < 60 * 200) {
      const dt = 1 / 60;
      stepMatch(match, dt, { a: A.think(match, dt), b: B.think(match, dt) });
      guard += 1;
    }
    assert.ok(match.over, `${x} vs ${y} never finished`);
    assert.ok(match.time <= match.limit + 1, `${x} vs ${y} ran past the limit`);
  }
});

/* ----------------------------------------------------------------- bots */

test('a bot always asks for a steering direction it is allowed to have', () => {
  const match = createMatch('pebble', 'zip');
  const bot = createBot('b', 0.7, seededRandom(5));
  for (let i = 0; i < 400; i += 1) {
    const command = bot.think(match, 1 / 60);
    const length = Math.hypot(command.x, command.y);
    assert.ok(length <= 1.0001, `steering of length ${length}`);
    assert.ok(Number.isFinite(command.x) && Number.isFinite(command.y));
    stepMatch(match, 1 / 60, { b: command });
  }
});

test('the same seed plays the same match twice', () => {
  const play = () => {
    const match = createMatch('pebble', 'boulder');
    const A = createBot('a', 0.6, seededRandom(1234));
    const B = createBot('b', 0.4, seededRandom(5678));
    while (!match.over) {
      const dt = 1 / 60;
      stepMatch(match, dt, { a: A.think(match, dt), b: B.think(match, dt) });
    }
    return `${match.over.winner} ${match.a.hp} ${match.b.hp} ${match.time.toFixed(3)}`;
  };
  assert.equal(play(), play());
});

test('the better bot wins the series', () => {
  let strong = 0;
  let weak = 0;
  for (let seed = 1; seed <= 60; seed += 1) {
    // Swap sides every other fight, so no quirk of one seat can decide it.
    const flip = seed % 2 === 0;
    const match = createMatch('pebble', 'pebble');
    const A = createBot('a', flip ? 0.2 : 0.95, seededRandom(seed * 7919 + 104729));
    const B = createBot('b', flip ? 0.95 : 0.2, seededRandom(seed * 6271 + 982451));
    while (!match.over) {
      const dt = 1 / 60;
      stepMatch(match, dt, { a: A.think(match, dt), b: B.think(match, dt) });
    }
    const strongSide = flip ? 'b' : 'a';
    if (match.over.winner === strongSide) strong += 1;
    else if (match.over.winner !== 'draw') weak += 1;
  }
  assert.ok(strong > weak * 1.6, `the good bot should be well ahead, got ${strong}-${weak}`);
});

/* --------------------------------------------------------------- drawing */

test('every character draws without producing NaN coordinates', () => {
  const ctx = createFakeContext();
  for (const spec of CHARACTERS) {
    const match = createMatch(spec.id, spec.id);
    // Every state that changes how a ball looks, all at once.
    Object.assign(match.a, { rooted: true, dash: 0.3, guard: 1, stagger: 0.5 });
    drawFighter(ctx, match.a, { flash: 0.6, mine: true });
    drawFighter(ctx, match.b, { flash: 0, mine: false });
    drawTrail(ctx, match.a, [{ x: 100, y: 100 }, { x: 140, y: 130 }, { x: 180, y: 160 }]);
  }
  assert.ok(ctx.calls > CHARACTERS.length * 10, 'each ball actually drew something');
});

test('a ball with a face nobody has drawn still turns up as a ball', () => {
  const ctx = createFakeContext();
  const match = createMatch('pebble', 'pebble');
  match.a.spec = { ...match.a.spec, id: 'something-the-user-invented-later' };
  assert.doesNotThrow(() => drawFighter(ctx, match.a, {}));
});

test('the whole scene renders at every stage of a round', () => {
  const ctx = createFakeContext();
  const match = createMatch('zip', 'boulder');
  drawArena(ctx, FIELD, 3.2);
  for (const clock of [60, 8, null]) {
    drawHud(ctx, match, { width: 960, leftLabel: 'You', rightLabel: 'Rung 3/6', clock });
  }
  drawBanner(ctx, 960, 540, '3', 'Boulder, immovable');
  drawBanner(ctx, 960, 540, 'Win');
  drawRing(ctx, { x: 300, y: 300, radius: 60, life: 0.2, maxLife: 0.4, colour: '#fff' });
  drawSpark(ctx, { x: 300, y: 300, size: 3, life: 0.2, maxLife: 0.4, colour: '#fff' });
  drawPopup(ctx, { x: 300, y: 300, text: '-12', size: 16, life: 0.3, maxLife: 0.6, colour: '#fff' });
  assert.ok(ctx.calls > 40);
});

test('an empty health bar still draws, and a full one does not overflow', () => {
  const ctx = createFakeContext();
  const match = createMatch('pebble', 'zip');
  match.a.hp = 0;
  match.b.hp = match.b.maxHp;
  assert.doesNotThrow(() => drawHud(ctx, match, { width: 960, leftLabel: 'You', rightLabel: 'P2', clock: 1 }));
});

test('each seat gets its own colour, so two of the same ball are still telling apart', () => {
  assert.notEqual(SEAT_TINT.a, SEAT_TINT.b);
  for (const tint of Object.values(SEAT_TINT)) assert.match(tint, /^#[0-9a-f]{6}$/i);
});
