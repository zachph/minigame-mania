import { TAU, clamp, roundedRect } from '../../core/utils.js';
import { SUIT_BY_ID } from './cards.js';

/**
 * The Shubat table: a felt mat, two hands, the trick in the middle and the
 * stock with the trump card showing under it. Cards are drawn from code.
 */

export const CARD = { w: 74, h: 104, radius: 10 };

export const LAYOUT = {
  hand: { x: 480, y: 452, spread: 84, lift: 18 },
  rival: { x: 480, y: 92, spread: 52, scale: 0.72 },
  trick: { you: { x: 520, y: 300 }, rival: { x: 440, y: 236 } },
  stock: { x: 118, y: 268 },
  discard: { x: 852, y: 268 },
};

const FELT_TOP = '#1d3b34';
const FELT_BOTTOM = '#12261f';

export function drawTable(ctx, width, height, time) {
  const felt = ctx.createLinearGradient(0, 0, 0, height);
  felt.addColorStop(0, FELT_TOP);
  felt.addColorStop(1, FELT_BOTTOM);
  ctx.fillStyle = felt;
  ctx.fillRect(0, 0, width, height);

  // A woven band across the middle, so the mat reads as cloth rather than void.
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = '#a8e6c8';
  ctx.lineWidth = 2;
  for (let i = -6; i < 26; i += 1) {
    const offset = i * 46 + Math.sin(time * 0.25 + i) * 3;
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + 180, height);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#0b1a15';
  ctx.lineWidth = 3;
  roundedRect(ctx, 24, 24, width - 48, height - 48, 18);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ cards */

export function drawCard(ctx, card, x, y, options = {}) {
  const { scale = 1, rotation = 0, faceUp = true, glow = 0, dim = false, alpha = 1 } = options;
  const w = CARD.w * scale;
  const h = CARD.h * scale;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);

  ctx.fillStyle = 'rgba(6, 14, 12, 0.4)';
  roundedRect(ctx, -w / 2 + 2, -h / 2 + 5, w, h, CARD.radius * scale);
  ctx.fill();

  if (!faceUp) {
    drawCardBack(ctx, w, h, scale);
    ctx.restore();
    return;
  }

  const suit = SUIT_BY_ID.get(card.suit);
  ctx.fillStyle = dim ? '#c9c6bd' : '#f7f3e8';
  roundedRect(ctx, -w / 2, -h / 2, w, h, CARD.radius * scale);
  ctx.fill();
  ctx.strokeStyle = glow > 0 ? '#ffd166' : 'rgba(20, 26, 24, 0.55)';
  ctx.lineWidth = (glow > 0 ? 3 : 1.5) * scale;
  ctx.stroke();

  // Suit band down the left edge
  ctx.save();
  ctx.beginPath();
  roundedRect(ctx, -w / 2, -h / 2, w, h, CARD.radius * scale);
  ctx.clip();
  ctx.fillStyle = suit.color;
  ctx.fillRect(-w / 2, -h / 2, 7 * scale, h);
  ctx.restore();

  ctx.fillStyle = dim ? '#7b7568' : suit.dark;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `700 ${Math.round(22 * scale)}px "Trebuchet MS", system-ui, sans-serif`;
  ctx.fillText(String(card.rank), -w / 2 + 13 * scale, -h / 2 + 8 * scale);

  drawSuitGlyph(ctx, suit, 4 * scale, 6 * scale, 22 * scale, dim);

  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.font = `700 ${Math.round(14 * scale)}px "Trebuchet MS", system-ui, sans-serif`;
  ctx.fillStyle = dim ? '#8b8577' : suit.dark;
  ctx.fillText(`${card.rank} pts`, w / 2 - 8 * scale, h / 2 - 7 * scale);

  if (glow > 0) {
    ctx.strokeStyle = `rgba(255, 209, 102, ${glow})`;
    ctx.lineWidth = 4 * scale;
    roundedRect(ctx, -w / 2 - 3, -h / 2 - 3, w + 6, h + 6, (CARD.radius + 3) * scale);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCardBack(ctx, w, h, scale) {
  ctx.fillStyle = '#3b2f5c';
  roundedRect(ctx, -w / 2, -h / 2, w, h, CARD.radius * scale);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1.5 * scale;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  roundedRect(ctx, -w / 2 + 5 * scale, -h / 2 + 5 * scale, w - 10 * scale, h - 10 * scale, 7 * scale);
  ctx.clip();
  ctx.strokeStyle = 'rgba(180, 160, 235, 0.55)';
  ctx.lineWidth = 1.5 * scale;
  for (let i = -4; i < 8; i += 1) {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + i * 14 * scale, -h / 2);
    ctx.lineTo(-w / 2 + i * 14 * scale + h, h / 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(255, 233, 168, 0.9)';
  ctx.beginPath();
  ctx.arc(0, 0, 9 * scale, 0, TAU);
  ctx.fill();
}

/** Each herd gets a silhouette: a camel, a horse, a falcon, a yurt. */
export function drawSuitGlyph(ctx, suit, x, y, size, dim = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = dim ? '#9a9488' : suit.color;
  ctx.strokeStyle = dim ? '#6f6a5f' : suit.dark;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';

  switch (suit.glyph) {
    case 'camel':
      ctx.beginPath();
      ctx.moveTo(-10, 8);
      ctx.lineTo(-8, 0);
      ctx.quadraticCurveTo(-6, -7, -2, -1);
      ctx.quadraticCurveTo(2, -8, 6, -1);
      ctx.lineTo(8, 2);
      ctx.quadraticCurveTo(11, 2, 10, -4);
      ctx.lineTo(12, -6);
      ctx.lineTo(11, 2);
      ctx.lineTo(9, 8);
      ctx.lineTo(6, 3);
      ctx.lineTo(-4, 3);
      ctx.lineTo(-6, 8);
      ctx.closePath();
      break;
    case 'horse':
      ctx.beginPath();
      ctx.moveTo(-9, 9);
      ctx.lineTo(-6, -1);
      ctx.quadraticCurveTo(-4, -8, 3, -9);
      ctx.lineTo(6, -12);
      ctx.lineTo(8, -8);
      ctx.quadraticCurveTo(11, -4, 7, 1);
      ctx.lineTo(8, 9);
      ctx.lineTo(4, 9);
      ctx.lineTo(2, 2);
      ctx.lineTo(-3, 2);
      ctx.lineTo(-5, 9);
      ctx.closePath();
      break;
    case 'falcon':
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.quadraticCurveTo(9, -6, 12, 3);
      ctx.quadraticCurveTo(5, 0, 2, 8);
      ctx.lineTo(0, 3);
      ctx.lineTo(-2, 8);
      ctx.quadraticCurveTo(-5, 0, -12, 3);
      ctx.quadraticCurveTo(-9, -6, 0, -9);
      ctx.closePath();
      break;
    default: // yurt
      ctx.beginPath();
      ctx.moveTo(-11, 9);
      ctx.lineTo(-9, -1);
      ctx.quadraticCurveTo(0, -11, 9, -1);
      ctx.lineTo(11, 9);
      ctx.closePath();
      break;
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/* -------------------------------------------------------------------- hud */

export function handPositions(count, layout = LAYOUT.hand) {
  const positions = [];
  const spread = Math.min(layout.spread, 420 / Math.max(1, count));
  const start = -((count - 1) * spread) / 2;
  for (let i = 0; i < count; i += 1) {
    const offset = start + i * spread;
    positions.push({
      x: layout.x + offset,
      y: layout.y + Math.abs(offset) * 0.035,
      rotation: offset * 0.0016,
    });
  }
  return positions;
}

/** Which hand card is under a point, topmost first. */
export function cardAt(x, y, positions, scale = 1) {
  for (let i = positions.length - 1; i >= 0; i -= 1) {
    const spot = positions[i];
    if (
      x >= spot.x - (CARD.w * scale) / 2 && x <= spot.x + (CARD.w * scale) / 2 &&
      y >= spot.y - (CARD.h * scale) / 2 && y <= spot.y + (CARD.h * scale) / 2
    ) return i;
  }
  return -1;
}

export function drawStock(ctx, state, time) {
  const { x, y } = LAYOUT.stock;
  if (state.stock.length > 0) {
    drawCard(ctx, state.trumpCard, x + 26, y + 30, { rotation: Math.PI / 2, scale: 0.82 });
    for (let i = Math.min(4, state.stock.length - 1); i >= 0; i -= 1) {
      drawCard(ctx, null, x - i * 1.5, y - i * 2, { faceUp: false, scale: 0.82 });
    }
  }

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '600 13px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(226, 240, 232, 0.75)';
  ctx.fillText(
    state.stock.length > 0 ? `${state.stock.length} in the stock` : 'Stock empty - follow suit',
    x + 10,
    y + 78
  );
  ctx.restore();
  void time;
}

export function drawHud(ctx, width, hud) {
  const suit = SUIT_BY_ID.get(hud.trumpSuit);
  ctx.save();
  ctx.fillStyle = 'rgba(8, 20, 16, 0.72)';
  roundedRect(ctx, 24, 24, 268, 74, 12);
  ctx.fill();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = '700 13px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(226, 240, 232, 0.7)';
  ctx.fillText(`DEAL ${hud.dealNumber} OF ${hud.dealCount}`, 40, 43);

  ctx.font = '700 26px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = '#ffe07a';
  ctx.fillText(`${hud.you}`, 40, 74);
  ctx.font = '600 14px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(226, 240, 232, 0.75)';
  ctx.fillText('you', 40 + ctx.measureText(`${hud.you}`).width + 26, 76);

  ctx.textAlign = 'right';
  ctx.font = '700 26px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = '#f2f6ff';
  ctx.fillText(`${hud.rival}`, 276, 74);
  ctx.font = '600 14px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(226, 240, 232, 0.75)';
  ctx.fillText('rival', 276 - ctx.measureText(`${hud.rival}`).width - 26, 76);

  // Trump herd chip
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(8, 20, 16, 0.72)';
  roundedRect(ctx, width - 236, 24, 212, 44, 12);
  ctx.fill();
  drawSuitGlyph(ctx, suit, width - 210, 46, 26);
  ctx.fillStyle = '#f2f6ff';
  ctx.font = '700 16px "Trebuchet MS", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${suit.name} are trumps`, width - 188, 47);
  ctx.restore();
}

/** Sits under the score panel, clear of the cards flying through the middle. */
export function drawMessage(ctx, width, text, tone = 'plain') {
  if (!text) return;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '600 16px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = tone === 'good' ? '#8ef0b4' : tone === 'bad' ? '#ffb3b3' : 'rgba(232, 244, 236, 0.88)';
  ctx.fillText(text, 26, 122);
  ctx.restore();
  void width;
}

export function drawBanner(ctx, width, text, subtext, alpha) {
  if (!text || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 42px "Trebuchet MS", system-ui, sans-serif';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(6, 16, 12, 0.85)';
  ctx.strokeText(text, width / 2, 196);
  ctx.fillStyle = '#ffe07a';
  ctx.fillText(text, width / 2, 196);
  if (subtext) {
    ctx.font = '600 18px "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeText(subtext, width / 2, 234);
    ctx.fillStyle = '#eaf3ee';
    ctx.fillText(subtext, width / 2, 234);
  }
  ctx.restore();
}
