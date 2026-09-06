export const TAU = Math.PI * 2;

export const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

export const lerp = (a, b, t) => a + (b - a) * t;

export const randomRange = (min, max) => min + Math.random() * (max - min);

export const randomInt = (min, max) => Math.floor(randomRange(min, max + 1));

export const distance = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

/** Picks an entry from `items` using `weightOf(item)` as the relative weight. */
export function weightedPick(items, weightOf) {
  let total = 0;
  for (const item of items) total += Math.max(0, weightOf(item));
  if (total <= 0) return items[0];
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= Math.max(0, weightOf(item));
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

/** Moves `value` towards `target` by at most `maxDelta`. */
export function approach(value, target, maxDelta) {
  if (value < target) return Math.min(value + maxDelta, target);
  return Math.max(value - maxDelta, target);
}

export function formatTime(seconds) {
  const whole = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
