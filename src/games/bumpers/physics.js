import { BALL_BOUNCE, DRAG, DRIFT_SPEED, FIELD, WALL_BOUNCE } from './content.js';

/**
 * The moving-balls half of Bumpers, with no idea that anyone has health.
 *
 * Nothing in here reads a clock or a keyboard: you hand `stepMotion` a steering
 * vector and a timestep and it moves one ball, and you hand `collide` two balls
 * that are overlapping and it separates them and tells you how hard they met.
 * That is what makes the whole thing testable without a browser.
 */

const speedOf = (ball) => Math.hypot(ball.vx, ball.vy);

/** Scales a ball's velocity to exactly `speed`, keeping its direction. */
export function setSpeed(ball, speed) {
  const now = speedOf(ball);
  if (now < 1e-6) {
    ball.vx = speed;
    ball.vy = 0;
    return;
  }
  const k = speed / now;
  ball.vx *= k;
  ball.vy *= k;
}

/** Caps a ball at `limit` without touching it if it is already slower. */
export function capSpeed(ball, limit) {
  const now = speedOf(ball);
  if (now > limit) setSpeed(ball, limit);
}

/**
 * Moves one ball for `dt` seconds.
 *
 * `steer` is a direction you are leaning in, length 0..1. Drag always pulls
 * speed down, but a ball is never allowed below `DRIFT_SPEED`, which is why
 * the arena keeps moving even when both players let go of everything.
 */
export function stepMotion(ball, steer, dt) {
  const thrust = ball.thrust * (ball.thrustScale ?? 1);
  ball.vx += steer.x * thrust * dt;
  ball.vy += steer.y * thrust * dt;

  // Your own engine cannot push you past your top speed, but a dash or a shove
  // can, so the cap only bites while you are the one doing the pushing.
  const steering = Math.hypot(steer.x, steer.y) > 0.01;
  if (steering && speedOf(ball) > ball.top) {
    const over = speedOf(ball) - ball.top;
    setSpeed(ball, speedOf(ball) - Math.min(over, ball.thrust * dt));
  }

  const decay = Math.exp(-DRAG * dt);
  ball.vx *= decay;
  ball.vy *= decay;
  if (!ball.rooted && speedOf(ball) < DRIFT_SPEED) setSpeed(ball, DRIFT_SPEED);
  if (ball.rooted) {
    ball.vx *= 0.02;
    ball.vy *= 0.02;
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
}

/**
 * Keeps a ball inside the arena. Returns the speed it hit the wall with, or 0
 * if it never touched one, so a caller can spark and rattle on contact.
 */
export function bounceOffWalls(ball, field = FIELD) {
  const left = field.x + ball.radius;
  const right = field.x + field.w - ball.radius;
  const top = field.y + ball.radius;
  const bottom = field.y + field.h - ball.radius;
  let impact = 0;

  if (ball.x < left) {
    impact = Math.max(impact, Math.abs(ball.vx));
    ball.x = left;
    ball.vx = Math.abs(ball.vx) * WALL_BOUNCE;
  } else if (ball.x > right) {
    impact = Math.max(impact, Math.abs(ball.vx));
    ball.x = right;
    ball.vx = -Math.abs(ball.vx) * WALL_BOUNCE;
  }
  if (ball.y < top) {
    impact = Math.max(impact, Math.abs(ball.vy));
    ball.y = top;
    ball.vy = Math.abs(ball.vy) * WALL_BOUNCE;
  } else if (ball.y > bottom) {
    impact = Math.max(impact, Math.abs(ball.vy));
    ball.y = bottom;
    ball.vy = -Math.abs(ball.vy) * WALL_BOUNCE;
  }
  return impact;
}

/** True when the two balls are touching or overlapping. */
export function overlapping(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y) <= a.radius + b.radius;
}

/**
 * Resolves a collision between two balls and reports what happened.
 *
 * The return is `{ nx, ny, approachA, approachB, closing }` where `approachA`
 * is how fast A was travelling *into* B along the line between their centres,
 * never below zero. Those two numbers are the whole damage model: the one who
 * brought the speed is the one who deals the hit.
 *
 * A ball with `rooted` set does not move and does not give ground, which is
 * what makes Boulder's Set worth having.
 */
export function collide(a, b) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dist = Math.hypot(dx, dy);
  if (dist < 1e-6) {
    // Exactly on top of each other: pick an axis so the maths stays finite.
    dx = 1;
    dy = 0;
    dist = 1;
  }
  const nx = dx / dist;
  const ny = dy / dist;

  const approachA = Math.max(0, a.vx * nx + a.vy * ny);
  const approachB = Math.max(0, -(b.vx * nx + b.vy * ny));
  const closing = approachA + approachB;

  // Push them apart first, so the next frame does not see them overlapping and
  // charge for the same hit twice.
  const gap = a.radius + b.radius - dist;
  if (gap > 0) {
    const aFixed = a.rooted ? 1 : 0;
    const bFixed = b.rooted ? 1 : 0;
    let shareA = 0.5;
    if (aFixed && !bFixed) shareA = 0;
    else if (bFixed && !aFixed) shareA = 1;
    else if (aFixed && bFixed) shareA = 0.5;
    a.x -= nx * gap * shareA;
    a.y -= ny * gap * shareA;
    b.x += nx * gap * (1 - shareA);
    b.y += ny * gap * (1 - shareA);
  }

  // Equal-and-opposite impulse along the normal, weighted by mass. A rooted
  // ball is treated as infinitely heavy: it takes none of the push.
  const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (relative < 0) {
    const invA = a.rooted ? 0 : 1 / a.mass;
    const invB = b.rooted ? 0 : 1 / b.mass;
    const total = invA + invB;
    if (total > 0) {
      const impulse = (-(1 + BALL_BOUNCE) * relative) / total;
      a.vx -= nx * impulse * invA;
      a.vy -= ny * impulse * invA;
      b.vx += nx * impulse * invB;
      b.vy += ny * impulse * invB;
    }
  }

  return { nx, ny, approachA, approachB, closing };
}

/** Shoves a ball directly away from a point, for shockwaves and the like. */
export function shoveFrom(ball, x, y, strength) {
  let dx = ball.x - x;
  let dy = ball.y - y;
  const dist = Math.hypot(dx, dy) || 1;
  dx /= dist;
  dy /= dist;
  ball.vx += dx * strength;
  ball.vy += dy * strength;
}

export { speedOf };
