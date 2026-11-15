import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/core/utils.js';
import { BASE_HP, BOX, CRUISE, FIGHTERS, FIGHT_LIMIT, STORY, TEAM_SIZE, TOWER, getFighter } from '../src/games/faceoff/content.js';
import { bump, createFight, frontOf, heal, hurt, isBeaten, pressureAt, runFight, stepFight, strike } from '../src/games/faceoff/battle.js';
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
    // Scaled to the cruise speed: slower balls meet less often, but a pair
    // stuck circling would not meet at all, which is what this is guarding.
    const limit = 2.5 * (270 / CRUISE);
    assert.ok(f.time / bumps < limit, `seed ${seed}: one bump every ${(f.time / bumps).toFixed(1)}s`);
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

test('every fighter has a head drawn for them', async () => {
  const { HEADS, drawHead } = await import('../src/games/faceoff/heads.js');
  const ctx = createFakeContext();
  for (const spec of FIGHTERS) {
    assert.ok(HEADS[spec.id], `${spec.name} has no head`);
    drawHead(ctx, spec.id, 100, 100, 30);
  }
  assert.doesNotThrow(() => drawHead(ctx, 'someone-new', 100, 100, 30));
});

/* -------------------------------------------------------------- Infinity */

test('inside Gojo\'s Infinity a fighter moves at half speed', async () => {
  const { speedFor, inInfinity } = await import('../src/games/faceoff/battle.js');
  const { CRUISE } = await import('../src/games/faceoff/content.js');
  const f = fight(['gojo'], ['goku']);
  const [gojo, goku] = [frontOf(f, 'a'), frontOf(f, 'b')];
  Object.assign(gojo, { x: 400, y: 240 });
  Object.assign(goku, { x: 480, y: 240 });
  assert.equal(speedFor(goku, gojo), CRUISE / 2);
  assert.equal(inInfinity(goku, gojo), true);
  goku.x = 700;
  assert.equal(speedFor(goku, gojo), CRUISE, 'out of range, full speed');
});

test('Gojo is never slowed by his own Infinity, and a fallen Gojo slows nobody', async () => {
  const { speedFor } = await import('../src/games/faceoff/battle.js');
  const { CRUISE } = await import('../src/games/faceoff/content.js');
  const f = fight(['gojo'], ['goku']);
  const [gojo, goku] = [frontOf(f, 'a'), frontOf(f, 'b')];
  Object.assign(gojo, { x: 400, y: 240 });
  Object.assign(goku, { x: 450, y: 240 });
  assert.equal(speedFor(gojo, goku), CRUISE);
  gojo.hp = 0;
  assert.equal(speedFor(goku, gojo), CRUISE);
});

test('a slowed attacker hits Gojo for less than Gojo hits back', () => {
  let toGojo = 0;
  let toGoku = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    const f = fight(['gojo'], ['goku'], seed);
    while (!f.over) stepFight(f, 1 / 30);
    toGojo += f.sides.a.team[0].taken;
    toGoku += f.sides.b.team[0].taken;
  }
  assert.ok(toGojo < toGoku * 0.8, `Gojo took ${toGojo.toFixed(0)}, Goku took ${toGoku.toFixed(0)}`);
});

test('the Infinity ring draws', async () => {
  const { drawInfinity, drawSlowed } = await import('../src/games/faceoff/art.js');
  const ctx = createFakeContext();
  const f = fight(['gojo'], ['goku']);
  drawInfinity(ctx, frontOf(f, 'a'), true, 1);
  drawInfinity(ctx, frontOf(f, 'a'), false, 1);
  drawInfinity(ctx, frontOf(f, 'b'), false, 1);
  drawSlowed(ctx, frontOf(f, 'b'));
  assert.ok(ctx.calls > 5);
});

/* ------------------------------------------------------------ Sukuna */

test('Sukuna heals a quarter of his health every 15 seconds', async () => {
  const { nextHealIn } = await import('../src/games/faceoff/battle.js');
  const f = fight(['sukuna'], ['goku']);
  const sukuna = frontOf(f, 'a');
  const goku = frontOf(f, 'b');
  sukuna.hp = 100;
  goku.hp = 100000;                       // keep the fight going
  goku.maxHp = 100000;
  // Stop them meeting so only the heal moves his health.
  goku.x = sukuna.x + 400;
  for (let i = 0; i < 30 * 14.9; i += 1) { f.sinceBump = 0; goku.hitLock = sukuna.hitLock = 99; stepFight(f, 1 / 30); }
  const before = sukuna.hp;
  assert.ok(nextHealIn(sukuna) < 0.2);
  for (let i = 0; i < 10; i += 1) { goku.hitLock = sukuna.hitLock = 99; stepFight(f, 1 / 30); }
  assert.equal(sukuna.hp - before, 62.5, 'a quarter of 250');
});

test('the heal never goes over his maximum', () => {
  const f = fight(['sukuna'], ['goku']);
  const sukuna = frontOf(f, 'a');
  sukuna.hp = 240;
  sukuna.timers.regen = 14.99;
  frontOf(f, 'b').hitLock = sukuna.hitLock = 99;
  stepFight(f, 1 / 30);
  assert.equal(sukuna.hp, 250);
});

test('waiting on the bench does not count towards the heal', () => {
  const f = fight(['goku', 'sukuna'], ['garou']);
  for (let i = 0; i < 30 * 5 && !f.over; i += 1) stepFight(f, 1 / 30);
  assert.equal(f.sides.a.team[1].timers.regen, 0);
});

test('the heal timer shows on his status line', async () => {
  const { nextHealIn } = await import('../src/games/faceoff/battle.js');
  const f = fight(['sukuna'], ['goku']);
  assert.equal(nextHealIn(frontOf(f, 'a')), 15);
  assert.equal(nextHealIn(frontOf(f, 'b')), null, 'Goku has no heal');
  const ctx = createFakeContext();
  assert.doesNotThrow(() => drawStatus(ctx, frontOf(f, 'a'), 96, 430));
});

/* ------------------------------------------------ who lands first */

test('a fighter knocked out by a bump does not hit back on it', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const f = fight(['goku'], ['garou'], seed);
    const [a, b] = [frontOf(f, 'a'), frontOf(f, 'b')];
    b.hp = 1;
    Object.assign(a, { x: 400, y: 240, vx: 270, vy: 0, hitLock: 0 });
    Object.assign(b, { x: 440, y: 240, vx: 0, vy: 270, hitLock: 0 });
    bump(f, a, b);
    assert.equal(b.hp, 0);
    assert.equal(a.hp, 250, 'the fighter that went down never got its hit in');
  }
});

test('two even fighters almost never knock each other out together', () => {
  let draws = 0;
  for (let seed = 1; seed <= 60; seed += 1) {
    const f = fight(['goku'], ['garou'], seed);
    runFight(f);
    if (f.over.winner === 'draw') draws += 1;
  }
  assert.ok(draws <= 2, `${draws} of 60 were draws`);
});

/* ------------------------------------------------- the other abilities */

const quiet = (f) => { for (const s of ['a', 'b']) for (const w of f.sides[s].team) { w.hp = w.maxHp = 100000; } };

test('Sans throws the enemy at a wall every 10 seconds, and the wall does 5', async () => {
  const f = fight(['sans'], ['goku']);
  const goku = frontOf(f, 'b');
  frontOf(f, 'a').timers.launch = 9.99;
  goku.hp = goku.maxHp = 1000;
  stepFight(f, 1 / 30);
  assert.ok(goku.launched, 'he was thrown');
  for (let i = 0; i < 60 && goku.launched; i += 1) stepFight(f, 1 / 60);
  assert.equal(goku.launched, null, 'and landed');
  assert.equal(goku.taken, 5);
});

test('Ralsei sets a burn that does 1 a second for 15 seconds', () => {
  const f = fight(['ralsei'], ['goku']);
  const [ralsei, goku] = [frontOf(f, 'a'), frontOf(f, 'b')];
  let burned = false;
  for (let seed = 0; seed < 50 && !burned; seed += 1) {
    f.random = seededRandom(seed);
    strike(f, ralsei, goku, 1);
    burned = Boolean(goku.burn);
  }
  assert.ok(burned, 'a quarter of hits should burn');
  quiet(f);
  goku.burn.from = ralsei;
  const before = goku.taken;
  for (let i = 0; i < 30 * 16; i += 1) { goku.hitLock = ralsei.hitLock = 99; f.sinceBump = 0; goku.x = ralsei.x + 400; stepFight(f, 1 / 30); }
  assert.equal(Math.round(goku.taken - before), 15);
  assert.equal(goku.burn, null, 'and it ran out');
});

test('a quarter of Ralsei\'s hits burn, near enough', () => {
  let burns = 0;
  for (let seed = 1; seed <= 400; seed += 1) {
    const f = fight(['ralsei'], ['goku'], seed);
    strike(f, frontOf(f, 'a'), frontOf(f, 'b'), 1);
    if (frontOf(f, 'b').burn) burns += 1;
  }
  assert.ok(burns > 70 && burns < 130, `${burns} of 400`);
});

test('Undyne comes back as Undyne the Undying with 355 health, one time in five', () => {
  let back = 0;
  for (let seed = 1; seed <= 500; seed += 1) {
    const f = fight(['undyne'], ['goku'], seed);
    const undyne = frontOf(f, 'a');
    hurt(f, undyne, 10000);
    if (undyne.hp > 0) {
      back += 1;
      assert.equal(undyne.hp, 355);
      assert.equal(undyne.maxHp, 355);
      assert.equal(undyne.name, 'Undyne the Undying');
      hurt(f, undyne, 10000);
      assert.equal(undyne.hp, 0, 'and only once');
    }
  }
  assert.ok(back > 70 && back < 130, `${back} of 500`);
});

test('40% of Garou\'s hits land twice', () => {
  let doubles = 0;
  for (let seed = 1; seed <= 500; seed += 1) {
    const f = fight(['garou'], ['goku'], seed);
    strike(f, frontOf(f, 'a'), frontOf(f, 'b'), 10);
    if (frontOf(f, 'b').taken === 20) doubles += 1;
  }
  assert.ok(doubles > 160 && doubles < 240, `${doubles} of 500`);
});

test('5% of Saitama\'s hits kill outright', () => {
  let kills = 0;
  for (let seed = 1; seed <= 1000; seed += 1) {
    const f = fight(['saitama'], ['goku'], seed);
    strike(f, frontOf(f, 'a'), frontOf(f, 'b'), 1);
    if (frontOf(f, 'b').hp === 0) kills += 1;
  }
  assert.ok(kills > 30 && kills < 75, `${kills} of 1000`);
});

test('a Serious Punch on Sans is still just one dodge', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const f = fight(['saitama'], ['sans'], seed);
    strike(f, frontOf(f, 'a'), frontOf(f, 'b'), 1);
    assert.equal(frontOf(f, 'b').hp, 1);
  }
});

test('Goku teleports every 20 seconds, never on top of the enemy', () => {
  const f = fight(['goku'], ['garou']);
  const goku = frontOf(f, 'a');
  goku.timers.teleport = 19.99;
  stepFight(f, 1 / 30);
  assert.ok(f.events.some((e) => e.kind === 'teleport'));
  const garou = frontOf(f, 'b');
  assert.ok(Math.hypot(garou.x - goku.x, garou.y - goku.y) > 100);
});

test('Beerus brings Whis in for 5 seconds, and Whis hurts the enemy', () => {
  const f = fight(['beerus'], ['goku']);
  quiet(f);
  frontOf(f, 'a').timers.summon = 14.99;
  stepFight(f, 1 / 30);
  assert.equal(f.summons.length, 1);
  const before = frontOf(f, 'b').taken;
  for (let i = 0; i < 30 * 4.5; i += 1) stepFight(f, 1 / 30);
  assert.equal(f.summons.length, 1, 'still here at four and a half seconds');
  for (let i = 0; i < 30 * 1; i += 1) stepFight(f, 1 / 30);
  assert.equal(f.summons.length, 0, 'gone after five');
  assert.ok(frontOf(f, 'b').taken > before);
});

test('full fights with every ability still finish, without draws piling up', () => {
  const ids = FIGHTERS.map((x) => x.id);
  let draws = 0;
  for (let seed = 1; seed <= 80; seed += 1) {
    const r = seededRandom(seed * 7919 + 3);
    const pick = () => [0, 1, 2].map(() => ids[Math.floor(r() * ids.length)]);
    const f = createFight({ a: pick(), b: pick(), random: r });
    runFight(f);
    assert.ok(f.over && f.time <= FIGHT_LIMIT + 1);
    if (f.over.winner === 'draw') draws += 1;
  }
  assert.ok(draws <= 3, `${draws} draws`);
});

/* ------------------------------------------------------- Reversal Red */

test('Gojo has both of his abilities', () => {
  assert.deepEqual(getFighter('gojo').abilities.map((a) => a.name), ['Infinity', 'Reversal Red']);
});

test('a fighter with one ability still has it listed, and one with none has an empty list', () => {
  assert.deepEqual(getFighter('goku').abilities.map((a) => a.kind), ['teleport']);
  for (const spec of FIGHTERS) assert.ok(Array.isArray(spec.abilities));
});

test('Reversal Red fires every 12 seconds, at the enemy', () => {
  const f = fight(['gojo'], ['goku']);
  frontOf(f, 'a').timers.shot = 11.99;
  stepFight(f, 1 / 30);
  assert.equal(f.shots.length, 1);
  const shot = f.shots[0];
  const goku = frontOf(f, 'b');
  const towards = shot.dx * (goku.x - shot.x) + shot.dy * (goku.y - shot.y);
  assert.ok(towards > 0, 'it was fired towards Goku');
});

test('a shot that reaches the enemy does 25', () => {
  const f = fight(['gojo'], ['garou']);
  const [gojo, garou] = [frontOf(f, 'a'), frontOf(f, 'b')];
  garou.x = gojo.x + 200; garou.y = gojo.y; garou.vx = 0; garou.vy = 0;
  f.shots.push({ side: 'a', owner: gojo, x: gojo.x + 40, y: gojo.y, dx: 1, dy: 0, speed: 620, length: 90, damage: 25, colour: '#f00' });
  const before = garou.hp;
  // Keep Garou where he is long enough for it to land.
  for (let i = 0; i < 40 && f.shots.length; i += 1) { garou.x = gojo.x + 200; garou.y = gojo.y; garou.hitLock = gojo.hitLock = 99; stepFight(f, 1 / 120); }
  assert.equal(before - garou.hp, 25);
  assert.equal(f.shots.length, 0, 'and it is used up');
});

test('a shot that misses is gone once it leaves the box', () => {
  const f = fight(['gojo'], ['garou']);
  const gojo = frontOf(f, 'a');
  f.shots.push({ side: 'a', owner: gojo, x: BOX.x + 5, y: BOX.y + 5, dx: -1, dy: 0, speed: 620, length: 90, damage: 25, colour: '#f00' });
  stepFight(f, 1 / 30);
  assert.equal(f.shots.length, 0);
});

test('Sans dodges Reversal Red like anything else', () => {
  const f = fight(['gojo'], ['sans']);
  const [gojo, sans] = [frontOf(f, 'a'), frontOf(f, 'b')];
  sans.x = gojo.x + 150; sans.y = gojo.y;
  f.shots.push({ side: 'a', owner: gojo, x: gojo.x + 40, y: gojo.y, dx: 1, dy: 0, speed: 620, length: 90, damage: 25, colour: '#f00' });
  for (let i = 0; i < 40 && f.shots.length; i += 1) { sans.x = gojo.x + 150; sans.y = gojo.y; sans.hitLock = gojo.hitLock = 99; stepFight(f, 1 / 120); }
  assert.equal(sans.hp, 1);
  assert.equal(sans.dodgesLeft, 23);
});

test('both of Gojo\'s timers run, and his status draws them', async () => {
  const { drawShot } = await import('../src/games/faceoff/art.js');
  const f = fight(['gojo'], ['sukuna']);
  const ctx = createFakeContext();
  assert.doesNotThrow(() => drawStatus(ctx, frontOf(f, 'a'), 96, 430));
  drawShot(ctx, { x: 300, y: 200, dx: 1, dy: 0, length: 90, colour: '#ff2a2a' });
  assert.ok(ctx.calls > 5);
});

/* ----------------------------------------------------------- Dismantle */

test('Sukuna has his heal and Dismantle', () => {
  assert.deepEqual(getFighter('sukuna').abilities.map((a) => a.name), ['Reverse Cursed Technique', 'Dismantle']);
});

test('Dismantle cuts the enemy for 5 every 5 seconds, wherever they are in the box', () => {
  const f = fight(['sukuna'], ['goku']);
  const [sukuna, goku] = [frontOf(f, 'a'), frontOf(f, 'b')];
  sukuna.x = BOX.x + 40; goku.x = BOX.x + BOX.w - 40;   // as far apart as it gets
  sukuna.timers.slash = 4.99;
  goku.hitLock = sukuna.hitLock = 99;
  stepFight(f, 1 / 30);
  assert.equal(goku.taken, 5);
  assert.ok(f.events.some((e) => e.kind === 'slash'));
});

test('Sans dodges Dismantle, one dodge at a time', () => {
  const f = fight(['sukuna'], ['sans']);
  const [sukuna, sans] = [frontOf(f, 'a'), frontOf(f, 'b')];
  sukuna.timers.slash = 4.99;
  sans.hitLock = sukuna.hitLock = 99;
  sans.x = sukuna.x + 400;
  stepFight(f, 1 / 30);
  assert.equal(sans.hp, 1);
  assert.equal(sans.dodgesLeft, 23);
});

test('the cut draws', async () => {
  const { drawSlash } = await import('../src/games/faceoff/art.js');
  const ctx = createFakeContext();
  drawSlash(ctx, { x: 300, y: 200, life: 0.2, maxLife: 0.45 });
  assert.ok(ctx.calls > 5);
});

/* ------------------------------------------------------- Gaster Blaster */

test('Sans has Blue Magic, Gaster Blaster and Bone Wave', () => {
  assert.deepEqual(getFighter('sans').abilities.map((a) => a.name), ['Blue Magic', 'Gaster Blaster', 'Bone Wave']);
});

/** Sans against a Goku who cannot die and is kept away from him. */
function blasterFight() {
  const f = fight(['sans', 'garou'], ['goku']);
  quiet(f);
  const [sans, goku] = [frontOf(f, 'a'), frontOf(f, 'b')];
  sans.timers.launch = -1000;              // keep Blue Magic out of it
  sans.timers.bones = -1000;               // and the Bone Wave
  sans.timers.blaster = 7.99;
  const step = () => { goku.hitLock = sans.hitLock = 99; f.sinceBump = 0; goku.x = sans.x + 400; stepFight(f, 1 / 30); };
  return { f, sans, goku, step };
}

test('the run goes diagonal, horizontal, the other diagonal, then two big ones left and right', () => {
  const { f, step } = blasterFight();
  const seen = [];
  for (let i = 0; i < 30 * 13; i += 1) {
    step();
    const now = f.blasters.map((b) => b.aim).sort().join('+');
    if (now && now !== seen.at(-1)) seen.push(now);
  }
  assert.deepEqual(seen, ['diagonal', 'horizontal', 'other-diagonal', 'left+right']);
});

test('each blast lasts 3 seconds; the small ones do 4 a second, the big ones 3 each', () => {
  const { f, goku, step } = blasterFight();
  step();                                  // the run starts
  const at = (seconds) => { while (f.time < seconds) step(); return goku.taken; };
  const t0 = f.time;
  const after9 = at(t0 + 9.05);
  assert.equal(Math.round(after9), 36, 'three small blasts, 3 seconds each at 4 a second');
  const after12 = at(t0 + 12.05);
  assert.equal(Math.round(after12 - after9), 18, 'two big ones at 3 a second each for 3 seconds');
});

test('Sans can dodge the blasts too, a tick at a time', () => {
  const f = fight(['sans', 'garou'], ['sans']);
  const [mine, theirs] = [frontOf(f, 'a'), frontOf(f, 'b')];
  mine.timers.launch = -1000;
  mine.timers.bones = -1000;
  theirs.timers.launch = -1000;
  theirs.timers.blaster = -1000;
  theirs.timers.bones = -1000;
  mine.timers.blaster = 7.99;
  for (let i = 0; i < 30 * 3.2 && !f.over; i += 1) { mine.hitLock = theirs.hitLock = 99; f.sinceBump = 0; theirs.x = mine.x + 400; stepFight(f, 1 / 30); }
  assert.equal(theirs.hp, 1, 'he is still standing');
  assert.equal(theirs.dodgesLeft, 21, 'three ticks, three dodges');
});

test('the 8 seconds start when a run is over, not when it starts', () => {
  const { f, sans, step } = blasterFight();
  step();
  let ended = null;
  let restarted = null;
  for (let i = 0; i < 30 * 30 && restarted == null; i += 1) {
    step();
    const running = f.runs.some((run) => run.owner === sans);
    if (!running && ended == null) ended = f.time;
    if (running && ended != null) restarted = f.time;
  }
  assert.ok(ended != null && restarted != null);
  assert.ok(Math.abs(restarted - ended - 8) < 0.1, `waited ${(restarted - ended).toFixed(2)}s`);
});

test('the run and its blasts go when Sans does', () => {
  const { f, sans, step } = blasterFight();
  step();
  step();
  assert.ok(f.runs.length === 1);
  sans.dodgesLeft = 0;
  sans.hp = 5;                             // blasterFight made him unkillable
  hurt(f, sans, 5);
  step();
  assert.equal(f.runs.length, 0);
  assert.equal(f.blasters.length, 0);
});

test('every beam runs inside the box, and the blasters draw', async () => {
  const { beamLine, drawBlaster } = await import('../src/games/faceoff/art.js');
  const ctx = createFakeContext();
  const target = { x: 500, y: 250 };
  for (const aim of ['diagonal', 'horizontal', 'other-diagonal', 'left', 'right']) {
    const big = aim === 'left' || aim === 'right';
    const { start, end } = beamLine({ aim, big }, target);
    for (const p of [start, end]) {
      assert.ok(p.x >= BOX.x - 1 && p.x <= BOX.x + BOX.w + 1 && p.y >= BOX.y - 1 && p.y <= BOX.y + BOX.h + 1, `${aim} leaves the box`);
    }
    drawBlaster(ctx, { aim, big }, target, 1.3);
  }
  const left = beamLine({ aim: 'left', big: true }, target);
  const right = beamLine({ aim: 'right', big: true }, target);
  assert.ok(left.start.x < target.x && right.start.x > target.x, 'the big ones come from either side');
  assert.ok(ctx.calls > 20);
});

/* ------------------------------------------------------------ Bone Wave */

test('the Bone Wave comes every 20 seconds and does 1 a second for 5', () => {
  const f = fight(['sans', 'garou'], ['goku']);
  quiet(f);
  const [sans, goku] = [frontOf(f, 'a'), frontOf(f, 'b')];
  sans.timers.launch = -1000;
  sans.timers.blaster = -1000;
  sans.timers.bones = 19.99;
  const step = () => { goku.hitLock = sans.hitLock = 99; f.sinceBump = 0; goku.x = sans.x + 400; stepFight(f, 1 / 30); };
  step();
  assert.equal(f.waves.length, 1);
  sans.timers.bones = -1000;
  const before = goku.taken;
  for (let i = 0; i < 30 * 5.5; i += 1) step();
  assert.equal(Math.round(goku.taken - before), 5);
  assert.equal(f.waves.length, 0, 'and it has passed');
});

test('Sans dodges a Bone Wave a tick at a time', () => {
  const f = fight(['sans', 'garou'], ['sans']);
  const [mine, theirs] = [frontOf(f, 'a'), frontOf(f, 'b')];
  for (const s of [mine, theirs]) { s.timers.launch = -1000; s.timers.blaster = -1000; }
  theirs.timers.bones = -1000;
  mine.timers.bones = 19.99;
  for (let i = 0; i < 30 * 2.2 && !f.over; i += 1) { mine.hitLock = theirs.hitLock = 99; f.sinceBump = 0; theirs.x = mine.x + 400; stepFight(f, 1 / 30); }
  assert.equal(theirs.hp, 1);
  assert.equal(theirs.dodgesLeft, 22);
});

test('the bones draw from either side', async () => {
  const { drawBones } = await import('../src/games/faceoff/art.js');
  const ctx = createFakeContext();
  for (const from of ['left', 'right']) {
    for (const left of [5, 2.5, 0.1]) drawBones(ctx, { from, left, lasts: 5 });
  }
  assert.ok(ctx.calls > 30);
});
