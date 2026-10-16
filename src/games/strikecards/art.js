import { TAU, clamp, roundedRect } from '../../core/utils.js';
import { RARITY_BY_ID } from './collection.js';
import { drawPortrait } from './portraits.js';

/** Everything Strike Cards draws. No game state is changed in here. */

export const CARD_W = 104;
export const CARD_H = 140;

const face = (rarity) => RARITY_BY_ID.get(rarity) || RARITY_BY_ID.get('common');

/** The little gem that says what a stat is. */
function pip(ctx, x, y, value, color, label) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  roundedRect(ctx, x, y, 28, 18, 5);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = '700 12px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), x + 14, y + 10);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.font = '700 7px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillText(label, x + 14, y - 5);
}

/**
 * One card. `state` carries what the board knows: current hp, whether it has
 * swung, whether it is picked, and whether it is a legal thing to click.
 */
export function drawCard(ctx, card, x, y, state = {}) {
  const tone = face(card.rarity);
  const w = CARD_W;
  const h = CARD_H;

  ctx.save();
  if (state.spent) ctx.globalAlpha = 0.55;

  ctx.fillStyle = 'rgba(8, 13, 22, 0.95)';
  roundedRect(ctx, x, y, w, h, 10);
  ctx.fill();

  ctx.strokeStyle = state.picked ? '#ffd166' : state.targetable ? '#ff8b6b' : tone.dark;
  ctx.lineWidth = state.picked || state.targetable ? 3 : 2;
  roundedRect(ctx, x, y, w, h, 10);
  ctx.stroke();

  // A band of the rarity's colour across the top.
  ctx.fillStyle = tone.dark;
  roundedRect(ctx, x + 1, y + 1, w - 2, 22, 9);
  ctx.fill();
  ctx.fillStyle = tone.color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  // Shrink rather than spill: "Greatshield" has to fit beside its cost.
  const room = w - 38;
  let size = 12;
  ctx.font = `700 ${size}px "Trebuchet MS", system-ui, sans-serif`;
  while (ctx.measureText(card.name).width > room && size > 8) {
    size -= 1;
    ctx.font = `700 ${size}px "Trebuchet MS", system-ui, sans-serif`;
  }
  ctx.fillText(card.name, x + 8, y + 12);

  // Cost, top right.
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(x + w - 14, y + 12, 10, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#20160a';
  ctx.font = '700 12px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(card.cost), x + w - 14, y + 12);

  // A pool of the card's own colour behind the portrait, so a pale drawing
  // still reads against the dark card.
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = card.tint || tone.color;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + 62, 40, 34, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  if (card.kind === 'gear') {
    drawPortrait(ctx, card, x + w / 2, y + 56, 52);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '700 11px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    const lines = Object.entries(card.boost || {}).map(([stat, n]) => `+${n} ${stat}`);
    lines.forEach((line, i) => ctx.fillText(line, x + w / 2, y + 104 + i * 14));
  } else {
    drawPortrait(ctx, card, x + w / 2, y + 60, 62);
    const hp = state.hp ?? card.hp;
    const maxHp = state.maxHp ?? card.hp;
    pip(ctx, x + 6, y + h - 26, `${hp}`, hp < maxHp ? '#ff8b6b' : '#8ef0a8', 'HP');
    pip(ctx, x + 38, y + h - 26, card.power, '#ffd166', 'PWR');
    pip(ctx, x + 70, y + h - 26, card.speed, '#9be8ff', 'SPD');
  }

  if (state.evolvesIn != null) {
    ctx.fillStyle = 'rgba(185, 140, 255, 0.9)';
    ctx.font = '700 9px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.evolvesIn === 0 ? 'GROWING' : `grows in ${state.evolvesIn}`, x + w / 2, y + 88);
  }
  if (state.spent) {
    // Sits above the stat pips, on its own strip, so it never lands on 'PWR'.
    ctx.fillStyle = 'rgba(10, 14, 22, 0.75)';
    ctx.fillRect(x + w / 2 - 24, y + 90, 48, 13);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '700 9px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SWUNG', x + w / 2, y + 99);
  }
  ctx.restore();
}

/** An empty place a card could stand. */
export function drawSlot(ctx, x, y, label) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 2;
  roundedRect(ctx, x, y, CARD_W, CARD_H, 10);
  ctx.stroke();
  ctx.setLineDash([]);
  if (label) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.font = '600 11px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + CARD_W / 2, y + CARD_H / 2);
  }
  ctx.restore();
}

export function drawBackdrop(ctx, width, height, time) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#111a2e');
  sky.addColorStop(0.5, '#0d1524');
  sky.addColorStop(1, '#131d31');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = '#2a3a5c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  ctx.restore();
  void time;
}

/** The strip along the top of a side: points, what is left, whose turn it is. */
export function drawSideBar(ctx, side, x, y, width, { name, active, align = 'left' }) {
  ctx.save();
  ctx.fillStyle = active ? 'rgba(255, 209, 102, 0.14)' : 'rgba(255, 255, 255, 0.05)';
  roundedRect(ctx, x, y, width, 26, 8);
  ctx.fill();
  if (active) {
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.6)';
    ctx.lineWidth = 1.5;
    roundedRect(ctx, x, y, width, 26, 8);
    ctx.stroke();
  }

  ctx.font = '700 13px "Trebuchet MS", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  const textX = align === 'left' ? x + 12 : x + width - 12;
  ctx.fillStyle = active ? '#ffd166' : 'rgba(255, 255, 255, 0.7)';
  ctx.fillText(name, textX, y + 13);

  ctx.font = '600 12px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = align === 'left' ? 'right' : 'left';
  const statX = align === 'left' ? x + width - 12 : x + 12;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.fillText(`${side.points} pts   hand ${side.hand.length}   deck ${side.deck.length}   lost ${side.graveyard.length}`, statX, y + 13);
  ctx.restore();
}

export function drawLog(ctx, entries, x, y, width, height) {
  ctx.save();
  ctx.fillStyle = 'rgba(6, 10, 18, 0.7)';
  roundedRect(ctx, x, y, width, height, 8);
  ctx.fill();
  ctx.font = '600 11px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const lines = entries.slice(-4);
  lines.forEach((entry, i) => {
    ctx.globalAlpha = clamp(0.45 + (i / Math.max(1, lines.length - 1)) * 0.55, 0, 1);
    ctx.fillStyle = entry.kind === 'faint' ? '#ff9d94'
      : entry.kind === 'evolve' ? '#b98cff'
        : entry.kind === 'income' ? '#8ef0a8' : 'rgba(255, 255, 255, 0.85)';
    ctx.fillText(entry.text.slice(0, 92), x + 12, y + 14 + i * 15);
  });
  ctx.restore();
}

export function drawBanner(ctx, width, text, subtext, alpha) {
  if (!text || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 38px "Trebuchet MS", system-ui, sans-serif';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(6, 10, 18, 0.85)';
  ctx.strokeText(text, width / 2, 212);
  ctx.fillStyle = '#ffd166';
  ctx.fillText(text, width / 2, 212);
  if (subtext) {
    ctx.font = '600 15px "Trebuchet MS", system-ui, sans-serif';
    ctx.strokeText(subtext, width / 2, 240);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText(subtext, width / 2, 240);
  }
  ctx.restore();
}

/* ------------------------------------------------------- opening a pack */

/**
 * The back of a card: what you see before it turns over. Deliberately the same
 * for every card, so nothing about a face-down card gives away what it is.
 */
export function drawCardBack(ctx, x, y, w = CARD_W, h = CARD_H) {
  ctx.save();
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, '#2a3356');
  grad.addColorStop(1, '#141a2e');
  ctx.fillStyle = grad;
  roundedRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 2;
  roundedRect(ctx, x, y, w, h, 10);
  ctx.stroke();

  ctx.save();
  roundedRect(ctx, x + 7, y + 7, w - 14, h - 14, 7);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.lineWidth = 1;
  for (let i = -h; i < w; i += 9) {
    ctx.beginPath();
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + h, y + h);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 2;
  roundedRect(ctx, x + 7, y + 7, w - 14, h - 14, 7);
  ctx.stroke();

  // A struck mark in the middle, the same shape as the menu tile.
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.strokeStyle = 'rgba(255, 209, 102, 0.5)';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-13, 11);
  ctx.lineTo(4, -13);
  ctx.moveTo(-4, 13);
  ctx.lineTo(13, -11);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/**
 * A card part way through turning over. `turn` runs 0 (face down) to 1 (face
 * up); the squeeze through the middle is what sells it as one object rotating
 * rather than two pictures swapping.
 */
export function drawCardFlip(ctx, card, x, y, turn, state = {}) {
  const squeeze = Math.abs(Math.cos(Math.PI * clamp(turn, 0, 1)));
  const w = Math.max(1, CARD_W * squeeze);
  ctx.save();
  ctx.translate(x + CARD_W / 2, y);
  ctx.scale(w / CARD_W, 1);
  ctx.translate(-CARD_W / 2, 0);
  if (turn < 0.5) drawCardBack(ctx, 0, 0);
  else drawCard(ctx, card, 0, 0, state);
  ctx.restore();
}

/** The glow behind a card that has just turned over, strongest for the best. */
export function drawRarityGlow(ctx, x, y, rarity, strength = 1) {
  const tone = face(rarity);
  const cx = x + CARD_W / 2;
  const cy = y + CARD_H / 2;
  const reach = CARD_H * (0.62 + strength * 0.45);
  const glow = ctx.createRadialGradient(cx, cy, CARD_W * 0.2, cx, cy, reach);
  glow.addColorStop(0, tone.color);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.save();
  ctx.globalAlpha = 0.34 * strength;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, reach, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * The sealed pack, before you tear it. `shake` nudges it about so it reads as
 * something you are about to do violence to rather than a picture of a box.
 */
export function drawSealedPack(ctx, x, y, kind, { shake = 0, scale = 1 } = {}) {
  const w = CARD_W * 1.28;
  const h = CARD_H * 1.28;
  ctx.save();
  ctx.translate(x + (Math.random() - 0.5) * shake * 7, y + (Math.random() - 0.5) * shake * 7);
  ctx.scale(scale, scale);
  ctx.translate(-w / 2, -h / 2);

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, kind.color);
  grad.addColorStop(1, kind.dark);
  ctx.fillStyle = grad;
  roundedRect(ctx, 0, 0, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(8, 12, 20, 0.7)';
  ctx.lineWidth = 3;
  roundedRect(ctx, 0, 0, w, h, 12);
  ctx.stroke();

  // The torn strip across the top, so it is obvious which end opens.
  ctx.save();
  roundedRect(ctx, 0, 0, w, h, 12);
  ctx.clip();
  ctx.fillStyle = 'rgba(8, 12, 20, 0.35)';
  ctx.beginPath();
  ctx.moveTo(0, 26);
  for (let i = 0; i <= w; i += 11) ctx.lineTo(i, 26 + (i % 22 ? 5 : -5));
  ctx.lineTo(w, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.font = '800 17px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(kind.name.split(' ')[0].toUpperCase(), w / 2, h * 0.56);
  ctx.font = '700 11px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillText('PACK', w / 2, h * 0.56 + 18);
  ctx.restore();
}
