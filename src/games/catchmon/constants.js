export const ROUND_TIME = 60;       // seconds per round
export const START_BALLS = 24;
export const MAX_BALLS = 32;
export const BALL_REWARD = 1;       // balls refunded per successful catch

export const FIELD = { top: 202, bottom: 500, left: 44, right: 916 };
export const THROW_ORIGIN = { x: 480, y: 528 };

export const CHARGE_TIME = 0.7;     // seconds to a fully focused throw
export const FOCUS_BONUS = 0.45;    // catch-chance multiplier at full focus
export const CATCH_RADIUS = 48;     // how close a landing counts as a hit
export const STARTLE_RADIUS = 155;  // how far a landing spooks nearby mons
export const WOBBLE_TIME = 0.5;     // seconds per wobble
export const WOBBLE_COUNT = 3;

export const MAX_MONS = 7;
export const SPAWN_INTERVAL = { start: 1.2, end: 0.65 };

/** Mons further up the field are further away, so they draw smaller. */
export function depthScale(y) {
  const t = (y - FIELD.top) / (FIELD.bottom - FIELD.top);
  return 0.62 + 0.5 * Math.max(0, Math.min(1, t));
}
