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

test('eight defenders, six enemies, fifteen waves', () => {
  assert.equal(TOWERS.length, 8);
  assert.equal(new Set(TOWERS.map((tower) => tower.id)).size, 8);
  assert.equal(ENEMY_LIST.length, 6);
  assert.equal(WAVE_COUNT, 15);
  assert.equal(WAVES.length, 15);
  for (const tower of TOWERS) {
    assert.ok(tower.cost > 0, `${tower.name} costs something`);
    assert.ok(tower.blurb.length > 10, `${tower.name} says what it does`);
    if (!tower.onRoad) assert.ok(tower.range > 0 && tower.rate > 0, `${tower.name} shoots`);
  }
});

test('Claw-bind and Nightkon are in, and do what their names promise', () => {
  const claw = getTower('claw-bind');
  const night = getTower('nightkon');
  assert.ok(claw.snare.duration > 0, 'Claw-bind pins things in place');
  assert.ok(night.dread.damage > 0 && night.dread.stacks > 1, 'Nightkon stacks a burn');
});

test('every wave names a real enemy and gets harder', () => {
  for (const [index, wave] of WAVES.entries()) {
    assert.ok(wave.length > 0, `wave ${index + 1} sends something`);
    for (const group of wave) {
      assert.ok(ENEMIES[group.enemy], `wave ${index + 1} sends a real enemy`);
      assert.ok(group.count > 0 && group.gap > 0);
    }
  }
  const size = (wave) => wave.reduce((total, group) => total + group.count, 0);
  assert.ok(size(WAVES.at(-1)) > size(WAVES[0]) * 3, 'the last wave dwarfs the first');
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
  assert.equal(state.gold, goldBefore + waveBonus(1));
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

test('an undefended base is overrun; a real defence turns all fifteen waves back', () => {
  const naked = createRun();
  run(naked, 400, 1 / 20);
  assert.equal(naked.over, true);
  assert.equal(naked.won, false, 'building nothing loses');

  // The same scripted build the balance pass uses: a spread of roles.
  const defended = createRun();
  const plan = ['pylon', 'pylon', 'frostpin', 'lancer', 'pylon', 'mortar', 'frostpin', 'lancer',
    'coilnest', 'nightkon', 'mortar', 'claw-bind', 'lancer', 'nightkon', 'mortar', 'lancer'];
  const taken = new Set();
  let next = 0;
  for (let elapsed = 0; elapsed < 600 && !defended.over; elapsed += 1 / 20) {
    while (next < plan.length) {
      const spec = getTower(plan[next]);
      if (defended.gold < spec.cost) break;
      const spot = bestFreeSpot(taken, spec.range);
      if (!spot) { next += 1; continue; }
      build(defended, spec.id, spot.col, spot.row);
      taken.add(`${spot.col},${spot.row}`);
      next += 1;
    }
    update(defended, 1 / 20);
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
