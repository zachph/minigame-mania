import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/core/utils.js';
import {
  BASE_TEMPO,
  CHARGE_FULL,
  FIGHTERS,
  FIGHT_LIMIT,
  MODES,
  PRESSURE_FROM,
  STORY,
  TEAM_SIZE,
  TOWER,
  getFighter,
} from '../src/games/faceoff/content.js';
import {
  ABILITIES,
  createFight,
  damageOf,
  frontOf,
  healthShare,
  heal,
  hurt,
  isBeaten,
  makeFighter,
  pressureAt,
  rollDamage,
  runFight,
  stepFight,
  takeTurn,
} from '../src/games/faceoff/battle.js';
import {
  drawBanner,
  drawBench,
  drawFighter,
  drawFrontPanel,
  drawLog,
  drawPopup,
  drawStage,
} from '../src/games/faceoff/art.js';
import { createFakeContext } from './helpers.js';

const fight = (a, b, seed = 11) =>
  createFight({ a, b, random: seededRandom(seed) });

/* ------------------------------------------------------------- the roster */

test('there are nine fighters, each doing something the fight can run', () => {
  assert.equal(FIGHTERS.length, 9);
  const seen = new Set();
  for (const spec of FIGHTERS) {
    assert.ok(spec.name && spec.blurb && spec.title, `${spec.id} says what it is`);
    assert.ok(ABILITIES[spec.ability.kind], `${spec.id} uses an unknown ability: ${spec.ability.kind}`);
    assert.ok(spec.ability.name, `${spec.id}'s ability has no name`);
    assert.ok(spec.hp > 0 && spec.attack > 0 && spec.speed > 0, `${spec.id} has a broken stat line`);
    assert.ok(!seen.has(spec.id), `two fighters share the id ${spec.id}`);
    seen.add(spec.id);
  }
});

test('an unknown fighter is a loud failure', () => {
  assert.throws(() => getFighter('nobody'), /Unknown fighter/);
});

test('every floor and chapter names fighters that exist', () => {
  for (const floor of TOWER) {
    assert.equal(floor.team.length, TEAM_SIZE, `floor ${floor.floor} is not three`);
    for (const id of floor.team) assert.doesNotThrow(() => getFighter(id));
  }
  for (const chapter of STORY) {
    assert.equal(chapter.team.length, TEAM_SIZE, `${chapter.id} is not three`);
    for (const id of chapter.team) assert.doesNotThrow(() => getFighter(id));
    assert.ok(chapter.before && chapter.after, `${chapter.id} has nothing to say`);
  }
  assert.equal(MODES.length, 3);
});

test('the tower gets harder, never easier', () => {
  for (let i = 1; i < TOWER.length; i += 1) {
    assert.ok(TOWER[i].scale >= TOWER[i - 1].scale, `floor ${i + 1} is not harder than floor ${i}`);
  }
});

/* -------------------------------------------------------------- the maths */

test('guard comes off every hit, and a hit never does nothing', () => {
  const heavy = makeFighter('bulwark');
  const small = makeFighter('flicker');
  const open = { ...small, guard: 0, brace: 0 };
  assert.ok(damageOf(small, heavy) < damageOf(small, open), 'guard soaked some of it');
  assert.ok(damageOf(small, heavy) >= 1, 'but never all of it');
});

test('guard hurts a flurry far more than it hurts one big hit', () => {
  const heavy = makeFighter('bulwark');
  const naked = { ...heavy, guard: 0, brace: 0 };
  const hitter = makeFighter('edge');
  const smallLoss = 1 - damageOf(hitter, heavy, 0.55) / damageOf(hitter, naked, 0.55);
  const bigLoss = 1 - damageOf(hitter, heavy, 2.4) / damageOf(hitter, naked, 2.4);
  assert.ok(smallLoss > bigLoss, 'a flat guard should bite hardest on small hits');
});

test('a rolled hit stays near its average and never goes under one', () => {
  const f = fight(['edge'], ['bulwark']);
  const average = damageOf(f.sides.a.team[0], f.sides.b.team[0]);
  let low = Infinity;
  let high = 0;
  for (let i = 0; i < 400; i += 1) {
    const rolled = rollDamage(f, f.sides.a.team[0], f.sides.b.team[0]);
    low = Math.min(low, rolled);
    high = Math.max(high, rolled);
    assert.ok(rolled >= 1);
  }
  assert.ok(low < average && high > average, 'it should land either side of the average');
  assert.ok(high / low < 2.2, `the spread ran away: ${low} to ${high}`);
});

test('the same two fighters do not play out identically twice', () => {
  const run = (seed) => {
    const f = fight(['edge', 'mender', 'bulwark'], ['flicker', 'rot', 'mirror'], seed);
    runFight(f);
    return `${f.over.winner} ${f.time.toFixed(2)}`;
  };
  const results = new Set([run(1), run(2), run(3), run(4), run(5)]);
  assert.ok(results.size > 1, 'every fight came out the same - nothing would be worth watching');
});

test('but the same seed does', () => {
  const run = () => {
    const f = fight(['leech', 'halt', 'encore'], ['bulwark', 'edge', 'rot'], 99);
    runFight(f);
    return `${f.over.winner} ${f.time.toFixed(3)} ${f.sides.a.team.map((x) => x.hp).join()}`;
  };
  assert.equal(run(), run());
});

/* ------------------------------------------------------------- the clock */

test('a faster fighter simply gets more goes', () => {
  const f = fight(['flicker'], ['bulwark']);
  const quick = f.sides.a.team[0];
  const slow = f.sides.b.team[0];
  quick.charge = 0;
  slow.charge = 0;
  for (let i = 0; i < 300; i += 1) stepFight(f, 1 / 30);
  assert.ok(quick.acts > slow.acts, `${quick.acts} against ${slow.acts}`);
});

test('a bar fills at the speed it says it does', () => {
  const f = fight(['mender'], ['mender']);
  const who = f.sides.a.team[0];
  who.charge = 0;
  const before = who.acts;
  const seconds = CHARGE_FULL / (who.speed * BASE_TEMPO);
  for (let i = 0; i < Math.round(seconds * 60); i += 1) stepFight(f, 1 / 60);
  assert.ok(who.acts > before, 'it should have had a go by now');
});

/* ---------------------------------------------------------- the abilities */

test('a strike lands much harder than a plain hit', () => {
  const f = fight(['edge'], ['bulwark']);
  const me = f.sides.a.team[0];
  const foe = f.sides.b.team[0];
  assert.ok(damageOf(me, foe, me.spec.ability.multiplier) > damageOf(me, foe) * 1.8);
});

test('poison keeps working after the fighter that set it has stopped', () => {
  const f = fight(['rot'], ['bulwark']);
  const me = f.sides.a.team[0];
  const foe = f.sides.b.team[0];
  for (const who of [me, foe]) { who.maxHp = 100000; who.hp = 100000; }
  ABILITIES.poison(f, me, foe, me.spec.ability);
  // Stop both of them acting, or Rot simply poisons it again every third go
  // and the thing under test never gets a chance to run out.
  for (const who of [me, foe]) who.speed = 0;
  assert.equal(foe.effects.length, 1);
  const before = foe.hp;
  for (let i = 0; i < 600; i += 1) stepFight(f, 1 / 60);
  assert.ok(foe.hp < before, 'it ticked');
  assert.equal(foe.effects.length, 0, 'and it ran out on its own');
});

test('poison ignores guard, which is the whole point of it', () => {
  const f = fight(['rot'], ['bulwark']);
  const foe = f.sides.b.team[0];
  const before = foe.hp;
  hurt(f, foe, 10, { kind: 'poison' });
  assert.equal(Math.round(before - foe.hp), 10);
});

test('a mend reaches the ones waiting, not just the one fighting', () => {
  const f = fight(['mender', 'edge', 'flicker'], ['bulwark']);
  const me = f.sides.a.team[0];
  const benched = f.sides.a.team[1];
  benched.hp = 10;
  ABILITIES.mend(f, me, f.sides.b.team[0], me.spec.ability);
  assert.ok(benched.hp > 10, 'it patched up the one on the bench');
});

test('a mend with nobody hurt says so rather than being wasted silently', () => {
  const f = fight(['mender'], ['bulwark']);
  const me = f.sides.a.team[0];
  const line = ABILITIES.mend(f, me, f.sides.b.team[0], me.spec.ability);
  assert.match(line, /nobody to patch/);
});

test('a drain gives back some of what it takes', () => {
  const f = fight(['leech'], ['bulwark']);
  const me = f.sides.a.team[0];
  me.hp = me.maxHp - 40;
  const before = me.hp;
  ABILITIES.drain(f, me, f.sides.b.team[0], me.spec.ability);
  assert.ok(me.hp > before, 'it kept some');
});

test('a stall empties their bar and still hits them', () => {
  const f = fight(['halt'], ['edge']);
  const me = f.sides.a.team[0];
  const foe = f.sides.b.team[0];
  foe.charge = 90;
  const hp = foe.hp;
  ABILITIES.stall(f, me, foe, me.spec.ability);
  assert.ok(foe.charge < 90, 'the bar went down');
  assert.ok(foe.hp < hp, 'and a go spent purely on tempo would lose the damage race');
});

test('a riposte sends some of a hit back at whoever threw it', () => {
  const f = fight(['mirror'], ['edge']);
  const me = f.sides.a.team[0];
  const foe = f.sides.b.team[0];
  ABILITIES.riposte(f, me, foe, me.spec.ability);
  const before = foe.hp;
  hurt(f, me, 30, { from: foe });
  assert.ok(foe.hp < before, 'it cost them to hit it');
});

test('a riposte only answers a swing, not a poison tick', () => {
  const f = fight(['mirror'], ['rot']);
  const me = f.sides.a.team[0];
  const foe = f.sides.b.team[0];
  ABILITIES.riposte(f, me, foe, me.spec.ability);
  const before = foe.hp;
  hurt(f, me, 30, { from: foe, kind: 'poison' });
  assert.equal(foe.hp, before);
});

test('bracing soaks more, and wears off', () => {
  const f = fight(['bulwark'], ['edge']);
  const me = f.sides.a.team[0];
  const foe = f.sides.b.team[0];
  for (const who of [me, foe]) { who.maxHp = 100000; who.hp = 100000; }
  const open = damageOf(foe, me);
  ABILITIES.brace(f, me, foe, me.spec.ability);
  assert.ok(damageOf(foe, me) < open, 'it is soaking more now');
  // As above: left to itself, Bulwark braces again before this one lapses.
  for (const who of [me, foe]) who.speed = 0;
  for (let i = 0; i < 400; i += 1) stepFight(f, 1 / 60);
  assert.equal(me.brace, 0, 'and it let go on its own');
});

/* ----------------------------------------------- the one that comes back */

test('Encore gets back up the first time it would go down', () => {
  const f = fight(['encore'], ['edge']);
  const me = f.sides.a.team[0];
  hurt(f, me, 10000, { from: f.sides.b.team[0] });
  assert.ok(me.hp > 0, 'it should still be standing');
  assert.equal(me.usedOnce, true);
});

test('and only the first time', () => {
  const f = fight(['encore'], ['edge']);
  const me = f.sides.a.team[0];
  hurt(f, me, 10000, { from: f.sides.b.team[0] });
  hurt(f, me, 10000, { from: f.sides.b.team[0] });
  assert.equal(me.hp, 0);
});

/**
 * The first version of Encore spent its ability on an attack, which used up
 * the one thing it was for - so it stayed down the one time it mattered and
 * won none of its fights. A passive ability must never be spent on a go.
 */
test('Encore never spends its second life on an attack', () => {
  const f = fight(['encore'], ['bulwark']);
  const me = f.sides.a.team[0];
  for (let i = 0; i < 12; i += 1) takeTurn(f, me);
  assert.equal(me.usedOnce, false, 'taking goes must not use up the rally');
  hurt(f, me, 10000, { from: f.sides.b.team[0] });
  assert.ok(me.hp > 0, 'so it is still there when it is needed');
});

/* ------------------------------------------------------------ the lineup */

test('when the one in front falls, the next of the three steps up', () => {
  const f = fight(['edge', 'mender', 'bulwark'], ['bulwark']);
  assert.equal(frontOf(f, 'a').name, 'Edge');
  hurt(f, f.sides.a.team[0], 10000, { from: f.sides.b.team[0] });
  stepFight(f, 1 / 60);
  assert.equal(frontOf(f, 'a').name, 'Mender');
});

test('a side with nobody left is beaten', () => {
  const f = fight(['edge', 'mender'], ['bulwark']);
  assert.equal(isBeaten(f.sides.a), false);
  for (const who of f.sides.a.team) hurt(f, who, 10000, { from: f.sides.b.team[0] });
  assert.equal(isBeaten(f.sides.a), true);
});

test('health share counts the bench as well as the one fighting', () => {
  const f = fight(['edge', 'mender', 'bulwark'], ['bulwark']);
  assert.equal(Math.round(healthShare(f.sides.a) * 100), 100);
  f.sides.a.team[2].hp = 0;
  assert.ok(healthShare(f.sides.a) < 1, 'a fallen bench fighter counts against you');
});

test('healing never spills over the top', () => {
  const f = fight(['mender'], ['bulwark']);
  const me = f.sides.a.team[0];
  heal(f, me, 10000);
  assert.equal(me.hp, me.maxHp);
});

test('nothing that has already gone down can be hurt or healed again', () => {
  const f = fight(['edge'], ['bulwark']);
  const me = f.sides.a.team[0];
  me.hp = 0;
  assert.equal(hurt(f, me, 20), 0);
  assert.equal(heal(f, me, 20), 0);
});

/* ----------------------------------------------------------- the pressure */

test('hits get harder the longer it drags, and not before', () => {
  assert.equal(pressureAt(0), 1);
  assert.equal(pressureAt(PRESSURE_FROM), 1);
  assert.ok(pressureAt(PRESSURE_FROM + 10) > 1.3, 'it should be biting by then');
});

test('a fight always reaches a verdict, and almost never on the clock', () => {
  let timeouts = 0;
  const ids = FIGHTERS.map((f) => f.id);
  for (let seed = 1; seed <= 60; seed += 1) {
    const rng = seededRandom(seed * 7919 + 104729);
    const pick = () => [0, 1, 2].map(() => ids[Math.floor(rng() * ids.length)]);
    const f = createFight({ a: pick(), b: pick(), random: rng });
    const over = runFight(f);
    assert.ok(over, 'it never finished');
    assert.ok(f.time <= FIGHT_LIMIT + 1, `it ran past the limit: ${f.time}`);
    if (over.reason.startsWith('time')) timeouts += 1;
  }
  assert.ok(timeouts < 12, `${timeouts} of 60 were settled by the bell, which is too many`);
});

test('a finished fight does not keep going', () => {
  const f = fight(['edge'], ['flicker']);
  runFight(f);
  const at = f.time;
  stepFight(f, 1);
  assert.equal(f.time, at);
});

/* -------------------------------------------------------------- balance */

test('no fighter runs away with it, and none is a wasted pick', () => {
  const ids = FIGHTERS.map((f) => f.id);
  const wins = new Map(ids.map((id) => [id, { won: 0, played: 0 }]));
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      for (let seed = 0; seed < 8; seed += 1) {
        // Both ways round, so no seat can decide it.
        const flip = seed % 2 === 1;
        const f = createFight({
          a: [flip ? ids[j] : ids[i]],
          b: [flip ? ids[i] : ids[j]],
          random: seededRandom(seed * 7919 + i * 131 + j * 17 + 1),
        });
        const over = runFight(f);
        const winner = over.winner === 'draw' ? null : (over.winner === 'a') === !flip ? ids[i] : ids[j];
        for (const id of [ids[i], ids[j]]) wins.get(id).played += 1;
        if (winner) wins.get(winner).won += 1;
      }
    }
  }
  for (const [id, s] of wins) {
    const rate = s.won / s.played;
    assert.ok(rate > 0.2, `${id} wins almost nothing (${(rate * 100).toFixed(0)}%)`);
    assert.ok(rate < 0.8, `${id} wins almost everything (${(rate * 100).toFixed(0)}%)`);
  }
});

/* --------------------------------------------------------------- drawing */

test('every fighter draws without producing NaN coordinates', () => {
  const ctx = createFakeContext();
  for (const spec of FIGHTERS) {
    const f = fight([spec.id], [spec.id]);
    const who = f.sides.a.team[0];
    drawFighter(ctx, who, 300, 300, 52, { flash: 0.5, facing: -1, bob: -4 });
    drawFrontPanel(ctx, who, 30, 400, 'left');
    who.hp = 0;
    drawFighter(ctx, who, 300, 300, 52, {});
  }
  assert.ok(ctx.calls > FIGHTERS.length * 10);
});

/** The screen keeps drawing through the verdict, when a side has nobody left. */
test('a side with nobody left still draws', () => {
  const ctx = createFakeContext();
  const f = fight(['edge'], ['flicker']);
  for (const who of f.sides.a.team) who.hp = 0;
  f.sides.a.front = 9;
  assert.doesNotThrow(() => {
    drawFrontPanel(ctx, frontOf(f, 'a'), 30, 400, 'left');
    drawBench(ctx, f.sides.a, 30, 112, 'left');
  });
});

test('the whole scene draws, pressure and all', () => {
  const ctx = createFakeContext();
  const f = fight(['edge', 'mender', 'bulwark'], ['flicker', 'rot', 'mirror']);
  for (let i = 0; i < 120; i += 1) stepFight(f, 1 / 30);
  for (const pressure of [1, 1.8]) drawStage(ctx, 960, 540, 3.1, pressure);
  drawBench(ctx, f.sides.a, 30, 112, 'left');
  drawBench(ctx, f.sides.b, 930, 112, 'right');
  drawLog(ctx, f.log, 296, 470, 368, 52);
  drawPopup(ctx, { x: 300, y: 300, text: '-12', size: 18, life: 0.4, maxLife: 0.8, colour: '#fff' });
  drawBanner(ctx, 960, 540, 'Your three win', 'nobody left to send');
  drawBanner(ctx, 960, 540, 'Faceoff');
  assert.ok(ctx.calls > 60);
});
