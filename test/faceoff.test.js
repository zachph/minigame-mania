import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/core/utils.js';
import { BASE_HP, BOX, FIGHTERS, FIGHT_LIMIT, STORY, TEAM_SIZE, TOWER, getFighter } from '../src/games/faceoff/content.js';
import { bump, createFight, frontOf, heal, hurt, isBeaten, pressureAt, runFight, stepFight } from '../src/games/faceoff/battle.js';
import { drawBall, drawBanner, drawBench, drawBox, drawPopup, drawScreen, drawStatus } from '../src/games/faceoff/art.js';
import { createFakeContext } from './helpers.js';

const fight = (a, b, seed = 11) => createFight({ a, b, random: seededRandom(seed) });
const nonSans = FIGHTERS.map((f) => f.id).filter((id) => id !== 'sans');

/* ------------------------------------------------------------ the roster */

test('the nine are the nine', () => {
  assert.deepEqual(
    FIGHTERS.map((f) => f.name),
    ['Gojo', 'Sukuna', 'Sans', 'Ralsei', 'Undyne', 'Garou', 'Saitama', 'Goku', 'Beerus'],
  );
});

test('everyone has 250 health except Sans, who has 1 and 24 dodges', () => {
  for (const spec of FIGHTERS) {
    if (spec.id === 'sans') {
      assert.equal(spec.hp, 1);
      assert.equal(spec.dodges, 24);
    } else {
      assert.equal(spec.hp, BASE_HP);
      assert.equal(spec.hp, 250);
    }
  }
});

test('every floor and chapter is three real fighters', () => {
  for (const group of [...TOWER, ...STORY]) {
    assert.equal(group.team.length, TEAM_SIZE);
    for (const id of group.team) assert.doesNotThrow(() => getFighter(id));
  }
});

/* ------------------------------------------------------------------ Sans */

test('the first 24 attacks on Sans miss, and the 25th lands', () => {
  const f = fight(['sans'], ['goku']);
  const sans = f.sides.a.team[0];
  for (let i = 0; i < 24; i += 1) {
    assert.equal(hurt(f, sans, 50), 0, `attack ${i + 1} should have missed`);
    assert.equal(sans.hp, 1);
  }
  assert.equal(sans.dodgesLeft, 0);
  hurt(f, sans, 50);
  assert.equal(sans.hp, 0, 'the 25th gets through');
});

test('a dodge counts any attack, however small', () => {
  const f = fight(['sans'], ['goku']);
  const sans = f.sides.a.team[0];
  hurt(f, sans, 0.5);
  assert.equal(sans.dodgesLeft, 23);
});

test('a miss shows up as an event, so the screen can say MISS', () => {
  const f = fight(['sans'], ['goku']);
  hurt(f, f.sides.a.team[0], 20);
  assert.ok(f.events.some((e) => e.kind === 'miss'));
});

/* ------------------------------------------------------------- bumping */

test('a bump costs both of them health', () => {
  const f = fight(['goku'], ['gojo']);
  const [a, b] = [frontOf(f, 'a'), frontOf(f, 'b')];
  Object.assign(a, { x: 400, y: 240, vx: 270, vy: 0, hitLock: 0 });
  Object.assign(b, { x: 440, y: 240, vx: -270, vy: 0, hitLock: 0 });
  bump(f, a, b);
  assert.ok(a.hp < 250 && b.hp < 250);
});

test('the one moving into the other takes less', () => {
  let chargerLost = 0;
  let sitterLost = 0;
  for (let seed = 1; seed <= 30; seed += 1) {
    const f = fight(['goku'], ['gojo'], seed);
    const [a, b] = [frontOf(f, 'a'), frontOf(f, 'b')];
    Object.assign(a, { x: 400, y: 240, vx: 270, vy: 0, hitLock: 0 });
    Object.assign(b, { x: 440, y: 240, vx: 0, vy: 270, hitLock: 0 });
    bump(f, a, b);
    chargerLost += 250 - a.hp;
    sitterLost += 250 - b.hp;
  }
  assert.ok(chargerLost < sitterLost);
});

test('one touch is one hit, not one per frame', () => {
  const f = fight(['goku'], ['gojo']);
  const [a, b] = [frontOf(f, 'a'), frontOf(f, 'b')];
  Object.assign(a, { x: 400, y: 240, vx: 270, vy: 0, hitLock: 0 });
  Object.assign(b, { x: 440, y: 240, vx: -270, vy: 0, hitLock: 0 });
  bump(f, a, b);
  const after = a.hp;
  bump(f, a, b);
  assert.equal(a.hp, after, 'the hit lock should stop a second hit straight away');
});

test('nobody ever leaves the box', () => {
  const f = fight(['goku', 'gojo', 'garou'], ['sukuna', 'beerus', 'undyne']);
  for (let i = 0; i < 30 * 40 && !f.over; i += 1) {
    stepFight(f, 1 / 30);
    for (const side of ['a', 'b']) {
      const who = frontOf(f, side);
      if (!who) continue;
      assert.ok(who.x >= BOX.x && who.x <= BOX.x + BOX.w, `${who.name} left sideways`);
      assert.ok(who.y >= BOX.y && who.y <= BOX.y + BOX.h, `${who.name} left vertically`);
    }
  }
});

test('they keep meeting - nobody gets stuck circling', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const f = fight(['goku'], ['gojo'], seed);
    let bumps = 0;
    while (!f.over) { stepFight(f, 1 / 30); bumps += f.events.filter((e) => e.kind === 'bump').length; }
    assert.ok(f.time / bumps < 2.5, `seed ${seed}: one bump every ${(f.time / bumps).toFixed(1)}s`);
  }
});

/* ------------------------------------------------------------- the rest */

test('when one is out, the next of the three steps in', () => {
  const f = fight(['goku', 'gojo', 'garou'], ['beerus']);
  hurt(f, f.sides.a.team[0], 10000);
  stepFight(f, 1 / 60);
  assert.equal(frontOf(f, 'a').name, 'Gojo');
  assert.ok(frontOf(f, 'a').entered, 'it was put in the box');
});

test('a side with nobody left has lost', () => {
  const f = fight(['goku', 'gojo'], ['beerus']);
  for (const who of f.sides.a.team) hurt(f, who, 10000);
  assert.equal(isBeaten(f.sides.a), true);
});

test('healing never goes over the top, or brings anyone back', () => {
  const f = fight(['ralsei'], ['goku']);
  const who = f.sides.a.team[0];
  heal(f, who, 10000);
  assert.equal(who.hp, 250);
  who.hp = 0;
  assert.equal(heal(f, who, 50), 0);
});

test('long fights start hitting harder', () => {
  assert.equal(pressureAt(0), 1);
  assert.ok(pressureAt(60) > 1.5);
});

test('three-a-side fights finish, and almost never on the clock', () => {
  let clock = 0;
  for (let seed = 1; seed <= 60; seed += 1) {
    const r = seededRandom(seed * 7919 + 1);
    const pick = () => [0, 1, 2].map(() => nonSans[Math.floor(r() * nonSans.length)]);
    const f = createFight({ a: pick(), b: pick(), random: r });
    runFight(f);
    assert.ok(f.over);
    assert.ok(f.time <= FIGHT_LIMIT + 1);
    if (f.over.reason.startsWith('time')) clock += 1;
  }
  assert.ok(clock <= 3, `${clock} of 60 went to the clock`);
});

test('the same seed plays the same fight', () => {
  const run = () => { const f = fight(['goku', 'sans'], ['gojo', 'sukuna'], 42); runFight(f); return `${f.over.winner} ${f.time.toFixed(3)}`; };
  assert.equal(run(), run());
});

/* -------------------------------------------------------------- drawing */

test('the box and everything in it draws without NaN', () => {
  const ctx = createFakeContext();
  const f = fight(['sans', 'goku', 'gojo'], ['sukuna', 'beerus', 'garou']);
  for (let i = 0; i < 60; i += 1) stepFight(f, 1 / 30);
  drawScreen(ctx, 960, 540);
  drawBox(ctx, 1, 0);
  drawBox(ctx, 1.6, 2);
  for (const spec of FIGHTERS) {
    const g = fight([spec.id], ['goku']);
    drawBall(ctx, frontOf(g, 'a'), { flash: 0.5, trail: [{ x: 300, y: 200 }, { x: 310, y: 205 }] });
    drawStatus(ctx, frontOf(g, 'a'), 96, 430, 'left');
  }
  drawStatus(ctx, null, 96, 430);
  drawBench(ctx, f.sides.a, 96, 490, 'left');
  drawBench(ctx, f.sides.b, 864, 490, 'right');
  drawPopup(ctx, { x: 300, y: 200, text: 'MISS', colour: '#ccc', size: 18, life: 0.4, maxLife: 0.8 });
  drawBanner(ctx, '* YOU WON', 'nobody left to send');
  assert.ok(ctx.calls > 100);
});
