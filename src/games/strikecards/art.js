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
