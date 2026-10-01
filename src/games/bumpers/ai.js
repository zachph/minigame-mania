import { clamp, lerp } from '../../core/utils.js';
import { canUseAbility } from './rules.js';
import { speedOf } from './physics.js';

/**
 * The bot that plays the other ball.
 *
 * It knows the one thing this game is really about: a hit is worth the speed
 * you carried into it, and the only way to carry speed is to pick a line and
 * hold it. Chasing someone - turning a little bit towards them every frame -
 * looks busy and arrives slow, because every correction bleeds the run.
 *
 * So the bot does two things in turn. It *builds*, steering into open floor
 * until it is quick, and then it *commits*, locking one heading and riding it
 * all the way in without looking again. Skill decides how straight that line
 * is, how fast it insists on being before it goes, and how quickly it is ready
 * to go again afterwards - never how often it twitches.
 */

const CHARGE_RANGE = 360;    // close enough that a locked line will still land
const CHARGE_TIME = 1.5;     // give up on a committed run after this long
const BUILD_LOOK = 0.3;      // seconds between glances while building speed

/** Where the other ball will be by the time we could get there. */
function intercept(me, foe) {
  const dist = Math.hypot(foe.x - me.x, foe.y - me.y);
  const closing = Math.max(140, speedOf(me));
  const lead = clamp(dist / closing, 0, 0.55);
  return { x: foe.x + foe.vx * lead, y: foe.y + foe.vy * lead };
}

/** Open floor to build speed in: away from them, but back towards the middle. */
function openFloor(me, foe, field) {
  const cx = field.x + field.w / 2;
  const cy = field.y + field.h / 2;
  const away = { x: me.x - foe.x, y: me.y - foe.y };
  const inward = { x: cx - me.x, y: cy - me.y };
  const edge = clamp(Math.hypot(inward.x, inward.y) / (field.w / 2), 0, 1);
  return {
    x: lerp(away.x, inward.x, edge * 0.85),
    y: lerp(away.y, inward.y, edge * 0.85),
  };
}

const unit = (v) => {
  const length = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / length, y: v.y / length };
};

const rotate = (v, angle) => ({
  x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
  y: v.x * Math.sin(angle) + v.y * Math.cos(angle),
});

/**
 * Whether this frame is worth the ability. Each kind wants a different moment:
 * a dash is for a run already locked in, a shockwave for when they are on top
 * of you, and Set for when you can see one coming and cannot get out of it.
 */
function wantsAbility(me, foe, dist, charging) {
  const spec = me.spec.ability;
  switch (spec.kind) {
    case 'dash':
      return charging && dist > me.radius + foe.radius + 40 && dist < CHARGE_RANGE;
    case 'shockwave':
      return dist < spec.radius + me.radius + foe.radius;
    case 'anchor': {
      const theirApproach = ((me.x - foe.x) * foe.vx + (me.y - foe.y) * foe.vy) / (dist || 1);
      return dist < 260 && theirApproach > 200;
    }
    case 'guard':
      return dist < 260;
    case 'spikes':
      return charging;
    case 'hook':
      return dist < spec.radius + me.radius + foe.radius;
    case 'mend':
      return me.hp < me.maxHp * 0.6;
    default:
      return dist < 240;
  }
}

/**
 * Builds a bot for one side. Call `think(match, dt)` once a frame and feed what
 * it returns straight into `stepMatch` as that side's command.
 *
 * `tuning` overrides any of the skill-derived dials, which is how the balance
 * simulations test one of them at a time.
 */
export function createBot(side, skill = 0.5, rng = Math.random, tuning = {}) {
  const grade = clamp(skill, 0, 1);
  const wobble = tuning.wobble ?? lerp(0.9, 0.05, grade);     // radians of aim error
  const nerve = tuning.nerve ?? lerp(0.15, 1, grade);         // willingness to spend an ability
  // Share of top speed it insists on before committing. A weak bot dithers,
  // waiting for a run it will never quite have; a strong one goes. Hanging
  // back is punished by the game's own rule - if they are coming at you and
  // you are backing away, the whole exchange is theirs - so hesitation is a
  // fault, and that is exactly what the low end of the ladder should look like.
  const patience = tuning.patience ?? lerp(0.8, 0.25, grade);
  const regroup = tuning.regroup ?? lerp(0.5, 0.15, grade);   // pause after a run

  let mode = 'build';
  let aim = { x: 1, y: 0 };
  let look = 0;
  let chargeLeft = 0;

  return {
    side,
    skill: grade,
    get mode() { return mode; },
    think(match, dt) {
      const me = side === 'a' ? match.a : match.b;
      const foe = side === 'a' ? match.b : match.a;
      const dist = Math.hypot(foe.x - me.x, foe.y - me.y);
      look -= dt;

      if (mode === 'charge') {
        chargeLeft -= dt;
        // The run is spent once it has landed, or once it has clearly missed.
        if (chargeLeft <= 0 || me.hitLock > 0) {
          mode = 'build';
          look = regroup;
        }
      }

      if (mode === 'build' && look <= 0) {
        look = BUILD_LOOK;
        const ready = speedOf(me) >= me.top * patience;
        if (ready && dist < CHARGE_RANGE) {
          const target = intercept(me, foe);
          aim = rotate(unit({ x: target.x - me.x, y: target.y - me.y }), (rng() - 0.5) * 2 * wobble);
          mode = 'charge';
          chargeLeft = CHARGE_TIME;
        } else {
          // Close by and still slow: peel into open floor. Far off: close the
          // gap, which builds the speed the next run needs anyway.
          const target = intercept(me, foe);
          const want = dist < CHARGE_RANGE
            ? openFloor(me, foe, match.field)
            : { x: target.x - me.x, y: target.y - me.y };
          aim = rotate(unit(want), (rng() - 0.5) * 2 * wobble);
        }
      }

      const ability =
        canUseAbility(me) &&
        rng() < nerve * dt * 12 &&
        wantsAbility(me, foe, dist, mode === 'charge');

      return { x: aim.x, y: aim.y, ability };
    },
  };
}
