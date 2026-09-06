import { TAU, clamp } from '../../core/utils.js';
import { TYPE_BY_ID } from './types.js';

/**
 * Every fighter is drawn from code - five body plans crossed with six type
 * palettes and crests. `drawCharacter` works in a unit space roughly 120px
 * tall standing on y = 0, so callers only deal with position and scale.
 */

const SHAPES = ['quad', 'biped', 'serpent', 'winged', 'orb'];

function mix(hex, target, amount) {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const t = target === 'light' ? 255 : 0;
  const blend = (channel) => Math.round(channel + (t - channel) * amount);
  return `rgb(${blend(r)}, ${blend(g)}, ${blend(b)})`;
}

export function paletteFor(character) {
  return {
    body: character.color,
    dark: character.accent,
    light: mix(character.color, 'light', 0.45),
    shade: mix(character.color, 'dark', 0.25),
    outline: 'rgba(20, 22, 40, 0.9)',
  };
}

/** A stable pseudo-random number for a character, so its quirks never change. */
function seedOf(character) {
  let hash = 0;
  for (let i = 0; i < character.id.length; i += 1) hash = (hash * 31 + character.id.charCodeAt(i)) >>> 0;
  return (hash % 1000) / 1000;
}

export function drawCharacter(ctx, character, options = {}) {
  const {
    x = 0,
    y = 0,
    scale = 1,
    facing = 1,
    bob = 0,
    flash = 0,
    alpha = 1,
    shadow = true,
    time = 0,
  } = options;
  const palette = paletteFor(character);
  const seed = seedOf(character);

  ctx.save();
  ctx.globalAlpha = alpha * (1 - 0.6 * clamp(flash, 0, 1));
  if (shadow) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y, 46 * scale, 12 * scale, 0, 0, TAU);
    ctx.fill();
  }

  ctx.translate(x, y - bob);
  ctx.scale(facing * scale, scale);
  ctx.lineWidth = 3;
  ctx.strokeStyle = palette.outline;
  ctx.lineJoin = 'round';

  const shape = SHAPES.includes(character.shape) ? character.shape : 'quad';
  const context = { palette, seed, time, character };
  if (shape === 'quad') drawQuad(ctx, context);
  else if (shape === 'biped') drawBiped(ctx, context);
  else if (shape === 'serpent') drawSerpent(ctx, context);
  else if (shape === 'winged') drawWinged(ctx, context);
  else drawOrb(ctx, context);

  ctx.restore();
}

/* --------------------------------------------------------------- bodies */

function blob(ctx, x, y, rx, ry, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
}

function leg(ctx, x, y, w, h, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect?.(x - w / 2, y - h, w, h, w / 2);
  if (!ctx.roundRect) ctx.rect(x - w / 2, y - h, w, h);
  ctx.fill();
  ctx.stroke();
}

function drawQuad(ctx, { palette, seed, time, character }) {
  const sway = Math.sin(time * 2 + seed * 6) * 2;
  leg(ctx, -26, 0, 15, 34, palette.shade);
  leg(ctx, 20, 0, 15, 34, palette.shade);
  leg(ctx, -14, 0, 16, 36, palette.body);
  leg(ctx, 30, 0, 16, 36, palette.body);

  // Tail
  ctx.strokeStyle = palette.outline;
  ctx.fillStyle = palette.dark;
  ctx.beginPath();
  ctx.moveTo(-30, -46);
  ctx.quadraticCurveTo(-62, -54 + sway, -56, -84 + sway);
  ctx.lineTo(-44, -74);
  ctx.quadraticCurveTo(-48, -56, -26, -40);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  blob(ctx, 0, -52, 44, 30, palette.body);
  blob(ctx, 4, -44, 26, 16, palette.light);
  blob(ctx, 34, -80, 25, 23, palette.body);        // head
  blob(ctx, 52, -74, 12, 9, palette.light);        // snout

  // Ears
  ctx.fillStyle = palette.dark;
  for (const dx of [22, 40]) {
    ctx.beginPath();
    ctx.moveTo(dx, -98);
    ctx.lineTo(dx + 12, -122);
    ctx.lineTo(dx + 18, -96);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  drawFace(ctx, palette, 40, -84, 1);
  drawCrest(ctx, character, palette, 30, -118, 1, time, seed);
}

function drawBiped(ctx, { palette, seed, time, character }) {
  const sway = Math.sin(time * 2.4 + seed * 5) * 2;
  leg(ctx, -12, 0, 16, 40, palette.shade);
  leg(ctx, 14, 0, 16, 40, palette.body);

  ctx.fillStyle = palette.body;
  ctx.beginPath();
  ctx.ellipse(2, -62, 30, 34, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  blob(ctx, 6, -56, 17, 22, palette.light);

  // Arms
  ctx.fillStyle = palette.shade;
  for (const [ax, ay, angle] of [[-22, -76, 0.5 + sway * 0.05], [24, -76, -0.4 - sway * 0.05]]) {
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, 12, 8, 20, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  blob(ctx, 8, -108, 26, 24, palette.body);
  blob(ctx, 26, -104, 11, 8, palette.light);
  ctx.fillStyle = palette.dark;
  for (const dx of [-2, 16]) {
    ctx.beginPath();
    ctx.moveTo(dx, -126);
    ctx.lineTo(dx + 8, -148);
    ctx.lineTo(dx + 16, -124);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  drawFace(ctx, palette, 14, -110, 1);
  drawCrest(ctx, character, palette, 6, -146, 1, time, seed);
}

function drawSerpent(ctx, { palette, seed, time, character }) {
  const wave = Math.sin(time * 2 + seed * 4) * 4;
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 3;

  // Coiled body drawn as a thick tapering stroke
  ctx.save();
  ctx.lineCap = 'round';
  for (const [width, colour] of [[46, palette.outline], [40, palette.body]]) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(-46, -16);
    ctx.quadraticCurveTo(-4, -6 + wave, 20, -40);
    ctx.quadraticCurveTo(40, -70 - wave, 6, -84);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 3;
  blob(ctx, -4, -96, 27, 22, palette.body);
  blob(ctx, 16, -92, 12, 9, palette.light);

  // Fins
  ctx.fillStyle = palette.dark;
  ctx.beginPath();
  ctx.moveTo(-24, -108);
  ctx.lineTo(-42, -128);
  ctx.lineTo(-14, -118);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  drawFace(ctx, palette, 4, -98, 1);
  drawCrest(ctx, character, palette, -8, -128, 0.95, time, seed);
}

function drawWinged(ctx, { palette, seed, time, character }) {
  const flap = Math.sin(time * 4 + seed * 7) * 0.35;

  ctx.save();
  ctx.translate(-6, -74);
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.rotate(dir * (0.5 + flap));
    ctx.fillStyle = dir < 0 ? palette.shade : palette.dark;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-30, -46, -66, -34);
    ctx.quadraticCurveTo(-40, -8, 0, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  leg(ctx, -8, 0, 11, 26, palette.shade);
  leg(ctx, 12, 0, 11, 26, palette.shade);

  blob(ctx, 2, -50, 30, 28, palette.body);
  blob(ctx, 8, -44, 16, 17, palette.light);
  blob(ctx, 16, -88, 24, 22, palette.body);
  blob(ctx, 34, -84, 11, 8, palette.dark);         // beak

  // Tail feathers
  ctx.fillStyle = palette.dark;
  for (const angle of [-0.35, 0, 0.35]) {
    ctx.save();
    ctx.translate(-26, -52);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(-20, 0, 22, 6, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawFace(ctx, palette, 22, -90, 0.95);
  drawCrest(ctx, character, palette, 14, -122, 0.95, time, seed);
}

function drawOrb(ctx, { palette, seed, time, character }) {
  const float = Math.sin(time * 1.8 + seed * 5) * 4;
  ctx.save();
  ctx.translate(0, -18 + float);

  // Orbiting shards
  ctx.fillStyle = palette.dark;
  for (let i = 0; i < 3; i += 1) {
    const angle = time * 1.1 + seed * 6 + (i * TAU) / 3;
    const ox = Math.cos(angle) * 56;
    const oy = Math.sin(angle) * 20 - 40;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(8, 0);
    ctx.lineTo(0, 10);
    ctx.lineTo(-8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  blob(ctx, 0, -46, 44, 44, palette.body);
  ctx.save();
  ctx.globalAlpha = 0.5;
  blob(ctx, -12, -60, 16, 12, palette.light);
  ctx.restore();
  blob(ctx, 4, -30, 24, 12, palette.shade);
  drawFace(ctx, palette, 8, -50, 1.15);
  ctx.restore();
  drawCrest(ctx, character, palette, 0, -104 + float, 1, time, seed);
}

/* ---------------------------------------------------------- face + crest */

function drawFace(ctx, palette, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  for (const dx of [-12, 6]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(dx, 0, 7, 8, 0, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#171a2b';
    ctx.beginPath();
    ctx.arc(dx + 2, 1, 3.4, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawCrest(ctx, character, palette, x, y, scale, time, seed) {
  const type = TYPE_BY_ID.get(character.type);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = type.color;
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 2.5;

  switch (type.glyph) {
    case 'flame': {
      const flicker = 1 + Math.sin(time * 8 + seed * 9) * 0.1;
      ctx.beginPath();
      ctx.moveTo(0, -26 * flicker);
      ctx.quadraticCurveTo(16, -6, 0, 6);
      ctx.quadraticCurveTo(-16, -6, 0, -26 * flicker);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'leaf': {
      ctx.save();
      ctx.rotate(Math.sin(time * 1.8 + seed * 4) * 0.15);
      ctx.beginPath();
      ctx.ellipse(0, -12, 9, 18, 0.4, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'rock': {
      ctx.beginPath();
      ctx.moveTo(-14, 4);
      ctx.lineTo(-8, -16);
      ctx.lineTo(6, -20);
      ctx.lineTo(15, -4);
      ctx.lineTo(4, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'swirl': {
      ctx.save();
      ctx.rotate(Math.sin(time * 2.2 + seed * 5) * 0.2);
      ctx.strokeStyle = type.color;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      for (const [offset, radius] of [[-14, 9], [0, 12], [12, 7]]) {
        ctx.beginPath();
        ctx.arc(0, offset - 6, radius, Math.PI * 0.15, Math.PI * 1.55);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'drop': {
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.quadraticCurveTo(12, -6, 0, 4);
      ctx.quadraticCurveTo(-12, -6, 0, -24);
      ctx.fill();
      ctx.stroke();
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(0, -10, 13, 0.35 * Math.PI, 1.75 * Math.PI);
      ctx.arc(4, -14, 11, 1.75 * Math.PI, 0.35 * Math.PI, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/** Small square portrait for roster cards and team pips. */
export function drawPortrait(ctx, character, size) {
  const scale = size / 190;
  ctx.save();
  ctx.translate(size / 2, size * 0.92);
  drawCharacter(ctx, character, { x: 0, y: 0, scale, facing: 1, shadow: false, time: 0.6 });
  ctx.restore();
}
