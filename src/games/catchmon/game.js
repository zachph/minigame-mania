import {
  TAU,
  clamp,
  distance,
  lerp,
  randomInt,
  randomRange,
  weightedPick,
} from '../../core/utils.js';
import { addToCollection, getCollection } from '../../core/storage.js';
import { SPECIES } from './species.js';
import {
  BALL_REWARD,
  CATCH_RADIUS,
  CHARGE_TIME,
  FIELD,
  FOCUS_BONUS,
  MAX_BALLS,
  MAX_MONS,
  ROUND_TIME,
  SPAWN_INTERVAL,
  START_BALLS,
  STARTLE_RADIUS,
  THROW_ORIGIN,
  WOBBLE_COUNT,
  WOBBLE_TIME,
  depthScale,
} from './constants.js';
import {
  drawBackground,
  drawBall,
  drawFloatingTexts,
  drawHud,
  drawMon,
  drawParticles,
  drawReticle,
  drawRoundIntro,
  drawTrainer,
} from './render.js';

export const GAME_ID = 'catchmon';

/* ----------------------------------------------------------- pure helpers */

/** Spawn weight at `progress` (0 at the start of a round, 1 at the end). */
export function spawnWeight(species, progress) {
  return lerp(species.weight, species.lateWeight, clamp(progress, 0, 1));
}

/**
 * Odds of a throw sticking. A dead-centre hit on a calm mon with a fully
 * charged throw is the best case; grazing a fleeing mon is the worst.
 */
export function catchChance({ baseRate, accuracy, focus, fleeing }) {
  const aimBonus = 0.72 + 0.5 * clamp(accuracy, 0, 1);
  const focusBonus = 1 + FOCUS_BONUS * clamp(focus, 0, 1);
  const fleePenalty = fleeing ? 0.72 : 1;
  return clamp(baseRate * aimBonus * focusBonus * fleePenalty, 0.05, 0.95);
}

/** Score multiplier for a streak of `streak` consecutive catches. */
export function streakMultiplier(streak) {
  return 1 + 0.25 * clamp(streak - 1, 0, 8);
}

/* ------------------------------------------------------------------- game */

class CatchmonGame {
  constructor(context) {
    this.context = context;
    this.time = 0;
    this.timeLeft = ROUND_TIME;
    this.introTimer = 1.4;
    this.score = 0;
    this.balls = START_BALLS;
    this.streak = 0;
    this.bestStreak = 0;
    this.throws = 0;
    this.finished = false;

    this.mons = [];
    this.balls3d = [];
    this.particles = [];
    this.texts = [];
    this.caught = {};
    this.spawnTimer = 0.35;
    this.charge = 0;
    this.charging = false;
    this.aim = { x: THROW_ORIGIN.x, y: (FIELD.top + FIELD.bottom) / 2 };
    this.decor = buildDecor();
  }

  /* ------------------------------------------------------------- updating */

  update(dt, input) {
    this.time += dt;
    if (this.introTimer > 0) {
      this.introTimer -= dt;
      return;
    }
    if (!this.finished) {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
    }

    this._updateAim(dt, input);
    this._updateSpawning(dt);
    this._updateMons(dt);
    this._updateBalls(dt);
    this._updateEffects(dt);
    this._checkRoundEnd();
  }

  _updateAim(dt, input) {
    if (input.usingPointer) {
      this.aim.x = input.x;
      this.aim.y = input.y;
    }
    const keyboardSpeed = 460 * dt;
    let dx = 0;
    let dy = 0;
    if (input.isKeyDown('ArrowLeft', 'KeyA')) dx -= 1;
    if (input.isKeyDown('ArrowRight', 'KeyD')) dx += 1;
    if (input.isKeyDown('ArrowUp', 'KeyW')) dy -= 1;
    if (input.isKeyDown('ArrowDown', 'KeyS')) dy += 1;
    if (dx || dy) {
      const norm = Math.hypot(dx, dy) || 1;
      this.aim.x += (dx / norm) * keyboardSpeed;
      this.aim.y += (dy / norm) * keyboardSpeed;
      input.usingPointer = false;
    }
    this.aim.x = clamp(this.aim.x, FIELD.left, FIELD.right);
    this.aim.y = clamp(this.aim.y, FIELD.top, FIELD.bottom);

    // A press starts charging; the throw goes out the moment it is let go, so a
    // quick tap still throws (charge 0) and a held press builds focus.
    if ((input.justPressed || input.wasKeyPressed('Space')) && !this.finished && this.balls > 0) {
      this.charging = true;
      this.charge = 0;
    }
    if (!this.charging) return;

    if (input.down || input.isKeyDown('Space')) {
      this.charge = Math.min(1, this.charge + dt / CHARGE_TIME);
    } else {
      this._throwBall(this.charge);
      this.charging = false;
      this.charge = 0;
    }
  }

  _throwBall(focus) {
    if (this.finished || this.balls <= 0) return;
    this.balls -= 1;
    this.throws += 1;
    const target = { x: this.aim.x, y: this.aim.y };
    const travel = distance(THROW_ORIGIN.x, THROW_ORIGIN.y, target.x, target.y);
    this.balls3d.push({
      state: 'flight',
      from: { x: THROW_ORIGIN.x, y: THROW_ORIGIN.y - 40 },
      to: target,
      x: THROW_ORIGIN.x,
      y: THROW_ORIGIN.y - 40,
      height: 0,
      spin: 0,
      t: 0,
      duration: 0.3 + travel / 1500,
      focus,
      stateTime: 0,
      wobblePhase: 0,
      wobblesLeft: WOBBLE_COUNT,
      mon: null,
      willCatch: false,
    });
  }

  _updateSpawning(dt) {
    if (this.finished) return;
    const progress = 1 - this.timeLeft / ROUND_TIME;
    this.spawnTimer -= dt;
    const active = this.mons.filter((mon) => mon.state !== 'gone').length;
    if (this.spawnTimer > 0 || active >= MAX_MONS) return;
    this.spawnTimer = lerp(SPAWN_INTERVAL.start, SPAWN_INTERVAL.end, progress) * randomRange(0.75, 1.25);
    this.mons.push(createMon(progress));
  }

  _updateMons(dt) {
    for (const mon of this.mons) {
      mon.walkPhase += dt * (mon.state === 'flee' ? 13 : 7);
      mon.tilt = Math.sin(mon.walkPhase * 0.5) * 0.06;
      mon.stateTime += dt;

      if (mon.state === 'captured') {
        mon.alpha = 0;
        continue;
      }

      if (mon.state === 'flee' && mon.stateTime > mon.fleeDuration) {
        mon.state = 'wander';
        mon.stateTime = 0;
        mon.retarget = 0;
      }

      mon.patience -= dt;
      if (mon.state !== 'leaving' && mon.patience <= 0) {
        mon.state = 'leaving';
        mon.stateTime = 0;
        const exitLeft = mon.x < 480;
        mon.target = { x: exitLeft ? FIELD.left - 120 : FIELD.right + 120, y: mon.y - randomRange(0, 40) };
      }

      if (mon.state === 'leaving') {
        mon.alpha = Math.max(0, mon.alpha - dt * 0.7);
        if (mon.alpha <= 0) mon.state = 'gone';
      } else {
        mon.alpha = Math.min(1, mon.alpha + dt * 2.5);
      }

      if (mon.state === 'wander') {
        mon.retarget -= dt;
        if (mon.retarget <= 0) {
          mon.retarget = randomRange(0.9, 2.2);
          mon.target = {
            x: clamp(mon.x + randomRange(-180, 180), FIELD.left, FIELD.right),
            y: clamp(mon.y + randomRange(-90, 90), FIELD.top, FIELD.bottom),
          };
          mon.pauseTimer = Math.random() < 0.3 ? randomRange(0.3, 0.9) : 0;
        }
      }

      const speedFactor =
        mon.state === 'flee' ? 2.1 : mon.state === 'leaving' ? 1.8 : mon.pauseTimer > 0 ? 0 : 1;
      if (mon.pauseTimer > 0) mon.pauseTimer -= dt;

      const dx = mon.target.x - mon.x;
      const dy = mon.target.y - mon.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1 && speedFactor > 0) {
        const step = mon.species.speed * speedFactor * dt;
        mon.x += (dx / dist) * Math.min(step, dist);
        mon.y += (dy / dist) * Math.min(step, dist);
        mon.lookX = Math.sign(dx);
      }
      if (mon.state !== 'leaving') {
        mon.x = clamp(mon.x, FIELD.left, FIELD.right);
        mon.y = clamp(mon.y, FIELD.top, FIELD.bottom);
      }
    }

    this.mons = this.mons.filter((mon) => mon.state !== 'gone');
    this.mons.sort((a, b) => a.y - b.y);
  }

  _updateBalls(dt) {
    for (const ball of this.balls3d) {
      ball.stateTime += dt;
      if (ball.state === 'flight') {
        ball.t = Math.min(1, ball.t + dt / ball.duration);
        ball.x = lerp(ball.from.x, ball.to.x, ball.t);
        ball.y = lerp(ball.from.y, ball.to.y, ball.t);
        ball.height = Math.sin(ball.t * Math.PI) * 90;
        ball.spin += dt * 16;
        if (ball.t >= 1) this._resolveLanding(ball);
      } else if (ball.state === 'wobble') {
        ball.wobblePhase += dt / WOBBLE_TIME;
        if (ball.wobblePhase >= 1) {
          ball.wobblePhase = 0;
          ball.wobblesLeft -= 1;
          if (!ball.willCatch && ball.wobblesLeft <= 0) this._escape(ball);
          else if (ball.wobblesLeft <= 0) this._confirmCatch(ball);
          else this._spawnParticles(ball.x, ball.y - 10, 4, '#ffffff', 'puff');
        }
      } else if (ball.state === 'caught' && ball.stateTime > 0.6) {
        ball.state = 'done';
      } else if (ball.state === 'miss' && ball.stateTime > 0.35) {
        ball.state = 'done';
      }
    }
    this.balls3d = this.balls3d.filter((ball) => ball.state !== 'done');
  }

  _resolveLanding(ball) {
    ball.height = 0;
    const target = this._findTarget(ball.to.x, ball.to.y);

    for (const mon of this.mons) {
      if (mon === target || mon.state === 'captured' || mon.state === 'leaving') continue;
      if (distance(mon.x, mon.y, ball.to.x, ball.to.y) < STARTLE_RADIUS) startle(mon, ball.to);
    }

    if (!target) {
      ball.state = 'miss';
      ball.stateTime = 0;
      this._spawnParticles(ball.x, ball.y, 8, '#d9e6c8', 'puff');
      this._breakStreak();
      return;
    }

    const scale = depthScale(target.y) * target.scale;
    const hitRadius = CATCH_RADIUS * scale;
    const accuracy = 1 - clamp(distance(target.x, target.y, ball.to.x, ball.to.y) / hitRadius, 0, 1);
    const chance = catchChance({
      baseRate: target.species.catchRate,
      accuracy,
      focus: ball.focus,
      fleeing: target.state === 'flee',
    });

    target.state = 'captured';
    target.stateTime = 0;
    ball.mon = target;
    ball.state = 'wobble';
    ball.stateTime = 0;
    ball.wobblePhase = 0;
    ball.wobblesLeft = WOBBLE_COUNT;
    ball.willCatch = Math.random() < chance;
    ball.x = target.x;
    ball.y = target.y;
    this._spawnParticles(target.x, target.y - 10, 10, target.species.color, 'spark');
    if (accuracy > 0.75) this._addText(target.x, target.y - 46, 'Nice throw!', '#ffe07a', 18);
  }

  /** The catchable mon nearest to a landing point, if any. */
  _findTarget(x, y) {
    let best = null;
    let bestDistance = Infinity;
    for (const mon of this.mons) {
      if (mon.state === 'captured' || mon.state === 'leaving' || mon.alpha < 0.5) continue;
      const scale = depthScale(mon.y) * mon.scale;
      const dist = distance(mon.x, mon.y, x, y);
      if (dist <= CATCH_RADIUS * scale && dist < bestDistance) {
        best = mon;
        bestDistance = dist;
      }
    }
    return best;
  }

  _confirmCatch(ball) {
    const mon = ball.mon;
    ball.state = 'caught';
    ball.stateTime = 0;
    mon.state = 'gone';

    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    const multiplier = streakMultiplier(this.streak);
    const points = Math.round(mon.species.points * multiplier);
    this.score += points;
    this.caught[mon.species.id] = (this.caught[mon.species.id] || 0) + 1;
    this.balls = Math.min(MAX_BALLS, this.balls + BALL_REWARD);

    this._spawnParticles(ball.x, ball.y - 12, 22, '#ffe07a', 'spark');
    this._addText(ball.x, ball.y - 52, `+${points.toLocaleString()}`, '#ffe07a', 26);
    if (this.streak > 1) {
      this._addText(ball.x, ball.y - 82, `Streak x${this.streak}`, '#ffffff', 17);
    }
  }

  _escape(ball) {
    const mon = ball.mon;
    ball.state = 'miss';
    ball.stateTime = 0;
    mon.state = 'wander';
    mon.alpha = 1;
    mon.patience = Math.max(mon.patience, 2.5);
    startle(mon, THROW_ORIGIN);
    this._spawnParticles(ball.x, ball.y - 10, 14, '#ffffff', 'puff');
    this._addText(ball.x, ball.y - 46, 'It broke free!', '#ffb3b3', 18);
    this._breakStreak();
  }

  _breakStreak() {
    if (this.streak >= 3) this._addText(this.aim.x, this.aim.y - 30, 'Streak lost', '#ffb3b3', 15);
    this.streak = 0;
  }

  _spawnParticles(x, y, count, color, shape) {
    for (let i = 0; i < count; i += 1) {
      const angle = randomRange(0, TAU);
      const speed = randomRange(40, 170);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: randomRange(0.35, 0.8),
        maxLife: 0.8,
        size: randomRange(4, 9),
        rotation: randomRange(0, TAU),
        color,
        shape,
      });
    }
  }

  _addText(x, y, text, color, size) {
    this.texts.push({ x, y, text, color, size, life: 1.1, maxLife: 1.1 });
  }

  _updateEffects(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 320 * dt;
      p.rotation += dt * 6;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const t of this.texts) {
      t.life -= dt;
      t.y -= dt * 28;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  _checkRoundEnd() {
    if (this.finished) return;
    const busy = this.balls3d.length > 0;
    const outOfBalls = this.balls <= 0 && !busy;
    if (this.timeLeft > 0 && !outOfBalls) return;
    if (this.timeLeft <= 0 && busy) return; // let the last throw resolve
    this.finished = true;
    this._report(outOfBalls && this.timeLeft > 0);
  }

  _report(ranOutOfBalls) {
    const known = getCollection(GAME_ID);
    const discovered = new Set(addToCollection(GAME_ID, this.caught));
    const collected = Object.entries(this.caught)
      .map(([id, count]) => {
        const species = SPECIES.find((entry) => entry.id === id);
        return {
          name: species.name,
          color: species.color,
          count,
          rarity: species.rarity,
          isNew: discovered.has(id) || !known[id],
        };
      })
      .sort((a, b) => b.rarity - a.rarity || b.count - a.count);

    this.context.finish({
      score: this.score,
      title: ranOutOfBalls ? 'Out of balls!' : "Time's up!",
      collected,
      emptyText: 'No catches this round. Charge your throw and aim for the centre!',
    });
  }

  /* ------------------------------------------------------------ rendering */

  render(ctx) {
    drawBackground(ctx, this.decor, this.time);

    for (const mon of this.mons) {
      if (mon.state !== 'captured') drawMon(ctx, mon, this.time);
    }
    for (const ball of this.balls3d) drawBall(ctx, ball);

    drawParticles(ctx, this.particles);
    drawTrainer(ctx, this.charging ? this.charge : 0, this.time);

    if (!this.finished) {
      drawReticle(ctx, this.aim, this.charging ? this.charge : 0, this._findTarget(this.aim.x, this.aim.y));
    }
    drawFloatingTexts(ctx, this.texts);
    drawHud(ctx, {
      score: this.score,
      timeLeft: this.timeLeft,
      balls: this.balls,
      streak: this.streak,
      multiplier: streakMultiplier(this.streak),
      time: this.time,
    });
    if (this.introTimer > 0) drawRoundIntro(ctx, this.introTimer / 1.4);
  }
}

/* ------------------------------------------------------------- factories */

function createMon(progress) {
  const species = weightedPick(SPECIES, (entry) => spawnWeight(entry, progress));
  const y = randomRange(FIELD.top, FIELD.bottom);
  const fromLeft = Math.random() < 0.5;
  const x = fromLeft ? FIELD.left + randomRange(0, 120) : FIELD.right - randomRange(0, 120);
  return {
    species,
    x,
    y,
    target: { x: randomRange(FIELD.left, FIELD.right), y: randomRange(FIELD.top, FIELD.bottom) },
    state: 'wander',
    stateTime: 0,
    retarget: randomRange(0.4, 1.2),
    pauseTimer: 0,
    patience: randomRange(9, 15) - progress * 3,
    fleeDuration: randomRange(1.2, 2.2),
    walkPhase: randomRange(0, TAU),
    tilt: 0,
    alpha: 0,
    scale: randomRange(0.92, 1.08),
    lookX: fromLeft ? 1 : -1,
    seed: randomRange(0, 100),
  };
}

function startle(mon, origin) {
  const dx = mon.x - origin.x;
  const dy = mon.y - origin.y;
  const dist = Math.hypot(dx, dy) || 1;
  mon.state = 'flee';
  mon.stateTime = 0;
  mon.fleeDuration = randomRange(1.1, 2);
  mon.target = {
    x: clamp(mon.x + (dx / dist) * 260 + randomRange(-60, 60), FIELD.left, FIELD.right),
    y: clamp(mon.y + (dy / dist) * 160 + randomRange(-40, 40), FIELD.top, FIELD.bottom),
  };
}

function buildDecor() {
  const decor = [];
  for (let i = 0; i < 9; i += 1) {
    const y = randomRange(FIELD.top + 10, FIELD.bottom + 30);
    decor.push({
      type: 'bush',
      x: randomRange(10, 950),
      y,
      scale: depthScale(y) * randomRange(0.8, 1.2),
    });
  }
  const petals = ['#ffd166', '#ff9fd6', '#f4f6ff', '#ffb37b'];
  for (let i = 0; i < 15; i += 1) {
    const y = randomRange(FIELD.top + 16, 538);
    decor.push({
      type: 'flower',
      x: randomRange(6, 954),
      y,
      scale: depthScale(y),
      color: petals[randomInt(0, petals.length - 1)],
    });
  }
  return decor.sort((a, b) => a.y - b.y);
}

export function createCatchmon(context) {
  return new CatchmonGame(context);
}

export { CatchmonGame };
