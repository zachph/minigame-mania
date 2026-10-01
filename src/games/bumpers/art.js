import { TAU, clamp, roundedRect } from '../../core/utils.js';
import { healthShare } from './rules.js';
import { speedOf } from './physics.js';

/**
 * Everything Bumpers puts on the canvas.
 *
 * The arena is drawn once a frame underneath, then the trails, then the balls,
 * then whatever is exploding. None of it is read back, so a character that
 * arrives with a face nobody has drawn yet still turns up as a ball.
 */

const INK = 'rgba(8, 12, 20, 0.85)';

/* ------------------------------------------------------------- the arena */

export function drawArena(ctx, field, time = 0) {
  ctx.save();
  const grad = ctx.createLinearGradient(field.x, field.y, field.x, field.y + field.h);
  grad.addColorStop(0, '#17203a');
  grad.addColorStop(1, '#0f1627');
  ctx.fillStyle = grad;
  roundedRect(ctx, field.x, field.y, field.w, field.h, 18);
  ctx.fill();

  // A faint grid so speed is legible - a ball crossing it reads as fast.
  ctx.save();
  roundedRect(ctx, field.x, field.y, field.w, field.h, 18);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
  ctx.lineWidth = 1;
  for (let x = field.x + 48; x < field.x + field.w; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, field.y); ctx.lineTo(x, field.y + field.h); ctx.stroke();
  }
  for (let y = field.y + 48; y < field.y + field.h; y += 48) {
    ctx.beginPath(); ctx.moveTo(field.x, y); ctx.lineTo(field.x + field.w, y); ctx.stroke();
  }
  // A slow sweep of light, so the floor is not completely dead.
  const sweep = ((time * 0.06) % 1) * (field.w + 300) - 150;
  const glow = ctx.createLinearGradient(field.x + sweep - 120, 0, field.x + sweep + 120, 0);
  glow.addColorStop(0, 'rgba(120, 180, 255, 0)');
  glow.addColorStop(0.5, 'rgba(120, 180, 255, 0.05)');
  glow.addColorStop(1, 'rgba(120, 180, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(field.x, field.y, field.w, field.h);
  ctx.restore();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 2;
  roundedRect(ctx, field.x, field.y, field.w, field.h, 18);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------- the faces */

/**
 * One drawing per character, in a box from -1 to 1 that gets scaled to the
 * ball's radius. `fallback` means a character invented later still shows up
 * with eyes rather than as a blank disc.
 */
const FACES = {
  pebble(ctx, f) {
    ctx.fillStyle = f.spec.shade;
    ctx.beginPath(); ctx.ellipse(-0.3, -0.3, 0.3, 0.22, -0.5, 0, TAU); ctx.fill();
    eyes(ctx, 0.34, 0.2, 0.17);
  },
  boulder(ctx, f) {
    // A craggy rim, so the heavy one does not read as a smooth bubble.
    ctx.fillStyle = f.spec.shade;
    ctx.beginPath();
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * TAU;
      const r = 0.96 - (i % 2 ? 0.17 : 0);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.45;
    ctx.fill();
    ctx.globalAlpha = 1;
    eyes(ctx, 0.3, 0.1, 0.15);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.moveTo(-0.3, 0.46); ctx.lineTo(0.3, 0.46); ctx.stroke();
  },
  zip(ctx, f) {
    ctx.fillStyle = f.spec.shade;
    ctx.beginPath(); ctx.moveTo(-0.1, -0.75); ctx.lineTo(0.42, -0.05);
    ctx.lineTo(0.08, -0.02); ctx.lineTo(0.3, 0.72); ctx.lineTo(-0.42, -0.04);
    ctx.lineTo(-0.06, -0.06); ctx.closePath();
    ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1;
    eyes(ctx, 0.28, -0.08, 0.15);
  },
};

function eyes(ctx, spread, y, size) {
  ctx.fillStyle = 'rgba(10, 16, 26, 0.9)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * spread, y, size, 0, TAU);
    ctx.fill();
  }
}

const fallback = (ctx) => eyes(ctx, 0.3, 0.05, 0.16);

/* ------------------------------------------------------------- the balls */

/** A fading streak behind a ball, so you can read where it came from. */
export function drawTrail(ctx, fighter, trail) {
  if (trail.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 1; i < trail.length; i += 1) {
    const t = i / trail.length;
    ctx.strokeStyle = fighter.spec.colour;
    ctx.globalAlpha = t * 0.3;
    ctx.lineWidth = fighter.radius * 1.5 * t;
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A ring in the seat's colour, not the character's. Both sides can pick the
 * same ball, so the thing that says which one is yours cannot be the ball.
 */
export const SEAT_TINT = { a: '#6ee7ff', b: '#ff7aa8' };

export function drawFighter(ctx, fighter, { flash = 0, mine = false } = {}) {
  const { x, y, radius, spec } = fighter;
  ctx.save();

  // Set plants you: show the ground gripping before anything else.
  if (fighter.rooted) {
    ctx.strokeStyle = 'rgba(255, 190, 120, 0.75)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * (radius + 3), y + Math.sin(a) * (radius + 3));
      ctx.lineTo(x + Math.cos(a) * (radius + 13), y + Math.sin(a) * (radius + 13));
      ctx.stroke();
    }
  }

  // Dashing and guarding each get a ring, because both change what a hit does.
  if (fighter.dash > 0) {
    ctx.strokeStyle = spec.colour;
    ctx.globalAlpha = clamp(fighter.dash / 0.35, 0, 1) * 0.8;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, radius + 7, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (fighter.guard > 0) {
    ctx.strokeStyle = 'rgba(160, 220, 255, 0.8)';
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, radius + 9, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  }

  const body = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.4, radius * 0.15, x, y, radius);
  body.addColorStop(0, spec.colour);
  body.addColorStop(1, spec.shade);
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(radius, radius);
  (FACES[spec.id] || fallback)(ctx, fighter);
  ctx.restore();

  // Whose ball this is, drawn outside the body so it survives any face.
  ctx.strokeStyle = SEAT_TINT[fighter.side] || '#fff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, radius + 4, 0, TAU);
  ctx.stroke();
  if (mine) {
    ctx.fillStyle = SEAT_TINT[fighter.side] || '#fff';
    ctx.beginPath();
    ctx.moveTo(x, y - radius - 11);
    ctx.lineTo(x - 5, y - radius - 19);
    ctx.lineTo(x + 5, y - radius - 19);
    ctx.closePath();
    ctx.fill();
  }

  // Reeling: a ring of sparks says "anything you hit right now barely counts".
  if (fighter.stagger > 0) {
    ctx.strokeStyle = 'rgba(255, 240, 160, 0.8)';
    ctx.lineWidth = 2;
    const spin = fighter.stagger * 9;
    for (let i = 0; i < 3; i += 1) {
      const a = spin + (i / 3) * TAU;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * (radius + 10), y + Math.sin(a) * (radius + 10), 2.6, 0, TAU);
      ctx.stroke();
    }
  }

  if (flash > 0) {
    ctx.globalAlpha = clamp(flash, 0, 1) * 0.75;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/* ----------------------------------------------------------- the effects */

export function drawRing(ctx, effect) {
  const t = 1 - effect.life / effect.maxLife;
  ctx.save();
  ctx.globalAlpha = (1 - t) * 0.85;
  ctx.strokeStyle = effect.colour || '#fff';
  ctx.lineWidth = 5 * (1 - t) + 1;
  ctx.beginPath();
  ctx.arc(effect.x, effect.y, effect.radius * (0.3 + t * 0.9), 0, TAU);
  ctx.stroke();
  ctx.restore();
}

export function drawSpark(ctx, spark) {
  const t = spark.life / spark.maxLife;
  ctx.save();
  ctx.globalAlpha = clamp(t, 0, 1);
  ctx.fillStyle = spark.colour;
  ctx.beginPath();
  ctx.arc(spark.x, spark.y, spark.size * t, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** The number that floats off a ball when it takes one. */
export function drawPopup(ctx, popup) {
  const t = popup.life / popup.maxLife;
  ctx.save();
  ctx.globalAlpha = clamp(t * 1.4, 0, 1);
  ctx.fillStyle = popup.colour;
  ctx.font = `700 ${popup.size}px "Trebuchet MS", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(popup.text, popup.x, popup.y - (1 - t) * 34);
  ctx.restore();
}

/* --------------------------------------------------------------- the HUD */

/**
 * Three rows that cannot run into each other: the name on top, the bar, then
 * the ability pip. `y` is the top of the bar; the name sits above it and the
 * pip below, and nothing is drawn past 74 so the arena still starts at 78.
 */
function healthBar(ctx, fighter, x, y, w, align) {
  const h = 15;
  const right = align === 'right';
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  roundedRect(ctx, x, y, w, h, 7);
  ctx.fill();

  const share = healthShare(fighter);
  const fillW = Math.max(0, w * share);
  if (fillW > 2) {
    ctx.fillStyle = share > 0.5 ? '#8ef0a8' : share > 0.22 ? '#ffd166' : '#ff8b6b';
    roundedRect(ctx, right ? x + w - fillW : x, y, fillW, h, 7);
    ctx.fill();
  }

  // The number sits at the outer end of the bar, which is the end that still
  // has colour under it right up until the ball is nearly out.
  ctx.fillStyle = 'rgba(12, 18, 30, 0.8)';
  ctx.font = '700 11px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = right ? 'right' : 'left';
  ctx.fillText(`${Math.ceil(fighter.hp)}`, right ? x + w - 8 : x + 8, y + 11);

  // The name is drawn in the seat's colour, which is the same colour as the
  // ring around that ball - so there is nothing extra to read to know whose is
  // whose, even when both of you picked the same character.
  ctx.fillStyle = SEAT_TINT[fighter.side] || '#fff';
  ctx.font = '700 15px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = right ? 'right' : 'left';
  ctx.fillText(fighter.name, right ? x + w : x, y - 6);
  ctx.restore();
}

/** The ability pip: full and lit when it is ready, draining while it is not. */
function abilityPip(ctx, fighter, x, y, align) {
  const spec = fighter.spec.ability;
  const ready = fighter.cooldown <= 0;
  const share = ready ? 1 : 1 - fighter.cooldown / spec.cooldown;
  const w = 108;
  const left = align === 'right' ? x - w : x;
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  roundedRect(ctx, left, y, w, 18, 9);
  ctx.fill();
  ctx.fillStyle = ready ? 'rgba(255, 209, 102, 0.85)' : 'rgba(255, 209, 102, 0.3)';
  roundedRect(ctx, left, y, Math.max(6, w * share), 18, 9);
  ctx.fill();
  ctx.fillStyle = ready ? '#1b2238' : 'rgba(255, 255, 255, 0.7)';
  ctx.font = '700 11px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(spec.name, left + w / 2, y + 13);
  ctx.restore();
}

export function drawHud(ctx, match, { width, leftLabel, rightLabel, clock }) {
  const pad = 26;
  const barW = 286;
  const barY = 34;
  healthBar(ctx, match.a, pad, barY, barW, 'left');
  healthBar(ctx, match.b, width - pad - barW, barY, barW, 'right');
  abilityPip(ctx, match.a, pad, barY + 22, 'left');
  abilityPip(ctx, match.b, width - pad, barY + 22, 'right');

  // The labels go at the inner end of each bar, so they can never run into the
  // name at the outer end however long either of them gets.
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '700 12px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(leftLabel, pad + barW, barY - 7);
  ctx.textAlign = 'left';
  ctx.fillText(rightLabel, width - pad - barW, barY - 7);

  if (clock != null) {
    ctx.textAlign = 'center';
    ctx.fillStyle = clock <= 10 ? '#ff8b6b' : 'rgba(255, 255, 255, 0.8)';
    ctx.font = '700 24px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(String(Math.ceil(clock)), width / 2, barY + 20);
  }
  ctx.restore();
}

/** Big centred words: the countdown, and the verdict. */
export function drawBanner(ctx, width, height, text, sub) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(8, 12, 22, 0.55)';
  ctx.fillRect(0, height / 2 - 70, width, sub ? 128 : 96);
  ctx.fillStyle = '#ffd166';
  ctx.font = '800 46px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillText(text, width / 2, height / 2);
  if (sub) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.font = '700 17px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(sub, width / 2, height / 2 + 34);
  }
  ctx.restore();
}

export { speedOf };
