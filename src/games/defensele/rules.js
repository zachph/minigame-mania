import {
  ENEMIES,
  GRID,
  PATH_CELLS,
  SELL_RETURN,
  START_GOLD,
  START_LIVES,
  WAVES,
  WAVE_GAP,
  getTower,
  waveBonus,
} from './content.js';

/**
 * The Defensele simulation. Pure logic, driven by `update(state, dt)` - no
 * canvas, no DOM, and every roll comes from the injected random source, so a
 * run can be replayed exactly.
 *
 * Waves keep coming whether or not you are ready: there is no build phase, so
 * the pressure is always on and gold spent now is gold not spent on the wave
 * already walking towards you.
 */

let uid = 0;
const nextUid = () => (uid += 1);

/* ------------------------------------------------------------------- path */

/** Turns the cell waypoints into pixel points and measures the road. */
function buildPath() {
  const points = PATH_CELLS.map(([col, row]) => ({
    x: col * GRID.cell + GRID.cell / 2,
    y: GRID.top + row * GRID.cell + GRID.cell / 2,
  }));
  const segments = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    segments.push({ from, to, length, start: total });
    total += length;
  }
  return { points, segments, length: total };
}

export const PATH = buildPath();

/** Where a thing that has walked `distance` along the road stands. */
export function pointAt(distance) {
  const clamped = Math.max(0, Math.min(PATH.length, distance));
  for (const segment of PATH.segments) {
    if (clamped <= segment.start + segment.length) {
      const t = segment.length === 0 ? 0 : (clamped - segment.start) / segment.length;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * t,
        y: segment.from.y + (segment.to.y - segment.from.y) * t,
      };
    }
  }
  const last = PATH.segments[PATH.segments.length - 1];
  return { x: last.to.x, y: last.to.y };
}

/** How far along the road the centre of a cell sits, or null if it is not on it. */
export function roadDistanceOf(col, row) {
  const x = col * GRID.cell + GRID.cell / 2;
  const y = GRID.top + row * GRID.cell + GRID.cell / 2;
  let best = null;
  let bestGap = GRID.cell * 0.6;
  for (const segment of PATH.segments) {
    const dx = segment.to.x - segment.from.x;
    const dy = segment.to.y - segment.from.y;
    const lengthSquared = dx * dx + dy * dy || 1;
    let t = ((x - segment.from.x) * dx + (y - segment.from.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    const px = segment.from.x + dx * t;
    const py = segment.from.y + dy * t;
    const gap = Math.hypot(x - px, y - py);
    if (gap < bestGap) {
      bestGap = gap;
      best = segment.start + segment.length * t;
    }
  }
  return best;
}

export const isRoad = (col, row) => roadDistanceOf(col, row) != null;

export const inBounds = (col, row) => col >= 0 && col < GRID.cols && row >= 0 && row < GRID.rows;

/* ------------------------------------------------------------------ state */

export function createRun({ random = Math.random } = {}) {
  return {
    random,
    time: 0,
    gold: START_GOLD,
    lives: START_LIVES,
    towers: [],
    enemies: [],
    shells: [],
    beams: [],
    hits: [],
    waveIndex: 0,        // waves already released
    waveTimer: 3,        // until the first one walks in
    queue: [],           // enemies still to spawn from released waves
    stats: { kills: 0, leaked: 0, spent: 0, earned: 0 },
    over: false,
    won: false,
    reason: null,
  };
}

const enemyDps = (spec) => Math.max(8, Math.round(spec.hp / 25));

export function towerAt(state, col, row) {
  return state.towers.find((tower) => tower.col === col && tower.row === row) || null;
}

/** Whether `spec` may be built on this cell right now. */
export function canBuild(state, spec, col, row) {
  if (!inBounds(col, row)) return false;
  if (towerAt(state, col, row)) return false;
  if (state.gold < spec.cost) return false;
  return spec.onRoad ? isRoad(col, row) : !isRoad(col, row);
}

export function build(state, towerId, col, row) {
  const spec = getTower(towerId);
  if (!canBuild(state, spec, col, row)) throw new Error(`${spec.name} cannot go there`);
  state.gold -= spec.cost;
  state.stats.spent += spec.cost;
  const tower = {
    uid: nextUid(),
    spec,
    col,
    row,
    x: col * GRID.cell + GRID.cell / 2,
    y: GRID.top + row * GRID.cell + GRID.cell / 2,
    cooldown: 0,
    kills: 0,
    hp: spec.hp || 0,
    maxHp: spec.hp || 0,
    gate: spec.onRoad ? roadDistanceOf(col, row) : null,
    angle: 0,
  };
  state.towers.push(tower);
  return tower;
}

export function sell(state, tower) {
  state.towers = state.towers.filter((entry) => entry.uid !== tower.uid);
  const refund = Math.round(tower.spec.cost * SELL_RETURN);
  state.gold += refund;
  return refund;
}

/* ------------------------------------------------------------------ waves */

export function releaseWave(state) {
  const wave = WAVES[state.waveIndex];
  if (!wave) return state;
  for (const group of wave) {
    for (let i = 0; i < group.count; i += 1) {
      state.queue.push({ enemy: group.enemy, at: state.time + (group.delay || 0) + i * group.gap });
    }
  }
  state.waveIndex += 1;
  const bonus = waveBonus(state.waveIndex);
  state.gold += bonus;
  state.stats.earned += bonus;
  state.waveTimer = WAVE_GAP;
  return state;
}

function spawn(state, enemyId) {
  const spec = ENEMIES[enemyId];
  state.enemies.push({
    uid: nextUid(),
    spec,
    hp: spec.hp,
    maxHp: spec.hp,
    dist: 0,
    slowUntil: 0,
    slowFactor: 1,
    snareUntil: 0,
    freezeUntil: 0,
    freezeTickAt: 0,
    freeze: null,
    dread: [],
    blocking: null,
    x: PATH.points[0].x,
    y: PATH.points[0].y,
  });
}

/* ------------------------------------------------------------------ damage */

export function applyDamage(state, enemy, amount, { ignoreArmour = false } = {}) {
  const armour = ignoreArmour ? 0 : enemy.spec.armour || 0;
  const dealt = Math.max(1, amount - armour);
  enemy.hp -= dealt;
  return dealt;
}

function killEnemy(state, enemy, source) {
  state.gold += enemy.spec.bounty;
  state.stats.earned += enemy.spec.bounty;
  state.stats.kills += 1;
  if (source) source.kills += 1;
  state.hits.push({ x: enemy.x, y: enemy.y, life: 0.5, maxLife: 0.5, size: enemy.spec.size, color: enemy.spec.color });
}

/** Slows and snares are resisted by whatever has `slowResist`. */
function applySlow(enemy, factor, duration, now) {
  const resist = enemy.spec.slowResist || 0;
  const effective = 1 - (1 - factor) * (1 - resist);
  enemy.slowFactor = Math.min(enemy.slowUntil > now ? enemy.slowFactor : 1, effective);
  enemy.slowUntil = Math.max(enemy.slowUntil, now + duration);
}

function applySnare(enemy, duration, now) {
  const resist = enemy.spec.slowResist || 0;
  enemy.snareUntil = Math.max(enemy.snareUntil, now + duration * (1 - resist));
}

/**
 * A freeze holds them still like a snare, but the cold keeps biting: a fixed
 * bite every `interval` seconds for as long as the ice lasts. Refreezing
 * extends the ice without resetting the clock on the next bite.
 */
function applyFreeze(enemy, spec, now) {
  const resist = enemy.spec.slowResist || 0;
  const until = now + spec.duration * (1 - resist);
  if (enemy.freezeUntil <= now) enemy.freezeTickAt = now + spec.interval;
  enemy.freezeUntil = Math.max(enemy.freezeUntil, until);
  enemy.freeze = spec;
}

/* ------------------------------------------------------------------- loop */

export function update(state, dt) {
  if (state.over) return state;
  state.time += dt;

  // Waves keep arriving whether or not you are ready for them.
  state.waveTimer -= dt;
  if (state.waveTimer <= 0 && state.waveIndex < WAVES.length) releaseWave(state);

  while (state.queue.length > 0 && state.queue[0].at <= state.time) {
    spawn(state, state.queue.shift().enemy);
  }

  moveEnemies(state, dt);
  fireTowers(state, dt);
  moveShells(state, dt);
  tickEffects(state, dt);
  reap(state);
  checkEnd(state);
  return state;
}

function moveEnemies(state, dt) {
  const gates = state.towers.filter((tower) => tower.spec.onRoad && tower.hp > 0);

  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.blocking = null;

    // A Bastion standing in the road stops the queue until it is rubble.
    const ahead = gates
      .filter((gate) => gate.gate != null && gate.gate > enemy.dist)
      .sort((a, b) => a.gate - b.gate)[0];

    const snared = enemy.snareUntil > state.time || enemy.freezeUntil > state.time;
    const slowed = enemy.slowUntil > state.time ? enemy.slowFactor : 1;
    const step = snared ? 0 : enemy.spec.speed * slowed * dt;

    if (ahead) {
      const stopAt = ahead.gate - (enemy.spec.size + 6);
      if (enemy.dist + step >= stopAt) {
        enemy.dist = Math.min(enemy.dist, stopAt);
        enemy.blocking = ahead;
        ahead.hp -= enemyDps(enemy.spec) * dt;
      } else enemy.dist += step;
    } else {
      enemy.dist += step;
    }

    const point = pointAt(enemy.dist);
    enemy.x = point.x;
    enemy.y = point.y;

    if (enemy.dist >= PATH.length) {
      state.lives -= enemy.spec.leak;
      state.stats.leaked += 1;
      enemy.hp = 0;
      enemy.leaked = true;
    }
  }
}

/** Targets whatever is furthest along the road - the classic, and the clearest. */
function pickTarget(state, tower) {
  let best = null;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || enemy.leaked) continue;
    if (Math.hypot(enemy.x - tower.x, enemy.y - tower.y) > tower.spec.range) continue;
    if (!best || enemy.dist > best.dist) best = enemy;
  }
  return best;
}

function fireTowers(state, dt) {
  for (const tower of state.towers) {
    const spec = tower.spec;
    if (!spec.rate) continue;
    tower.cooldown -= dt;
    if (tower.cooldown > 0) continue;

    const target = pickTarget(state, tower);
    if (!target) continue;
    tower.cooldown = 1 / spec.rate;
    tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x);

    if (spec.shell) {
      state.shells.push({
        x: tower.x, y: tower.y, fromX: tower.x, fromY: tower.y,
        toX: target.x, toY: target.y, t: 0,
        duration: Math.max(0.25, Math.hypot(target.x - tower.x, target.y - tower.y) / 420),
        damage: spec.damage, splash: spec.splash, source: tower,
      });
      continue;
    }

    hit(state, tower, target);
    if (spec.chain) {
      let previous = target;
      const struck = new Set([target.uid]);
      for (let i = 1; i < spec.chain; i += 1) {
        const next = state.enemies
          .filter((enemy) => enemy.hp > 0 && !struck.has(enemy.uid) &&
            Math.hypot(enemy.x - previous.x, enemy.y - previous.y) < 84)
          .sort((a, b) => b.dist - a.dist)[0];
        if (!next) break;
        struck.add(next.uid);
        state.beams.push({ x1: previous.x, y1: previous.y, x2: next.x, y2: next.y, life: 0.14, maxLife: 0.14, color: spec.color });
        applyDamage(state, next, spec.damage);
        previous = next;
      }
    }
  }
}

function hit(state, tower, enemy) {
  const spec = tower.spec;
  state.beams.push({ x1: tower.x, y1: tower.y, x2: enemy.x, y2: enemy.y, life: 0.12, maxLife: 0.12, color: spec.color });
  if (spec.damage > 0) applyDamage(state, enemy, spec.damage);
  if (spec.slow) applySlow(enemy, spec.slow.factor, spec.slow.duration, state.time);
  if (spec.snare) applySnare(enemy, spec.snare.duration, state.time);
  if (spec.freeze) applyFreeze(enemy, spec.freeze, state.time);
  if (spec.dread) {
    if (enemy.dread.length < spec.dread.stacks) {
      enemy.dread.push({ until: state.time + spec.dread.duration, dps: spec.dread.damage });
    } else {
      enemy.dread[0] = { until: state.time + spec.dread.duration, dps: spec.dread.damage };
      enemy.dread.sort((a, b) => a.until - b.until);
    }
  }
}

function moveShells(state, dt) {
  for (const shell of state.shells) {
    shell.t += dt / shell.duration;
    shell.x = shell.fromX + (shell.toX - shell.fromX) * shell.t;
    shell.y = shell.fromY + (shell.toY - shell.fromY) * shell.t;
    if (shell.t < 1) continue;
    shell.spent = true;
    state.hits.push({ x: shell.toX, y: shell.toY, life: 0.35, maxLife: 0.35, size: shell.splash, color: '#ffb066' });
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      if (Math.hypot(enemy.x - shell.toX, enemy.y - shell.toY) > shell.splash) continue;
      applyDamage(state, enemy, shell.damage);
    }
  }
  state.shells = state.shells.filter((shell) => !shell.spent);
}

function tickEffects(state, dt) {
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    while (enemy.freeze && enemy.freezeUntil > state.time && enemy.freezeTickAt <= state.time) {
      applyDamage(state, enemy, enemy.freeze.damage, { ignoreArmour: true });
      enemy.freezeTickAt += enemy.freeze.interval;
    }
    enemy.dread = enemy.dread.filter((stack) => stack.until > state.time);
    for (const stack of enemy.dread) applyDamage(state, enemy, stack.dps * dt, { ignoreArmour: true });
  }
  for (const beam of state.beams) beam.life -= dt;
  state.beams = state.beams.filter((beam) => beam.life > 0);
  for (const mark of state.hits) mark.life -= dt;
  state.hits = state.hits.filter((mark) => mark.life > 0);
}

function reap(state) {
  for (const enemy of state.enemies) {
    if (enemy.hp > 0 || enemy.reaped) continue;
    enemy.reaped = true;
    if (!enemy.leaked) killEnemy(state, enemy, enemy.lastSource);
  }
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
  state.towers = state.towers.filter((tower) => !tower.spec.onRoad || tower.hp > 0);
}

function checkEnd(state) {
  if (state.lives <= 0) {
    state.over = true;
    state.won = false;
    state.reason = 'the base is overrun';
    return;
  }
  const done = state.waveIndex >= WAVES.length && state.queue.length === 0 && state.enemies.length === 0;
  if (done) {
    state.over = true;
    state.won = true;
    state.reason = 'every wave turned back';
  }
}

export { GRID, WAVES, START_GOLD, START_LIVES };
