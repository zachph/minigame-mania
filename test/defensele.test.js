import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENEMIES,
  ENEMY_LIST,
  GRID,
  SELL_RETURN,
  START_GOLD,
  START_LIVES,
  TOWERS,
  WAVES,
  WAVE_COUNT,
  getTower,
  waveBonus,
} from '../src/games/defensele/content.js';
import {
  PATH,
  build,
  canBuild,
  costOf,
  createRun,
  isRoad,
  pointAt,
  releaseWave,
  roadDistanceOf,
  sell,
  towerAt,
  update,
} from '../src/games/defensele/rules.js';

/** Runs the simulation for `seconds` at a fixed step. */
function run(state, seconds, step = 1 / 30) {
  for (let elapsed = 0; elapsed < seconds && !state.over; elapsed += step) update(state, step);
  return state;
}

/** A run with the wave clock switched off, so one rule can be tested alone. */
function quiet() {
  const state = createRun();
  state.waveTimer = Infinity;
  return state;
}

/** Puts one enemy on the road right now. */
function sendOne(state, enemyId) {
  state.queue.push({ enemy: enemyId, at: state.time });
  update(state, 1 / 60);
  return state.enemies[state.enemies.length - 1];
}

/** An open cell within `range` of the road, for dropping a tower on. */
function spotNearRoad(range = 120) {
  for (let col = 0; col < GRID.cols; col += 1) {
    for (let row = 0; row < GRID.rows; row += 1) {
      if (isRoad(col, row)) continue;
      const x = col * GRID.cell + GRID.cell / 2;
      const y = GRID.top + row * GRID.cell + GRID.cell / 2;
      for (let d = 0; d < PATH.length; d += 10) {
        const point = pointAt(d);
        if (Math.hypot(point.x - x, point.y - y) < range * 0.5) return { col, row };
      }
    }
  }
  throw new Error('no buildable cell near the road');
}

/* --------------------------------------------------------------- content */

test('ten defenders, eight enemies, seventeen waves', () => {
  assert.equal(TOWERS.length, 10);
  assert.equal(new Set(TOWERS.map((tower) => tower.id)).size, 10);
  assert.equal(ENEMY_LIST.length, 8);
  assert.equal(WAVE_COUNT, 17);
  assert.equal(WAVES.length, 17);
  for (const tower of TOWERS) {
    assert.ok(tower.cost > 0, `${tower.name} costs something`);
    assert.ok(tower.blurb.length > 10, `${tower.name} says what it does`);
    // Everything either shoots, blocks the road, or earns.
    if (!tower.onRoad && !tower.income) assert.ok(tower.range > 0 && tower.rate > 0, `${tower.name} shoots`);
  }
});

test('Claw-bind, Nightkon and Frostglide do what their names promise', () => {
  const claw = getTower('claw-bind');
  const night = getTower('nightkon');
  const glide = getTower('frostglide');
  assert.ok(claw.snare.duration > 0, 'Claw-bind pins things in place');
  assert.ok(night.dread.damage > 0 && night.dread.stacks > 1, 'Nightkon stacks a burn');
  assert.equal(glide.cost, 330);
  assert.equal(glide.damage, 23);
  assert.equal(glide.range, 100);
  assert.deepEqual(glide.freeze, { duration: 1.5, damage: 12.5, interval: 0.5 });
});

test('every wave names a real enemy and gets harder', () => {
  for (const [index, wave] of WAVES.entries()) {
    assert.ok(wave.length > 0, `wave ${index + 1} sends something`);
    for (const group of wave) {
      assert.ok(ENEMIES[group.enemy], `wave ${index + 1} sends a real enemy`);
      assert.ok(group.count > 0 && group.gap > 0);
    }
  }
  // The last waves are few but enormous, so weigh them by health, not headcount.
  const weight = (wave) => wave.reduce((total, group) => total + group.count * ENEMIES[group.enemy].hp, 0);
  assert.ok(weight(WAVES.at(-1)) > weight(WAVES[0]) * 3, 'the last wave dwarfs the first');
  assert.ok(weight(WAVES[9]) > weight(WAVES[2]), 'and the middle outweighs the opening');
  assert.ok(waveBonus(10) > waveBonus(1), 'and pays better');
});

/* ------------------------------------------------------------------ road */

test('the road runs from the left edge to the base', () => {
  assert.ok(PATH.length > 1000, `the road is ${Math.round(PATH.length)}px long`);
  const start = pointAt(0);
  const end = pointAt(PATH.length);
  assert.ok(start.x < 40, 'it starts at the left edge');
  assert.ok(end.x > 900, 'and finishes at the far side');
  assert.deepEqual(pointAt(-50), start, 'before the start is the start');
  assert.deepEqual(pointAt(PATH.length + 500), end, 'past the end is the end');
});

test('cells know whether they are road', () => {
  const onRoad = { col: 2, row: 5 };
  assert.equal(isRoad(onRoad.col, onRoad.row), true);
  assert.ok(roadDistanceOf(onRoad.col, onRoad.row) > 0);
  const open = spotNearRoad();
  assert.equal(isRoad(open.col, open.row), false);
  assert.equal(roadDistanceOf(open.col, open.row), null);
});

/* -------------------------------------------------------------- building */

test('defenders go on open ground, and the Bastion goes in the road', () => {
  const state = quiet();
  const open = spotNearRoad();
  const pylon = getTower('pylon');
  const bastion = getTower('bastion');

  assert.equal(canBuild(state, pylon, open.col, open.row), true);
  assert.equal(canBuild(state, pylon, 2, 5), false, 'not in the road');
  assert.equal(canBuild(state, bastion, 2, 5), true, 'the Bastion is the exception');
  assert.equal(canBuild(state, bastion, open.col, open.row), false, 'and only goes in the road');
  assert.equal(canBuild(state, pylon, -1, 0), false, 'nor off the map');
});

test('building spends the gold and takes the cell', () => {
  const state = quiet();
  const open = spotNearRoad();
  const pylon = getTower('pylon');
  build(state, 'pylon', open.col, open.row);

  assert.equal(state.gold, START_GOLD - pylon.cost);
  assert.equal(state.towers.length, 1);
  assert.equal(towerAt(state, open.col, open.row).spec.id, 'pylon');
  assert.equal(canBuild(state, pylon, open.col, open.row), false, 'the cell is taken');
  assert.throws(() => build(state, 'pylon', open.col, open.row), /cannot go there/);
});

test('you cannot build what you cannot afford', () => {
  const state = quiet();
  state.gold = 10;
  const open = spotNearRoad();
  assert.equal(canBuild(state, getTower('nightkon'), open.col, open.row), false);
});

test('selling gives most of it back', () => {
  const state = quiet();
  state.gold = 400; // this is about the refund, not what you open with
  const open = spotNearRoad();
  const tower = build(state, 'lancer', open.col, open.row);
  const before = state.gold;
  const refund = sell(state, tower);
  assert.equal(refund, Math.round(getTower('lancer').cost * SELL_RETURN));
  assert.equal(state.gold, before + refund);
  assert.equal(state.towers.length, 0);
});

/* --------------------------------------------------------------- fighting */

test('a defender shoots what walks past, and a kill pays a bounty', () => {
  const state = quiet();
  state.gold = 900;
  // A Lancer, because a lone Pylon only just out-damages a Creeper walking by.
  const spot = spotNearRoad(getTower('lancer').range);
  build(state, 'lancer', spot.col, spot.row);
  const goldAfterBuilding = state.gold;

  sendOne(state, 'creeper');
  run(state, 20);
  assert.equal(state.enemies.length, 0, 'the Creeper did not survive the walk');
  assert.equal(state.stats.kills, 1);
  assert.equal(state.gold, goldAfterBuilding + ENEMIES.creeper.bounty);
  assert.equal(state.stats.leaked, 0);
});

test('armour blunts small hits, and dread ignores it', () => {
  const plain = quiet();
  const spot = spotNearRoad();
  build(plain, 'pylon', spot.col, spot.row);
  const creeper = sendOne(plain, 'creeper');
  run(plain, 2);
  const versusCreeper = creeper.maxHp - creeper.hp;

  const armoured = quiet();
  build(armoured, 'pylon', spot.col, spot.row);
  const shielded = sendOne(armoured, 'shieldbearer');
  run(armoured, 2);
  const versusArmour = shielded.maxHp - shielded.hp;
  assert.ok(versusArmour < versusCreeper, 'the Shieldbearer took less from the same gun');

  const dread = quiet();
  dread.gold = 400;
  build(dread, 'nightkon', spot.col, spot.row);
  const marked = sendOne(dread, 'shieldbearer');
  run(dread, 3);
  assert.ok(marked.dread.length > 0, 'Nightkon left its mark');
  assert.ok(marked.maxHp - marked.hp > ENEMIES.shieldbearer.armour * 3, 'and it burned through the armour');
});

test('Frostpin slows and Claw-bind stops', () => {
  const loose = quiet();
  const runner = sendOne(loose, 'runner');
  run(loose, 2);
  const freeDistance = runner.dist;

  const slowed = quiet();
  const spot = spotNearRoad(getTower('frostpin').range);
  build(slowed, 'frostpin', spot.col, spot.row);
  const chilled = sendOne(slowed, 'runner');
  run(slowed, 2);
  assert.ok(chilled.dist < freeDistance, 'the slowed Runner covered less road');
  assert.ok(chilled.slowUntil > 0, 'and is visibly chilled');

  const pinned = quiet();
  build(pinned, 'claw-bind', spot.col, spot.row);
  const held = sendOne(pinned, 'runner');
  run(pinned, 2);
  assert.ok(held.snareUntil > pinned.time || held.hp <= 0, 'Claw-bind got hold of it');
});

test('Frostglide freezes, and the cold bites every half second', () => {
  const iced = quiet();
  iced.gold = 400;
  const spot = spotNearRoad(getTower('frostglide').range);
  build(iced, 'frostglide', spot.col, spot.row);
  const caught = sendOne(iced, 'brute');
  run(iced, 1.2);
  assert.ok(caught.freezeUntil > iced.time, 'the Brute is held in the ice');

  // One shot (23) plus two bites of 12.5 by 1.2s in - armour does not stop cold.
  const dealt = caught.maxHp - caught.hp;
  assert.ok(dealt >= 23 + 12.5 * 2 - 0.5, `the cold kept biting (dealt ${dealt})`);

  const free = quiet();
  const loose = sendOne(free, 'brute');
  run(free, 1.2);
  assert.ok(caught.dist < loose.dist * 0.5, 'and it barely moved while frozen');
});

test('every copy of a defender costs 20% more than the last', () => {
  const state = quiet();
  state.gold = 5000;
  const pylon = getTower('pylon');

  assert.equal(costOf(state, pylon), pylon.cost, 'the first is the price on the bar');
  const first = build(state, 'pylon', 1, 1);
  assert.equal(first.paid, pylon.cost);
  assert.equal(costOf(state, pylon), Math.round((pylon.cost * 1.2) / 5) * 5, 'the second is dearer');
  build(state, 'pylon', 1, 2);
  assert.equal(costOf(state, pylon), Math.round((pylon.cost * 1.4) / 5) * 5, 'and the third dearer again');

  // It is per defender, not across the bar.
  assert.equal(costOf(state, getTower('lancer')), getTower('lancer').cost, 'a Lancer is untouched by owning Pylons');

  // Selling one brings the next price back down, and refunds what you paid.
  const second = state.towers[1];
  const refund = sell(state, second);
  assert.equal(refund, Math.round(second.paid * SELL_RETURN), 'you get back a share of what you paid');
  assert.equal(costOf(state, pylon), Math.round((pylon.cost * 1.2) / 5) * 5, 'and the price steps back');
});

test('a Money Tree fruits 100 gold every 6.5 seconds', () => {
  const state = quiet();
  state.gold = 900;
  const tree = build(state, 'money-tree', 1, 1);
  const goldBefore = state.gold;

  run(state, 6.4);
  assert.equal(state.gold, goldBefore, 'nothing before the clock comes round');
  run(state, 0.3);
  assert.equal(state.gold, goldBefore + 100, 'and 100 when it does');
  run(state, 6.6);
  assert.equal(state.gold, goldBefore + 200, 'then another, on the same clock');
  assert.equal(tree.earned, 200);

  // It costs more than any gun on the bar, and pays itself back in four fruits.
  assert.ok(tree.spec.cost > Math.max(...TOWERS.filter((t) => t.damage > 0).map((t) => t.cost)),
    'a tree is the most expensive thing you can build');
  assert.ok(tree.spec.cost < tree.spec.income.amount * 5, 'and it still pays itself back inside half a minute');
  assert.equal(tree.kills, 0);
});

test('a Cripplestone puts a tower out for 3.5s every 4s', () => {
  const state = quiet();
  state.gold = 900;
  const spot = spotNearRoad(getTower('pylon').range);
  const gun = build(state, 'pylon', spot.col, spot.row);

  const stone = sendOne(state, 'cripplestone');
  stone.spec = { ...stone.spec, speed: 0 };               // hold it beside the tower
  stone.dist = roadDistanceOf(spot.col, spot.row) || 0;
  run(state, 0.1);
  assert.equal(gun.stunUntil > state.time, false, 'it does not reach out the instant it arrives');

  run(state, 4.2);
  assert.ok(gun.stunUntil > state.time, 'four seconds later the tower is out');
  const out = gun.stunUntil - state.time;
  assert.ok(out > 3 && out <= 3.5, `and stays out for about 3.5s (${out.toFixed(2)})`);

  // A stunned tower does not shoot.
  const before = stone.hp;
  const hpAtStun = stone.hp;
  run(state, 0.5);
  assert.equal(stone.hp, hpAtStun, 'the tower is silent while it is out');
  assert.ok(before >= stone.hp);
});

test('Cripplestone is fast, tanky and expensive to let through', () => {
  const stone = ENEMIES.cripplestone;
  assert.equal(stone.hp, 1270);
  assert.equal(stone.speed, 87);
  assert.equal(stone.leak, 8);
  assert.equal(stone.stun.duration, 3.5);
  assert.equal(stone.stun.interval, 4);
  assert.ok(stone.speed > ENEMIES.brute.speed * 2, 'it moves like a Runner, not a Brute');
  assert.ok(stone.bounty > ENEMIES.brute.bounty, 'and pays out for killing it');
});

test('Skeleflame lights the road every 5s, and it burns for 7', () => {
  const state = quiet();
  const stone = sendOne(state, 'skeleflame');
  const flame = ENEMIES.skeleflame.flameRoad;

  run(state, 4.5);
  assert.equal(state.flameUntil > state.time, false, 'it waits out its cooldown first');
  run(state, 0.8);
  assert.ok(state.flameUntil > state.time, 'then the track catches');

  // Seven seconds of fire, and the next cooldown only starts once it is out.
  const lit = state.time;
  run(state, 6.5);
  assert.ok(state.flameUntil > state.time, 'still alight at 6.5s');
  run(state, 0.8);
  assert.equal(state.flameUntil > state.time, false, 'out by 7.3s');
  assert.ok(stone.flameAt - (lit + flame.duration) > flame.cooldown - 0.5, 'the 5s starts after the fire, not with it');

  run(state, 5.2);
  assert.ok(state.flameUntil > state.time, 'and it lights again five seconds later');
  assert.ok(state.stats.burns >= 2);
});

test('Flame Road eats Bastions and shuts the ice towers off', () => {
  const state = quiet();
  state.gold = 900;
  const wall = build(state, 'bastion', 9, 5);
  const spot = spotNearRoad(getTower('frostglide').range);
  build(state, 'frostglide', spot.col, spot.row);

  const stone = sendOne(state, 'skeleflame');
  stone.spec = { ...stone.spec, speed: 0 };     // hold it in the Frostglide's reach
  stone.dist = roadDistanceOf(spot.col, spot.row) || 0;

  run(state, 4.9);
  assert.ok(stone.freezeUntil > state.time, 'before the fire, the ice holds it');
  const wallBefore = wall.hp;

  run(state, 2.0);   // a second into the burn
  assert.ok(state.flameUntil > state.time, 'the road is alight');
  assert.equal(stone.freezeUntil > state.time, false, 'nothing on a burning road can be frozen');

  // 1% of full health every 0.2s: about 5% a second.
  const lost = wallBefore - wall.hp;
  assert.ok(lost > wall.maxHp * 0.03, `the Bastion is burning down (${lost.toFixed(0)} of ${wall.maxHp})`);
  assert.ok(lost < wall.maxHp * 0.12, 'but not instantly');
});

test('Skeleflame is the heaviest thing on the road', () => {
  const flame = ENEMIES.skeleflame;
  assert.equal(flame.hp, 1865);
  assert.equal(flame.speed, 75);
  assert.equal(flame.bounty, 210);
  assert.equal(flame.leak, 18);
  assert.equal(flame.flameRoad.duration, 7);
  assert.equal(flame.flameRoad.cooldown, 5);

  // Waves 16 and 17 are nothing but Skeleflames: two, then four.
  const count = (wave, id) => wave.filter((g) => g.enemy === id).reduce((n, g) => n + g.count, 0);
  assert.equal(WAVES[15].length, 1);
  assert.equal(count(WAVES[15], 'skeleflame'), 2);
  assert.equal(WAVES[16].length, 1);
  assert.equal(count(WAVES[16], 'skeleflame'), 4);
});

test('a Bastion stops the queue until it is rubble', () => {
  const state = quiet();
  const gate = build(state, 'bastion', 9, 5);
  assert.ok(gate.gate > 0, 'it knows where in the road it stands');

  const brute = sendOne(state, 'brute');
  brute.dist = gate.gate - 60; // walk it up to the wall rather than wait 20s
  run(state, 4);
  assert.ok(brute.dist < gate.gate, 'the Brute is stuck behind it');
  assert.ok(gate.hp < gate.maxHp, 'and is taking the wall apart');

  gate.hp = 1;
  run(state, 3);
  assert.equal(state.towers.length, 0, 'the wall came down');
  const before = brute.dist;
  run(state, 2);
  assert.ok(brute.dist > before, 'and the road is open again');
});

test('anything that reaches the base costs lives', () => {
  const state = quiet();
  const brute = sendOne(state, 'brute');
  brute.dist = PATH.length - 5;
  run(state, 1);
  assert.equal(state.lives, START_LIVES - ENEMIES.brute.leak);
  assert.equal(state.stats.leaked, 1);
  assert.equal(state.stats.kills, 0, 'a leak is not a kill');
});

/* ------------------------------------------------------------- the run */

test('a wave releases on its own, queues its enemies and pays out', () => {
  const state = createRun();
  const goldBefore = state.gold;
  const queued = WAVES[0].reduce((total, group) => total + group.count, 0);
  releaseWave(state);
  assert.equal(state.waveIndex, 1);
  assert.equal(state.queue.length, queued);

  // The first wave pays nothing - the opening gold is the wave-one budget, so
  // a bonus here would just be a bigger opening handed over a few seconds late.
  assert.equal(waveBonus(1), 0);
  assert.equal(state.gold, goldBefore, 'the opening gold is untouched by wave one');

  releaseWave(state);
  assert.equal(state.gold, goldBefore + waveBonus(2), 'wave two is the first payday');
  assert.ok(waveBonus(2) > 0);
});

test('losing every life ends the run', () => {
  const state = quiet();
  state.lives = 1;
  const brute = sendOne(state, 'brute');
  brute.dist = PATH.length - 5;
  run(state, 1);
  assert.equal(state.over, true);
  assert.equal(state.won, false);
  assert.match(state.reason, /overrun/);
});

test('an undefended base is overrun; a real defence turns all seventeen waves back', () => {
  const naked = createRun();
  run(naked, 400, 1 / 20);
  assert.equal(naked.over, true);
  assert.equal(naked.won, false, 'building nothing loses');

  // The same scripted build the balance pass uses: three cheap guns down first,
  // then a rotation of roles that never runs out, so every coin gets spent. It
  // has to keep buying to the end - the last waves bring Cripplestones and then
  // Skeleflames - and every repeat of a defender costs more than the last.
  const defended = createRun();
  const opening = ['pylon', 'pylon', 'pylon', 'frostpin'];
  // Cheap guns woven through the heavy ones on purpose: with every repeat
  // costing 20% more, a rotation that leans on Lancers loses this run.
  const cycle = ['pylon', 'lancer', 'frostpin', 'mortar', 'pylon', 'claw-bind',
    'coilnest', 'lancer', 'pylon', 'mortar', 'nightkon', 'frostglide'];
  const plan = [...opening];
  for (let i = 0; i < 8; i += 1) plan.push(...cycle);

  const taken = new Set();
  let next = 0;
  for (let elapsed = 0; elapsed < 600 && !defended.over; elapsed += 1 / 60) {
    while (next < plan.length) {
      const spec = getTower(plan[next]);
      if (defended.gold < costOf(defended, spec)) break;
      const spot = bestFreeSpot(taken, spec.range);
      if (!spot || !canBuild(defended, spec, spot.col, spot.row)) { next += 1; continue; }
      build(defended, spec.id, spot.col, spot.row);
      taken.add(`${spot.col},${spot.row}`);
      next += 1;
    }
    update(defended, 1 / 60);
  }
  assert.equal(defended.over, true, 'the run finished');
  assert.equal(defended.won, true, `a spread of defenders holds: ${defended.reason}`);
  assert.ok(defended.stats.kills > 300, `and kills most of them (${defended.stats.kills})`);
});

/** The open cell covering the most road, ignoring any already used. */
function bestFreeSpot(taken, range) {
  let best = null;
  for (let col = 0; col < GRID.cols; col += 1) {
    for (let row = 0; row < GRID.rows; row += 1) {
      if (isRoad(col, row) || taken.has(`${col},${row}`)) continue;
      const x = col * GRID.cell + GRID.cell / 2;
      const y = GRID.top + row * GRID.cell + GRID.cell / 2;
      let cover = 0;
      for (let d = 0; d < PATH.length; d += 14) {
        const point = pointAt(d);
        if (Math.hypot(point.x - x, point.y - y) <= range) cover += 14;
      }
      if (cover > 0 && (!best || cover > best.cover)) best = { col, row, cover };
    }
  }
  return best;
}
