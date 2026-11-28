import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/core/utils.js';
import { BALL_RADIUS, BASE_HP, BOX, isChessAnswer, CRUISE, FIGHTERS, FIGHT_LIMIT, STORY, TEAM_SIZE, TOWER, getFighter } from '../src/games/faceoff/content.js';
import { BONE_GAP, beamLine, onSword, swordLine, resolveDomain, boneAt, boneGapAt, bump, inBones, onBeam, createFight, frontOf, heal, hurt, isBeaten, pressureAt, runFight, stepFight, strike } from '../src/games/faceoff/battle.js';
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

test('every floor and chapter is real fighters - three, or four for the last stretch', () => {
  for (const group of [...TOWER, ...STORY]) {
    assert.equal(group.team.length, group.id === 'laststretch' ? 4 : TEAM_SIZE, group.name || group.floor);
    for (const id of group.team) assert.doesNotThrow(() => getFighter(id));
  }
});

test('Story is the six fights, in order', () => {
  assert.deepEqual(STORY.map((c) => c.name), ['One Punch', 'Jujutsu High', 'Dragon Ball Z', 'Deltarune', 'The Underground', 'Last Stretch']);
  assert.deepEqual(STORY[3].team.map((id) => getFighter(id).name), ['Ralsei', 'Susie', 'The Roaring Knight']);
  assert.deepEqual(STORY[0].team, ['genos', 'garou', 'saitama']);
  assert.deepEqual(STORY[1].team, ['yuji', 'sukuna', 'gojo']);
  assert.deepEqual(STORY[2].team, ['frieza', 'goku', 'beerus']);
  assert.deepEqual(STORY[4].team, ['toriel', 'undyne', 'sans']);
  assert.deepEqual(STORY[5].team.map((id) => getFighter(id).name), ['Last Breath Sans', 'Frisk', 'Gojo 1B%', 'Saitama Full Power']);
});

test('every new character is unlocked by the chapter they are in, and has a head', async () => {
  const { UNLOCKABLES, UNLOCKED_BY } = await import('../src/games/faceoff/content.js');
  const { HEADS } = await import('../src/games/faceoff/heads.js');
  for (const spec of UNLOCKABLES) {
    const chapter = UNLOCKED_BY.get(spec.id);
    assert.ok(chapter && chapter.team.includes(spec.id), spec.name);
    assert.equal(typeof HEADS[spec.id], 'function', spec.name);
    const ctx = createFakeContext();
    HEADS[spec.id](ctx);
    assert.ok(ctx.calls > 5, spec.name);
  }
});

test('unlocking a character only happens once', async () => {
  const { unlock, isUnlocked, unlockedIds } = await import('../src/games/faceoff/unlocks.js');
  assert.equal(isUnlocked('gojo'), true, 'the nine are always there');
  const before = unlockedIds();
  const fresh = unlock(['genos']);
  assert.ok(isUnlocked('genos'));
  assert.deepEqual(unlock(['genos']), [], 'not twice');
  assert.ok(before.includes('genos') || fresh.includes('genos'));
});

test('the Roaring Knight changes shape at half health, and stays changed', async () => {
  const { HEADS } = await import('../src/games/faceoff/heads.js');
  const f = createFight({ a: ['roaringknight'], b: ['garou'], random: seededRandom(2) });
  const knight = f.sides.a.team[0];
  hurt(f, knight, 120);
  assert.ok(!knight.halfForm, '130 of 250 is not half yet');
  hurt(f, knight, 10);
  assert.ok(knight.halfForm);
  heal(f, knight, 200);
  assert.ok(knight.halfForm, 'healing does not change it back');
  const ctx = createFakeContext();
  HEADS['roaringknight-half'](ctx);
  drawBall(ctx, knight);
  assert.ok(ctx.calls > 20);
});

test('Genos: Incineration Cannon, 5 a second for 4 seconds, every 10', () => {
  const f = createFight({ a: ['genos'], b: ['garou'], random: seededRandom(4) });
  quiet(f);
  const [genos, garou] = [frontOf(f, 'a'), frontOf(f, 'b')];
  genos.timers.barrage = -1000;
  genos.timers.beam = 10 - 1e-6;
  const step = () => { garou.hitLock = genos.hitLock = 99; f.sinceBump = 0; garou.x = genos.x + 400; stepFight(f, 1 / 60); };
  step();
  assert.equal(f.beams.length, 1);
  assert.equal(f.beams[0].colour, '#ff7a1a');
  genos.timers.beam = -1000;
  const before = garou.taken;
  for (let i = 0; i < 60 * 4.5; i += 1) step();
  assert.equal(Math.round(garou.taken - before), 20, 'four hits of 5');
  assert.equal(f.beams.length, 0);
});

test('Genos: Missile Barrage, eight missiles every 7 seconds, one each way, 4 each', () => {
  const f = createFight({ a: ['genos'], b: ['garou'], random: seededRandom(4) });
  quiet(f);
  const [genos, garou] = [frontOf(f, 'a'), frontOf(f, 'b')];
  genos.timers.beam = -1000;
  genos.timers.barrage = 7 - 1e-6;
  genos.x = BOX.x + BOX.w / 2; genos.y = BOX.y + BOX.h / 2;
  garou.x = genos.x + 200; garou.y = genos.y;           // straight to the right
  garou.hitLock = genos.hitLock = 99;
  stepFight(f, 1 / 60);
  const missiles = f.shots.filter((s) => s.owner === genos);
  assert.equal(missiles.length, 8);
  const ways = new Set(missiles.map((m) => `${Math.round(m.dx * 10)},${Math.round(m.dy * 10)}`));
  assert.equal(ways.size, 8, 'all different directions');
  const before = garou.taken;
  for (let i = 0; i < 60; i += 1) { garou.x = genos.x + 200; garou.y = genos.y; garou.hitLock = genos.hitLock = 99; f.sinceBump = 0; stepFight(f, 1 / 60); }
  assert.equal(Math.round(garou.taken - before), 4, 'the one fired his way hits');
});

test('the cannon and missiles draw', async () => {
  const { drawShot, drawBeam } = await import('../src/games/faceoff/art.js');
  const ctx = createFakeContext();
  drawShot(ctx, { x: 300, y: 200, dx: 1, dy: 0, style: 'missile', colour: '#ccc' });
  drawBeam(ctx, { colour: '#ff7a1a', width: 1.7 }, { x: 200, y: 200, radius: 30 }, { x: 500, y: 220 }, 1);
  assert.ok(ctx.calls > 10);
});

test('the Roaring Knight survives its first fatal hit on 1 and does its final attack', () => {
  const f = createFight({ a: ['roaringknight'], b: ['garou'], random: seededRandom(5) });
  const [knight, garou] = [frontOf(f, 'a'), frontOf(f, 'b')];
  garou.hp = garou.maxHp = 100000;
  hurt(f, knight, 1000, { from: garou });
  assert.equal(knight.hp, 1);
  assert.equal(f.converges.length, 1);
  assert.equal(f.converges[0].blades.length, 14);
  assert.equal(hurt(f, knight, 50, { from: garou }), 0, 'nothing touches it meanwhile');
  // Stand the enemy right next to the Knight, where every blade ends up.
  const before = garou.taken;
  let phases = new Set();
  for (let i = 0; i < 60 * 5 && f.converges.length; i += 1) {
    garou.x = knight.x + 40; garou.y = knight.y;
    garou.hitLock = knight.hitLock = 99; f.sinceBump = 0;
    stepFight(f, 1 / 60);
    if (f.converges[0]) phases.add(f.converges[0].phase);
  }
  assert.deepEqual([...phases], ['gather', 'hold', 'scatter']);
  assert.equal(f.converges.length, 0, 'it ends');
  assert.ok(garou.taken - before >= 10, `blades did ${garou.taken - before}`);
  assert.equal(knight.hp, 1);
  hurt(f, knight, 1000, { from: garou });
  assert.equal(knight.hp, 0, 'only the first fatal hit');
});

test('the blades draw', async () => {
  const { drawConverge } = await import('../src/games/faceoff/art.js');
  const f = createFight({ a: ['roaringknight'], b: ['garou'], random: seededRandom(5) });
  hurt(f, frontOf(f, 'a'), 1000);
  const ctx = createFakeContext();
  drawConverge(ctx, f.converges[0]);
  assert.ok(ctx.calls > 50);
});

test('Sword Dance: a sword points in first, then slashes across for a quarter of the enemy\'s health', () => {
  const f = createFight({ a: ['roaringknight'], b: ['garou'], random: seededRandom(6) });
  const [knight, garou] = [frontOf(f, 'a'), frontOf(f, 'b')];
  knight.timers.swords = 15 - 1e-6;
  const hold = { x: garou.x, y: garou.y };
  const step = () => { Object.assign(garou, hold); garou.hitLock = knight.hitLock = 99; f.sinceBump = 0; stepFight(f, 1 / 60); };
  step();
  assert.equal(f.swords.length, 1, 'the first sword goes down');
  assert.equal(f.swords[0].struck, false, 'pointing in first');
  assert.ok(onSword(f.swords[0], garou), 'aimed through the enemy');
  assert.equal(garou.hp, garou.maxHp, 'that does nothing yet');
  for (let i = 0; i < 60 && !f.swords.some((s) => s.hit); i += 1) step();
  assert.equal(garou.hp, garou.maxHp * 0.75, 'a quarter gone');
});

test('a sword misses anyone off its line, and only costs Sans a dodge', () => {
  const f = createFight({ a: ['roaringknight'], b: ['garou'], random: seededRandom(6) });
  const garou = frontOf(f, 'b');
  const sword = { ...swordLine(BOX.x + 100, BOX.y + 150, 0), warn: 0, strike: 0.25 };
  assert.equal(onSword(sword, { x: BOX.x + 400, y: BOX.y + 150, radius: 30 }), true);
  assert.equal(onSword(sword, { x: BOX.x + 400, y: BOX.y + 250, radius: 30 }), false);
  const s2 = createFight({ a: ['roaringknight'], b: ['sans'], random: seededRandom(6) });
  const [k2, sans] = [frontOf(s2, 'a'), frontOf(s2, 'b')];
  for (const key of Object.keys(sans.timers)) sans.timers[key] = -1000;
  s2.swords.push({ owner: k2, side: 'a', ...swordLine(sans.x, sans.y, 0.3), warn: 0, strike: 0.25, share: 0.25, struck: false, hit: false });
  stepFight(s2, 1 / 60);
  assert.equal(sans.hp, 1);
  assert.equal(sans.dodgesLeft, 23);
  void garou;
});

test('Red Slices: one, then two, then four lines, 10 each on a touch', () => {
  const f = createFight({ a: ['roaringknight'], b: ['garou'], random: seededRandom(8) });
  const [knight, garou] = [frontOf(f, 'a'), frontOf(f, 'b')];
  for (const k of Object.keys(knight.timers)) knight.timers[k] = -1000;
  knight.timers.slices = 12 - 1e-6;
  garou.hp = garou.maxHp = 100000;
  const hold = { x: garou.x, y: garou.y };
  const counts = [];
  let last = 0;
  const before = garou.taken;
  for (let i = 0; i < 60 * 4; i += 1) {
    Object.assign(garou, hold); garou.hitLock = knight.hitLock = 99; f.sinceBump = 0;
    const had = f.swords.filter((s) => s.style === 'slice').length;
    stepFight(f, 1 / 60);
    const now = f.swords.filter((s) => s.style === 'slice' && !s.struck).length;
    if (now > had && now !== last) counts.push(now - had);
    last = now;
  }
  assert.deepEqual(counts, [1, 2, 4]);
  const dealt = garou.taken - before;
  assert.ok(dealt % 10 === 0 && dealt > 0 && dealt <= 70, `${dealt} - only whole slices of 10`);
});

test('the swords and stars draw', async () => {
  const { drawSword } = await import('../src/games/faceoff/art.js');
  const ctx = createFakeContext();
  const line = swordLine(BOX.x + 300, BOX.y + 150, 0.6);
  drawSword(ctx, { ...line, struck: false }, 1);
  drawSword(ctx, { ...line, struck: true, strike: 0.1 }, 1);
  drawSword(ctx, { ...line, style: 'slice', struck: false }, 1);
  drawSword(ctx, { ...line, style: 'slice', struck: true, strike: 0.1 }, 1);
  const { drawConverge } = await import('../src/games/faceoff/art.js');
  const f = createFight({ a: ['roaringknight'], b: ['garou'], random: seededRandom(5) });
  hurt(f, frontOf(f, 'a'), 1000);
  drawConverge(ctx, f.converges[0], 1);
  assert.ok(ctx.calls > 60);
});

test('a four-strong team fights through all four', () => {
  const f = createFight({ a: ['lastbreath', 'frisk', 'gojo1b', 'fullpower'], b: ['saitama'], random: seededRandom(3) });
  assert.equal(f.sides.a.team.length, 4);
  for (let i = 0; i < 3; i += 1) { f.sides.a.team[i].hp = 0; }
  stepFight(f, 1 / 60);
  assert.equal(frontOf(f, 'a').name, 'Saitama Full Power');
  assert.equal(f.over, null);
});

/* ------------------------------------------------------------------ Sans */

test('the first 24 attacks on Sans miss, and the 25th lands', () => {
  const f = fight(['sans'], ['goku']);
  const sans = f.sides.a.team[0];
  for (let i = 0; i < 24; i += 1) {
    assert.equal(hurt(f, sans, 50), 0, `attack ${i + 1} should have missed`);
    assert.equal(sans.hp, 1);
    f.finales = [];                        // the Last Attack, at one left, has its own tests
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
  const f = fight(['ralsei', 'gojo', 'garou'], ['beerus']);
  hurt(f, f.sides.a.team[0], 10000);
  stepFight(f, 1 / 60);
  assert.equal(frontOf(f, 'a').name, 'Gojo');
  assert.ok(frontOf(f, 'a').entered, 'it was put in the box');
});

test('a side with nobody left has lost', () => {
  const f = fight(['ralsei', 'gojo'], ['beerus']);
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
  let toFoe = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    const f = fight(['gojo'], ['undyne'], seed);
    while (!f.over) stepFight(f, 1 / 30);
    toGojo += f.sides.a.team[0].taken;
    toFoe += f.sides.b.team[0].taken;
  }
  assert.ok(toGojo < toFoe * 0.8, `Gojo took ${toGojo.toFixed(0)}, Undyne took ${toFoe.toFixed(0)}`);
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
  goku.timers.beam = -1000;               // Goku's Kamehameha would muddy it
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
  ralsei.timers.shot = -1000;              // no Fireballs in this one
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
    const f = fight(['saitama'], ['garou'], seed);
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

test('Gojo has his abilities', () => {
  assert.deepEqual(getFighter('gojo').abilities.map((a) => a.name), ['Infinity', 'Reversal Red', 'Domain Expansion: Infinite Void']);
});

/* ------------------------------------------------------- Infinite Void */

/** Gojo against Sukuna, with the roll fixed: below 0.75 is the Domain. */
const domainFight = (roll, asks = true) => {
  const f = createFight({ a: ['gojo'], b: ['sukuna'], random: () => roll, asks });
  return { f, gojo: f.sides.a.team[0], sukuna: f.sides.b.team[0] };
};

test('Sukuna knocking Gojo out takes off the blindfold: 75% of the time, Domain Expansion freezes the fight', () => {
  const { f, gojo, sukuna } = domainFight(0.5);
  hurt(f, gojo, 1000, { from: sukuna });
  assert.equal(gojo.hp, 1, 'still standing');
  assert.ok(gojo.blindfoldOff);
  assert.equal(f.pending?.kind, 'domain');
  const [gx, sx, t] = [gojo.x, sukuna.x, f.time];
  for (let i = 0; i < 60; i += 1) stepFight(f, 1 / 30);
  assert.deepEqual([gojo.x, sukuna.x, f.time], [gx, sx, t], 'frozen until the answer');
});

test('right answer: Sukuna is beaten on the spot', () => {
  const { f, gojo, sukuna } = domainFight(0.5);
  hurt(f, gojo, 1000, { from: sukuna });
  resolveDomain(f, true);
  assert.equal(sukuna.hp, 0);
  assert.equal(f.pending, null);
  stepFight(f, 1 / 30);
  assert.equal(f.over?.winner, 'a');
});

test('wrong answer: Gojo heals back to full', () => {
  const { f, gojo, sukuna } = domainFight(0.5);
  hurt(f, gojo, 1000, { from: sukuna });
  resolveDomain(f, false);
  assert.equal(gojo.hp, gojo.maxHp);
  assert.ok(sukuna.hp > 0);
});

test('the other 25%: "nice match", and he stays in on 1', () => {
  const { f, gojo, sukuna } = domainFight(0.9);
  hurt(f, gojo, 1000, { from: sukuna });
  assert.equal(gojo.hp, 1);
  assert.equal(f.pending, null);
  assert.ok(f.log.some((line) => (line.text || line).includes('Nice match')));
});

test('only Sukuna, and only once', () => {
  const other = createFight({ a: ['gojo'], b: ['garou'], random: () => 0.5, asks: true });
  hurt(other, other.sides.a.team[0], 1000, { from: other.sides.b.team[0] });
  assert.equal(other.sides.a.team[0].hp, 0, 'Garou just knocks him out');

  const { f, gojo, sukuna } = domainFight(0.5);
  hurt(f, gojo, 1000, { from: sukuna });
  resolveDomain(f, false);
  hurt(f, gojo, 1000, { from: sukuna });
  assert.equal(gojo.hp, 0, 'the second time is the last');
});

test('with nobody to ask, the answer counts as wrong and the fight goes on', () => {
  const { f, gojo, sukuna } = domainFight(0.5, false);
  hurt(f, gojo, 1000, { from: sukuna });
  assert.equal(f.pending, null);
  assert.equal(gojo.hp, gojo.maxHp);
});

test('the chess answer: about 10^120, however it is written', () => {
  for (const yes of ['10^120', '10 ^ 120', '10**120', '1e120', '1E+120', '10 to the 120', '10 to the power of 120', 'about 10^120', 'the Shannon number', `1${'0'.repeat(120)}`]) {
    assert.ok(isChessAnswer(yes), yes);
  }
  for (const no of ['', '120', '10^80', '10^12', 'infinite', '1000000', '10^1200', `1${'0'.repeat(119)}`]) {
    assert.equal(isChessAnswer(no), false, no);
  }
});

test('the Void and Gojo without his blindfold draw', async () => {
  const { drawVoid } = await import('../src/games/faceoff/art.js');
  const ctx = createFakeContext();
  drawVoid(ctx, 1.2, 'Correct!');
  const { gojo } = domainFight(0.5);
  gojo.blindfoldOff = true;
  drawBall(ctx, gojo);
  assert.ok(ctx.calls > 100);
});

test('a fighter written with a single ability still has it listed', () => {
  // Nobody is written that way any more; the factory still has to accept it.
  assert.ok(FIGHTERS.every((f) => f.abilities.length >= 1));
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

test('Sans has Blue Magic, Gaster Blaster, Bone Wave and his Last Attack', () => {
  assert.deepEqual(getFighter('sans').abilities.map((a) => a.name), ['Blue Magic', 'Gaster Blaster', 'Bone Wave', 'Last Attack']);
});

/** Sans against a Goku who cannot die, held wherever the test puts him. */
function blasterFight() {
  const f = fight(['sans', 'garou'], ['goku']);
  quiet(f);
  const [sans, goku] = [frontOf(f, 'a'), frontOf(f, 'b')];
  sans.timers.launch = -1000;              // keep Blue Magic out of it
  sans.timers.bones = -1000;               // and the Bone Wave
  sans.timers.blaster = 7.99;
  const spot = { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 };
  const step = () => {
    goku.hitLock = sans.hitLock = 99; f.sinceBump = 0;
    goku.x = spot.x; goku.y = spot.y;
    sans.x = BOX.x + 60; sans.y = BOX.y + BOX.h - 60;
    stepFight(f, 1 / 30);
  };
  return { f, sans, goku, step, spot };
}

const shapeOf = (blasters) => blasters.map((b) => `${b.from}>${b.to}`).sort().join(' ');

test('the run goes corners at the middle, corners along the walls, corners again, then two big ones', () => {
  const { f, step } = blasterFight();
  const seen = [];
  for (let i = 0; i < 30 * 13; i += 1) {
    step();
    const now = shapeOf(f.blasters);
    if (now && now !== seen.at(-1)) seen.push(now);
  }
  const corners = 'bottom-left>middle bottom-right>middle top-left>middle top-right>middle';
  const walls = 'bottom-left>bottom-right bottom-right>top-right top-left>bottom-left top-right>top-left';
  assert.deepEqual(seen, [corners, walls, corners, 'left>middle right>middle']);
  assert.ok(f.time > 12);
});

test('in the middle, every corner blast and both big ones hit, 1 a frame each', () => {
  const { f, goku, step } = blasterFight();
  // Add up what Goku takes under each set of blasters.
  const bySet = [];
  let last = '';
  for (let i = 0; i < 30 * 13; i += 1) {
    const before = goku.taken;
    step();
    const now = shapeOf(f.blasters);
    if (now && now !== last) bySet.push(0);
    if (now) bySet[bySet.length - 1] += goku.taken - before;
    last = now;
  }
  // Corners 4 x 90 frames, walls miss the middle, big ones 2 x 90. A set's last
  // frame can land as the next set appears, so each is allowed a frame or two either way.
  assert.equal(bySet.length, 4);
  [360, 0, 360, 180].forEach((want, i) => assert.ok(Math.abs(bySet[i] - want) <= 8, `set ${i + 1}: ${bySet[i]}`));
});

test('beams only hit whoever is in them', () => {
  const steps = getFighter('sans').abilities.find((a) => a.kind === 'blaster').steps;
  // Left of the middle, between the two left diagonals and clear of the left wall.
  const clear = { x: BOX.x + 104, y: BOX.y + BOX.h / 2 };
  for (const blast of [...steps[0].blasts, ...steps[1].blasts]) assert.equal(onBeam(blast, clear), false, `${blast.from}>${blast.to}`);
  const middle = { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 };
  assert.ok(steps[0].blasts.every((blast) => onBeam(blast, middle)));
  assert.ok(steps[3].blasts.every((blast) => onBeam(blast, middle)));
});

test('along a wall, only that wall\'s beam hits', () => {
  const { goku, step, spot } = blasterFight();
  spot.x = BOX.x + BOX.w / 2;
  spot.y = BOX.y + BOX.h - BALL_RADIUS;    // against the bottom wall, under the middle
  for (let i = 0; i < 30 * 6.05; i += 1) step();
  assert.equal(Math.round(goku.taken), 90, 'one beam, 90 frames');
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
  // Halfway down the top-left corner's beam, clear of the others.
  const { start, end } = beamLine({ from: 'top-left', to: 'middle' });
  for (let i = 0; i < 30 * 0.5 && !f.over; i += 1) {
    mine.hitLock = theirs.hitLock = 99; f.sinceBump = 0;
    theirs.x = (start.x + end.x) / 2; theirs.y = (start.y + end.y) / 2;
    mine.x = BOX.x + BOX.w - 80; mine.y = BOX.y + BOX.h / 2 + 60;
    stepFight(f, 1 / 30);
  }
  assert.equal(theirs.hp, 1, 'he is still standing');
  assert.ok(theirs.dodgesLeft >= 9 && theirs.dodgesLeft <= 11, `${24 - theirs.dodgesLeft} dodges in half a second of beam`);
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
  const { drawBlaster } = await import('../src/games/faceoff/art.js');
  const ctx = createFakeContext();
  for (const step of getFighter('sans').abilities.find((a) => a.kind === 'blaster').steps) {
    for (const blast of step.blasts) {
      const { start, end } = beamLine(blast);
      for (const p of [start, end]) {
        assert.ok(p.x > BOX.x && p.x < BOX.x + BOX.w && p.y > BOX.y && p.y < BOX.y + BOX.h, `${blast.from} leaves the box`);
      }
      drawBlaster(ctx, blast, 1.3);
    }
  }
  assert.ok(ctx.calls > 20);
});

/* ------------------------------------------------------------ Bone Wave */

test('the Bone Wave comes every 20 seconds, and up against the ceiling it hits while it passes', () => {
  const f = fight(['sans', 'garou'], ['goku']);
  quiet(f);
  const [sans, goku] = [frontOf(f, 'a'), frontOf(f, 'b')];
  sans.timers.launch = -1000;
  sans.timers.blaster = -1000;
  sans.timers.bones = 19.99;
  const step = () => {
    goku.hitLock = sans.hitLock = 99; f.sinceBump = 0;
    goku.x = BOX.x + BOX.w / 2; goku.y = BOX.y + BALL_RADIUS;   // the gap never comes up this high
    sans.x = BOX.x + 60; sans.y = BOX.y + BOX.h - 60;
    stepFight(f, 1 / 30);
  };
  step();
  assert.equal(f.waves.length, 1);
  sans.timers.bones = -1000;
  const before = goku.taken;
  for (let i = 0; i < 30 * 5.5; i += 1) step();
  const hits = Math.round(goku.taken - before);
  assert.ok(hits >= 75 && hits <= 110, `${hits} hits while the bones went by`);
  assert.equal(f.waves.length, 0, 'and it has passed');
});

test('in the gap the bones miss; off the row they miss; on a bone they hit', () => {
  const wave = { from: 'left', left: 2.5, lasts: 5 };
  const x = BOX.x + BOX.w / 2;
  const back = boneAt(wave, x);
  assert.ok(back != null, 'halfway through, the row is over the middle');
  assert.equal(inBones(wave, { x, y: boneGapAt(back) }), false, 'right in the gap');
  assert.equal(inBones(wave, { x, y: BOX.y + BALL_RADIUS }), true, 'against the ceiling');
  assert.equal(inBones(wave, { x, y: BOX.y + BOX.h - BALL_RADIUS }), true, 'on the floor');
  const early = { from: 'left', left: 4.9, lasts: 5 };
  assert.equal(boneAt(early, BOX.x + BOX.w - 40), null, 'the far side has not been reached yet');
  assert.equal(inBones(early, { x: BOX.x + BOX.w - 40, y: BOX.y + BALL_RADIUS }), false);
  // The gap really weaves.
  const gaps = [0, 200, 400, 600, 800].map(boneGapAt);
  assert.ok(Math.max(...gaps) - Math.min(...gaps) > 100);
  for (const g of gaps) assert.ok(g - BONE_GAP / 2 >= BOX.y && g + BONE_GAP / 2 <= BOX.y + BOX.h, 'the gap stays in the box');
});

test('Sans dodges a Bone Wave a tick at a time', () => {
  const f = fight(['sans', 'garou'], ['sans']);
  const [mine, theirs] = [frontOf(f, 'a'), frontOf(f, 'b')];
  for (const s of [mine, theirs]) { s.timers.launch = -1000; s.timers.blaster = -1000; }
  theirs.timers.bones = -1000;
  mine.timers.bones = 19.99;
  for (let i = 0; i < 30 * 5.5 && !f.over; i += 1) {
    mine.hitLock = theirs.hitLock = 99; f.sinceBump = 0;
    theirs.x = BOX.x + BOX.w / 2; theirs.y = BOX.y + BALL_RADIUS;
    mine.x = BOX.x + 60; mine.y = BOX.y + BOX.h - 60;
    stepFight(f, 1 / 30);
  }
  assert.equal(theirs.hp, 1);
  // A frame at a time he dodges down to his last one - then out comes his own Last Attack.
  assert.equal(theirs.dodgesLeft, 1);
  assert.ok(theirs.finaleUsed);
});

/* ---------------------------------------------------------- Last Attack */

/** Sans one dodge from his Last Attack, against a Goku who cannot die. */
function finaleFight() {
  const f = fight(['sans'], ['goku']);
  quiet(f);
  const [sans, goku] = [frontOf(f, 'a'), frontOf(f, 'b')];
  for (const kind of ['launch', 'blaster', 'bones']) sans.timers[kind] = -1000;
  sans.dodgesLeft = 2;
  sans.hp = sans.maxHp = 1;                // quiet() made everyone unkillable; Sans is back to 1
  return { f, sans, goku };
}

test('down to his last dodge, Sans starts his Last Attack - once', () => {
  const { f, sans } = finaleFight();
  hurt(f, sans, 5);
  assert.equal(sans.dodgesLeft, 1);
  assert.equal(f.finales.length, 1);
  assert.ok(f.log.some((line) => line.text?.includes('Last Attack')) || f.events.some((e) => e.kind === 'finale'));
  assert.equal(hurt(f, sans, 50), 0, 'nothing touches him while he does it');
  assert.equal(sans.dodgesLeft, 1, 'and it does not cost his last dodge');
  f.finales = [];
  sans.dodgesLeft = 2;
  hurt(f, sans, 5);
  assert.equal(f.finales.length, 0, 'only the once');
});

test('the Last Attack: twelve slams into the walls, then a ring of eight blasters, then he is tired', () => {
  const { f, sans, goku } = finaleFight();
  hurt(f, sans, 5);
  const blasters = new Set();
  const walls = new Set();
  let slams = 0;
  let spikes = 0;
  for (let i = 0; i < 30 * 15 && f.finales.length; i += 1) {
    sans.hitLock = goku.hitLock = 99; f.sinceBump = 0;
    f.events.length = 0;
    stepFight(f, 1 / 30);
    slams += f.events.filter((e) => e.kind === 'slam' && e.uid === goku.uid).length;
    for (const b of f.blasters) if (b.finale) blasters.add(b);
    for (const s of f.spikes) walls.add(s.wall);
    spikes = Math.max(spikes, f.spikes.length);
  }
  assert.equal(f.finales.length, 0, 'it ends');
  assert.equal(slams, 12);
  assert.ok(walls.size >= 3, `bones came out of ${[...walls].join(', ')}`);
  assert.equal(blasters.size, 8);
  assert.ok(goku.taken > 20, `Goku took ${goku.taken}`);
  assert.equal(sans.dodgesLeft, 1);
  assert.equal(sans.hp, 1);
});

test('the wall bones draw on every wall', async () => {
  const { drawSpikes } = await import('../src/games/faceoff/art.js');
  const ctx = createFakeContext();
  for (const wall of ['left', 'right', 'up', 'down']) drawSpikes(ctx, { wall, left: 0.2 });
  assert.ok(ctx.calls > 40);
});

test('the bones draw from either side', async () => {
  const { drawBones } = await import('../src/games/faceoff/art.js');
  const ctx = createFakeContext();
  for (const from of ['left', 'right']) {
    for (const left of [5, 2.5, 0.1]) drawBones(ctx, { from, left, lasts: 5 });
  }
  assert.ok(ctx.calls > 30);
});

/* ------------------------------------------------------------- Fireball */

test('Ralsei has Burn and Fireball', () => {
  assert.deepEqual(getFighter('ralsei').abilities.map((a) => a.name), ['Burn', 'Fireball']);
});

test('a Fireball is thrown every 10 seconds and does 20 when it lands', () => {
  const f = fight(['ralsei'], ['garou']);
  const [ralsei, garou] = [frontOf(f, 'a'), frontOf(f, 'b')];
  ralsei.x = BOX.x + 120; ralsei.y = BOX.y + 150;
  garou.x = BOX.x + 500; garou.y = BOX.y + 150;
  ralsei.timers.shot = 9.99;
  const before = garou.hp;
  for (let i = 0; i < 120 && (f.shots.length || garou.hp === before); i += 1) {
    garou.x = BOX.x + 500; garou.y = BOX.y + 150; garou.vx = garou.vy = 0;
    garou.hitLock = ralsei.hitLock = 99;
    f.sinceBump = 0;
    stepFight(f, 1 / 60);
  }
  assert.equal(before - garou.hp, 20);
  assert.equal(f.shots.length, 0);
});

test('the fireball draws', async () => {
  const { drawShot } = await import('../src/games/faceoff/art.js');
  const ctx = createFakeContext();
  drawShot(ctx, { x: 300, y: 200, dx: 1, dy: 0, size: 13, style: 'ball', colour: '#ff8a1a' });
  assert.ok(ctx.calls > 8);
});

test('a Fireball that lands sets the enemy burning', () => {
  const f = fight(['ralsei'], ['garou']);
  const [ralsei, garou] = [frontOf(f, 'a'), frontOf(f, 'b')];
  ralsei.x = BOX.x + 120; ralsei.y = BOX.y + 150;
  ralsei.timers.shot = 9.99;
  for (let i = 0; i < 120 && !garou.burn; i += 1) {
    garou.x = BOX.x + 500; garou.y = BOX.y + 150; garou.vx = garou.vy = 0;
    garou.hitLock = ralsei.hitLock = 99;
    f.sinceBump = 0;
    stepFight(f, 1 / 60);
  }
  assert.ok(garou.burn, 'it burns');
  assert.equal(garou.burn.left > 14, true, 'for the full 15 seconds');
});

test('a dodged Fireball sets nothing alight', () => {
  const f = fight(['ralsei'], ['sans']);
  const [ralsei, sans] = [frontOf(f, 'a'), frontOf(f, 'b')];
  ralsei.x = BOX.x + 120; ralsei.y = BOX.y + 150;
  ralsei.timers.shot = 9.99;
  for (const k of Object.keys(sans.timers)) sans.timers[k] = -1000;
  for (let i = 0; i < 120 && sans.dodgesLeft === 24; i += 1) {
    sans.x = BOX.x + 500; sans.y = BOX.y + 150; sans.vx = sans.vy = 0;
    sans.hitLock = ralsei.hitLock = 99;
    f.sinceBump = 0;
    stepFight(f, 1 / 60);
  }
  assert.equal(sans.dodgesLeft, 23);
  assert.equal(sans.burn, null);
});

/* --------------------------------------------------------------- Spears */

test('Undyne has her comeback and her Spears', () => {
  assert.deepEqual(getFighter('undyne').abilities.map((a) => a.name), ['Undyne the Undying', 'Spears']);
});

test('she throws 8 spears one at a time, and each that lands does 5', () => {
  const f = fight(['undyne'], ['garou']);
  quiet(f);
  const [undyne, garou] = [frontOf(f, 'a'), frontOf(f, 'b')];
  undyne.x = BOX.x + 120; undyne.y = BOX.y + 150;
  undyne.timers.volley = 9.99;
  let thrown = 0;
  let most = 0;
  for (let i = 0; i < 60 * 6; i += 1) {
    garou.x = BOX.x + 500; garou.y = BOX.y + 150; garou.vx = garou.vy = 0;
    garou.hitLock = undyne.hitLock = 99;
    f.sinceBump = 0;
    const before = f.shots.length;
    stepFight(f, 1 / 60);
    if (i > 0) undyne.timers.volley = -1000;
    thrown += Math.max(0, f.shots.length - before);
    most = Math.max(most, f.shots.length);
  }
  assert.equal(Math.round(garou.taken), 40, 'eight spears, five each');
  assert.ok(most < 8, 'they were thrown one at a time, never all at once');
});

test('the spears stop coming when Undyne goes down', () => {
  const f = fight(['undyne', 'goku'], ['garou']);
  const undyne = frontOf(f, 'a');
  undyne.undyingRolled = true;             // no comeback for this one
  undyne.timers.volley = 9.99;
  stepFight(f, 1 / 60);
  assert.equal(f.volleys.length, 1);
  hurt(f, undyne, 10000);
  stepFight(f, 1 / 60);
  assert.equal(f.volleys.length, 0);
});

test('a spear draws', async () => {
  const { drawShot } = await import('../src/games/faceoff/art.js');
  const ctx = createFakeContext();
  drawShot(ctx, { x: 300, y: 200, dx: 0.6, dy: 0.8, length: 46, style: 'spear', colour: '#6ab4ff' });
  assert.ok(ctx.calls > 5);
});

/* ----------------------------------------------------------- Kamehameha */

test('Goku has Instant Transmission and Kamehameha', () => {
  assert.deepEqual(getFighter('goku').abilities.map((a) => a.name), ['Instant Transmission', 'Kamehameha', 'Transformations']);
});

test('a Kamehameha does 3 every 0.8 seconds for 8 seconds, every 11', () => {
  const f = fight(['goku'], ['garou']);
  quiet(f);
  const [goku, garou] = [frontOf(f, 'a'), frontOf(f, 'b')];
  goku.timers.teleport = -1000;
  goku.timers.beam = 10.99;
  const step = () => { garou.hitLock = goku.hitLock = 99; f.sinceBump = 0; garou.x = goku.x + 400; stepFight(f, 1 / 60); };
  step();
  assert.equal(f.beams.length, 1);
  goku.timers.beam = -1000;
  const before = garou.taken;
  for (let i = 0; i < 60 * 8.5; i += 1) step();
  assert.equal(Math.round(garou.taken - before), 30, 'ten hits of 3');
  assert.equal(f.beams.length, 0);
});

test('the beam stops when Goku goes down, and Sans dodges each hit', () => {
  const f = fight(['goku', 'garou'], ['sans']);
  const [goku, sans] = [frontOf(f, 'a'), frontOf(f, 'b')];
  for (const k of Object.keys(sans.timers)) sans.timers[k] = -1000;
  goku.timers.teleport = -1000;
  goku.timers.beam = 10.99;
  for (let i = 0; i < 60 * 1.7; i += 1) { sans.hitLock = goku.hitLock = 99; f.sinceBump = 0; sans.x = goku.x + 400; stepFight(f, 1 / 60); }
  assert.equal(sans.hp, 1);
  assert.equal(sans.dodgesLeft, 22, 'two hits, two dodges');
  goku.formLevel = 99;                     // past Ultra Instinct, so this hit really does put him down
  goku.dodgesLeft = 0;
  hurt(f, goku, 10000);
  stepFight(f, 1 / 60);
  assert.equal(f.beams.length, 0);
});

test('Goku goes Super Saiyan at 75%, God at 50%, Blue at 25% - and never back down', () => {
  const f = fight(['goku'], ['garou']);
  const goku = frontOf(f, 'a');
  assert.equal(goku.form, null);
  hurt(f, goku, 60);                         // 190 of 250: not yet
  assert.equal(goku.form, null);
  hurt(f, goku, 5);                          // 185: under 75%
  assert.equal(goku.form.name, 'Super Saiyan');
  hurt(f, goku, 70);                         // 115: under 50%
  assert.equal(goku.form.name, 'Super Saiyan God');
  heal(f, goku, 200);
  assert.equal(goku.form.name, 'Super Saiyan God', 'healing does not take it away');
  hurt(f, goku, 200);                        // 50: under 25%
  assert.equal(goku.form.name, 'Super Saiyan Blue');
  // Straight past a form or two in one hit lands in the highest reached.
  const g = fight(['goku'], ['garou']);
  hurt(g, frontOf(g, 'a'), 140);
  assert.equal(frontOf(g, 'a').form.name, 'Super Saiyan God');
});

test('each form hits harder: 1.25x, 1.5x, 1.75x, then 2x', () => {
  const f = fight(['goku'], ['garou']);
  const [goku, garou] = [frontOf(f, 'a'), frontOf(f, 'b')];
  const ability = goku.spec.abilities.find((a) => a.kind === 'forms');
  for (const [form, want] of [[null, 10], [ability.forms[0], 12.5], [ability.forms[1], 15], [ability.forms[2], 17.5], [ability.last, 20]]) {
    goku.form = form;
    garou.hp = garou.maxHp;
    assert.equal(hurt(f, garou, 10, { from: goku }), want);
  }
});

test('he heals 3, 5, 7 or 10 every 1.5 seconds, by form', () => {
  for (const [hp, gain] of [[180, 3], [120, 5], [60, 7]]) {
    const f = fight(['goku'], ['garou']);
    quiet(f);
    const goku = frontOf(f, 'a');
    goku.hp = goku.maxHp = 250;
    hurt(f, goku, 250 - hp);
    for (const k of Object.keys(goku.timers)) goku.timers[k] = -1000;
    goku.timers.forms = 1.5 - 1e-6;
    const before = goku.hp;
    goku.hitLock = 99; f.sides.b.team[0].hitLock = 99;
    f.sides.b.team[0].x = goku.x + 400;
    stepFight(f, 1 / 60);
    assert.equal(Math.round(goku.hp - before), gain, `${goku.form.name}`);
  }
});

test('the hit that would knock him out leaves him on 1, in Ultra Instinct with 5 dodges', () => {
  const f = fight(['goku'], ['saitama']);
  const goku = frontOf(f, 'a');
  hurt(f, goku, 100000);
  assert.equal(goku.hp, 1);
  assert.equal(goku.form.name, 'Ultra Instinct');
  assert.equal(goku.dodgesLeft, 5);
  for (let i = 0; i < 5; i += 1) assert.equal(hurt(f, goku, 50), 0, 'dodged');
  hurt(f, goku, 50);
  assert.equal(goku.hp, 0, 'only the once');
});

test('every form draws', async () => {
  const f = fight(['goku'], ['garou']);
  const goku = frontOf(f, 'a');
  const ctx = createFakeContext();
  for (const form of goku.spec.abilities.find((a) => a.kind === 'forms').forms) {
    goku.form = form;
    drawBall(ctx, goku);
  }
  assert.ok(ctx.calls > 40);
});

/* --------------------------------------------------------------- Vegeta */

/** Puts Goku down for good, past Ultra Instinct. */
const knockOut = (f, goku) => { goku.formLevel = 99; goku.dodgesLeft = 0; hurt(f, goku, 100000); };

test('when Goku is out, Vegeta comes to help the next one, and they split the health', () => {
  const f = fight(['goku', 'garou'], ['beerus']);
  knockOut(f, f.sides.a.team[0]);
  stepFight(f, 1 / 60);
  const garou = frontOf(f, 'a');
  assert.equal(garou.name, 'Garou');
  assert.equal(garou.maxHp, 125);
  assert.equal(garou.hp, 125);
  assert.equal(f.helpers.length, 1);
  const vegeta = f.helpers[0];
  assert.equal(vegeta.name, 'Vegeta');
  assert.equal(vegeta.side, 'a');
  assert.equal(vegeta.hp, 125);
  assert.deepEqual(vegeta.spec.abilities.map((a) => a.name), ['Instant Transmission', 'Kamehameha']);
  assert.equal(vegeta.form, null);
});

test('Vegeta does half what Goku does', () => {
  const f = fight(['goku', 'garou'], ['beerus']);
  knockOut(f, f.sides.a.team[0]);
  stepFight(f, 1 / 60);
  const [vegeta, beerus] = [f.helpers[0], frontOf(f, 'b')];
  assert.equal(hurt(f, beerus, 10, { from: vegeta }), 5);
});

test('Vegeta fights: he bumps, fires his Kamehameha, and goes when he is beaten', () => {
  const f = fight(['goku', 'garou'], ['beerus']);
  quiet(f);
  knockOut(f, f.sides.a.team[0]);
  stepFight(f, 1 / 60);
  const vegeta = f.helpers[0];
  vegeta.hp = vegeta.maxHp = 125;
  vegeta.timers.beam = 11 - 1e-6;
  const beerus = frontOf(f, 'b');
  const before = beerus.taken;
  let beamed = false;
  for (let i = 0; i < 60 * 20; i += 1) {
    stepFight(f, 1 / 60);
    if (f.beams.some((b) => b.owner === vegeta)) beamed = true;
  }
  assert.ok(beamed, 'his Kamehameha');
  assert.ok(beerus.taken > before, 'and it all hurt');
  vegeta.dodgesLeft = 0;
  hurt(f, vegeta, 1000);
  stepFight(f, 1 / 60);
  assert.equal(f.helpers.length, 0);
});

test('no Vegeta if Goku was the last one, and Sans keeps his 1', () => {
  const f = fight(['goku'], ['beerus']);
  knockOut(f, f.sides.a.team[0]);
  stepFight(f, 1 / 60);
  assert.equal(f.helpers.length, 0);
  assert.ok(f.over);

  const g = fight(['goku', 'sans'], ['beerus']);
  knockOut(g, g.sides.a.team[0]);
  stepFight(g, 1 / 60);
  assert.equal(frontOf(g, 'a').maxHp, 1);
  assert.equal(g.helpers.length, 1);
});

test('Vegeta and the shared health bar draw', async () => {
  const { drawStatus } = await import('../src/games/faceoff/art.js');
  const f = fight(['goku', 'garou'], ['beerus']);
  knockOut(f, f.sides.a.team[0]);
  stepFight(f, 1 / 60);
  const ctx = createFakeContext();
  drawBall(ctx, f.helpers[0]);
  drawStatus(ctx, frontOf(f, 'a'), 100, 400, 'left', f.helpers[0]);
  assert.ok(ctx.calls > 20);
});

test('the Kamehameha draws', async () => {
  const { drawBeam } = await import('../src/games/faceoff/art.js');
  const ctx = createFakeContext();
  drawBeam(ctx, { colour: '#6ac8ff' }, { x: 200, y: 200, radius: 30 }, { x: 600, y: 260 }, 1);
  drawBeam(ctx, { colour: '#6ac8ff' }, null, { x: 600, y: 260 }, 1);
  assert.ok(ctx.calls > 5);
});

/* ------------------------------------------------ Water Stream Rock Smashing Fist */

test('Garou has Double Hit and his Water Stream dash', () => {
  assert.deepEqual(getFighter('garou').abilities.map((a) => a.name), ['Double Hit', 'Water Stream Rock Smashing Fist']);
});

/** Garou facing a target that cannot die, the dash about to go. */
function dashFight(target = 'goku') {
  const f = fight(['garou'], [target]);
  const [garou, foe] = [frontOf(f, 'a'), frontOf(f, 'b')];
  for (const k of Object.keys(foe.timers)) foe.timers[k] = -1000;
  garou.x = BOX.x + 200; garou.y = BOX.y + 150;
  foe.x = BOX.x + 360; foe.y = BOX.y + 150;
  garou.timers.dash = 15 - 1e-6;
  return { f, garou, foe };
}

test('the dash goes every 15 seconds, and one that lands does 10 and knocks them back', () => {
  const { f, garou, foe } = dashFight();
  foe.hp = foe.maxHp = 100000;
  stepFight(f, 1 / 120);
  assert.ok(garou.dash, 'he is dashing');
  foe.hitLock = 99;
  let landed = false;
  for (let i = 0; i < 120 && !landed; i += 1) {
    stepFight(f, 1 / 120);
    landed = foe.taken > 0;
  }
  assert.ok(landed);
  assert.equal(foe.taken, 10);
  assert.ok(foe.launched, 'and they are knocked back');
});

/** Steps a fight, counting the dash's own hits and dodges (not ordinary bumps). */
function runDash(f, garou, seconds) {
  const tally = { hits: 0, missed: 0, missWhileDashing: [] };
  for (let i = 0; i < 60 * seconds; i += 1) {
    const wasDashing = Boolean(garou.dash);
    stepFight(f, 1 / 60);
    if (i > 1) garou.timers.dash = -1000;
    for (const e of f.events) {
      if (e.kind === 'damage' && e.source === 'dash') tally.hits += 1;
      if (e.kind === 'miss' && wasDashing) { tally.missed += 1; tally.missWhileDashing.push(Boolean(garou.dash)); }
    }
  }
  return tally;
}

test('when it lands he goes again, but never more than 5 times', () => {
  let most = 0;
  for (let seed = 1; seed <= 30; seed += 1) {
    const { f, garou, foe } = dashFight();
    f.random = seededRandom(seed);
    foe.hp = foe.maxHp = 100000;
    const { hits } = runDash(f, garou, 4);
    most = Math.max(most, hits);
    assert.ok(hits <= 5, `seed ${seed}: ${hits} hits`);
  }
  assert.ok(most >= 2, 'it should chain at least sometimes');
});

test('a dash Sans dodges ends the combo', () => {
  const { f, garou } = dashFight('sans');
  const { hits, missed, missWhileDashing } = runDash(f, garou, 2);
  assert.equal(hits, 0);
  assert.ok(missed >= 1, 'the dash reached him and he dodged it');
  assert.equal(missWhileDashing[0], false, 'and Garou stopped there instead of going again');
});

test('a dash that hits a wall or runs out just ends', () => {
  const { f, garou, foe } = dashFight();
  foe.x = BOX.x + BOX.w - 60;   // far away, then out of the line
  stepFight(f, 1 / 120);
  foe.y = BOX.y + BOX.h - 40;
  for (let i = 0; i < 120 && garou.dash; i += 1) stepFight(f, 1 / 120);
  assert.equal(garou.dash, null);
});

test('a dashing Garou draws', () => {
  const ctx = createFakeContext();
  const { f, garou } = dashFight();
  stepFight(f, 1 / 120);
  assert.doesNotThrow(() => drawBall(ctx, garou, {}));
});

/* ----------------------------------------------------------- Table Flip */

test('Saitama has Serious Punch and Table Flip', () => {
  assert.deepEqual(getFighter('saitama').abilities.map((a) => a.name), ['Serious Punch', 'Table Flip']);
});

function tableFight(target = 'garou') {
  const f = fight(['saitama'], [target]);
  const [saitama, foe] = [frontOf(f, 'a'), frontOf(f, 'b')];
  for (const k of Object.keys(foe.timers)) foe.timers[k] = -1000;
  saitama.x = BOX.x + 150; saitama.y = BOX.y + 150;
  saitama.timers.windup = 15 - 1e-6;
  const hold = () => { foe.x = BOX.x + 560; foe.y = BOX.y + 150; foe.vx = foe.vy = 0; foe.hitLock = saitama.hitLock = 99; f.sinceBump = 0; };
  return { f, saitama, foe, hold };
}

test('every 15 seconds he stands still for 2 with the triangle over him', () => {
  const { f, saitama, hold } = tableFight();
  hold();
  stepFight(f, 1 / 60);
  assert.ok(saitama.windup, 'he is winding up');
  const at = { x: saitama.x, y: saitama.y };
  for (let i = 0; i < 60 * 1.9; i += 1) { hold(); stepFight(f, 1 / 60); }
  assert.ok(saitama.windup, 'still holding at 1.9 seconds');
  assert.equal(saitama.x, at.x);
  assert.equal(saitama.y, at.y, 'and he has not moved');
  assert.equal(f.shots.length, 0, 'nothing thrown yet');
  for (let i = 0; i < 12; i += 1) { hold(); stepFight(f, 1 / 60); }
  assert.equal(saitama.windup, null);
  assert.equal(f.shots.length, 1, 'then the table goes');
});

test('the table does 50 when it lands', () => {
  const { f, saitama, foe, hold } = tableFight();
  saitama.timers.windup = 15 - 1e-6;
  for (let i = 0; i < 60 * 4 && foe.taken === 0; i += 1) { hold(); stepFight(f, 1 / 60); if (i > 1) saitama.timers.windup = -1000; }
  assert.equal(foe.taken, 50);
});

test('Sans dodges the table like anything else', () => {
  const { f, saitama, foe, hold } = tableFight('sans');
  for (let i = 0; i < 60 * 4 && foe.dodgesLeft === 24; i += 1) { hold(); stepFight(f, 1 / 60); if (i > 1) saitama.timers.windup = -1000; }
  assert.equal(foe.hp, 1);
  assert.equal(foe.dodgesLeft, 23);
});

test('standing still costs him: a bump while he winds up hits him harder', () => {
  let still = 0;
  let moving = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    for (const holding of [true, false]) {
      const f = fight(['saitama'], ['garou'], seed);
      const [saitama, garou] = [frontOf(f, 'a'), frontOf(f, 'b')];
      Object.assign(garou, { x: 440, y: 240, vx: -160, vy: 0, hitLock: 0 });
      Object.assign(saitama, { x: 400, y: 240, vx: holding ? 0 : 160, vy: 0, hitLock: 0 });
      bump(f, saitama, garou);
      if (holding) still += saitama.taken; else moving += saitama.taken;
    }
  }
  assert.ok(still > moving);
});

test('the windup and the flying table draw', async () => {
  const { drawWindup, drawShot } = await import('../src/games/faceoff/art.js');
  const ctx = createFakeContext();
  drawWindup(ctx, { x: 300, y: 300, radius: 30, windup: { left: 1, hold: 2 } });
  drawWindup(ctx, { x: 300, y: 300, radius: 30, windup: null });
  drawShot(ctx, { x: 400, y: 200, dx: 1, dy: 0, size: 26, style: 'table' });
  assert.ok(ctx.calls > 10);
});

/* ---------------------------------------------------------------- Hakai */

test('Beerus has Summon Whis and Hakai', () => {
  assert.deepEqual(getFighter('beerus').abilities.map((a) => a.name), ['Summon Whis', 'Hakai']);
});

function hakaiFight(target = 'garou') {
  const f = fight(['beerus'], [target]);
  const [beerus, foe] = [frontOf(f, 'a'), frontOf(f, 'b')];
  for (const k of Object.keys(foe.timers)) foe.timers[k] = -1000;
  beerus.timers.summon = -1000;
  beerus.x = BOX.x + 60; beerus.y = BOX.y + 60;
  foe.x = BOX.x + 500; foe.y = BOX.y + 150;
  beerus.timers.zone = 18 - 1e-6;
  const hold = (x = BOX.x + 500, y = BOX.y + 150) => {
    foe.x = x; foe.y = y; foe.vx = foe.vy = 0;
    beerus.x = BOX.x + 60; beerus.y = BOX.y + 60;
    foe.hitLock = beerus.hitLock = 99; f.sinceBump = 0;
  };
  return { f, beerus, foe, hold };
}

test('every 18 seconds a square comes down on the enemy and shrinks: 5s, 3s, 1.5s', async () => {
  const { zoneSize } = await import('../src/games/faceoff/battle.js');
  const { f, beerus, hold } = hakaiFight();
  hold();
  stepFight(f, 1 / 60);
  beerus.timers.zone = -1000;
  assert.equal(f.zones.length, 1);
  const zone = f.zones[0];
  assert.equal(zone.x, BOX.x + 500);
  const sizeAt = (t) => { while (f.time < t) { hold(); stepFight(f, 1 / 60); } return f.zones[0] ? zoneSize(f.zones[0]) : 0; };
  const t0 = f.time;
  assert.equal(sizeAt(t0 + 4.9), 240, 'big');
  assert.equal(sizeAt(t0 + 7.9), 150, 'medium');
  assert.equal(sizeAt(t0 + 9.4), 80, 'small');
  assert.equal(sizeAt(t0 + 9.6), 0, 'gone');
});

test('inside it the enemy takes 5 every half second', () => {
  const { f, beerus, foe, hold } = hakaiFight();
  foe.hp = foe.maxHp = 100000;
  hold();
  stepFight(f, 1 / 60);
  beerus.timers.zone = -1000;
  const before = foe.taken;
  for (let i = 0; i < 60 * 9.6; i += 1) { hold(); stepFight(f, 1 / 60); }
  // 9.5 seconds of square, a tick every half second: the one that would land
  // at 9.5 arrives just as the square goes, so eighteen land.
  assert.equal(Math.round(foe.taken - before), 90, 'eighteen ticks of 5 across all three sizes');
});

test('out of it, nothing', () => {
  const { f, beerus, foe, hold } = hakaiFight();
  hold();
  stepFight(f, 1 / 60);
  beerus.timers.zone = -1000;
  for (let i = 0; i < 60 * 3; i += 1) { hold(BOX.x + 120, BOX.y + 250); stepFight(f, 1 / 60); }
  assert.equal(foe.taken, 0);
});

test('Sans dodges the square a tick at a time', () => {
  const { f, beerus, foe, hold } = hakaiFight('sans');
  hold();
  stepFight(f, 1 / 60);
  beerus.timers.zone = -1000;
  for (let i = 0; i < 60 * 1.1; i += 1) { hold(); stepFight(f, 1 / 60); }
  assert.equal(foe.hp, 1);
  assert.equal(foe.dodgesLeft, 22);
});

test('the square stays inside the box and draws', async () => {
  const { drawZone } = await import('../src/games/faceoff/art.js');
  const { f, beerus, foe } = hakaiFight();
  // The enemy tucked into the top-left corner, Beerus well away from them.
  foe.x = BOX.x + 40; foe.y = BOX.y + 40; foe.vx = foe.vy = 0;
  beerus.x = BOX.x + 600; beerus.y = BOX.y + 250;
  stepFight(f, 1 / 60);
  const zone = f.zones[0];
  const half = zone.stages[0].size / 2;
  assert.ok(zone.x - half >= BOX.x - 1, 'pushed in from the left wall');
  assert.ok(zone.y - half >= BOX.y - 1, 'and from the top');
  const ctx = createFakeContext();
  drawZone(ctx, zone, 1);
  assert.ok(ctx.calls >= 5);
});
