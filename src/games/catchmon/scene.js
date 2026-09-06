import { TAU, clamp, roundedRect } from '../../core/utils.js';
import { TYPE_BY_ID } from './types.js';
import { STATUSES } from './battle.js';
import { drawCharacter } from './art.js';

const W = 960;
const H = 540;

// The bottom third of the stage belongs to the DOM log and command panel, so
// the whole fight is staged in the top ~360px.
export const SLOTS = {
  enemy: { x: 690, y: 214, scale: 0.82, facing: -1 },
  player: { x: 246, y: 338, scale: 1.02, facing: 1 },
};

const HORIZON = 186;
const PANEL_WIDTH = 340;

const PANELS = {
  enemy: { x: 36, y: 66 },
  player: { x: W - 36 - PANEL_WIDTH, y: 236 },
};

/* ------------------------------------------------------------------ arena */

export function drawArena(ctx, time) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2b3a72');
  sky.addColorStop(HORIZON / H - 0.001, '#8492d4');
  sky.addColorStop(HORIZON / H, '#79ab68');
  sky.addColorStop(1, '#357044');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Sun band sitting on the horizon
  ctx.save();
  ctx.globalAlpha = 0.3 + Math.sin(time * 0.6) * 0.04;
  ctx.fillStyle = '#ffe9a8';
  ctx.beginPath();
  ctx.ellipse(690, HORIZON, 96, 40, 0, Math.PI, TAU);
  ctx.fill();
  ctx.restore();

  // Distant ridge
  ctx.fillStyle = 'rgba(38, 52, 96, 0.45)';
  for (const [x, w, h] of [[120, 300, 86], [430, 380, 124], [810, 320, 96]]) {
    ctx.beginPath();
    ctx.ellipse(x, HORIZON, w / 2, h / 2, 0, Math.PI, TAU);
    ctx.fill();
  }

  drawPlatform(ctx, SLOTS.enemy.x, SLOTS.enemy.y, 132, 30, '#5c9a5a');
  drawPlatform(ctx, SLOTS.player.x, SLOTS.player.y, 200, 44, '#54925a');
}

function drawPlatform(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = 'rgba(24, 40, 30, 0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + 8, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.ellipse(x - rx * 0.25, y - ry * 0.3, rx * 0.5, ry * 0.35, 0, 0, TAU);
  ctx.fill();
}

/* --------------------------------------------------------------- fighters */

export function drawFighter(ctx, side, fighter, display, time) {
  if (!fighter) return;
  const slot = SLOTS[side];
  const lunge = display.lunge * (side === 'player' ? 60 : -60);
  const shake = display.shake > 0 ? (Math.random() - 0.5) * display.shake * 14 : 0;
  const bob = Math.sin(time * 2 + (side === 'player' ? 0 : 1)) * 3;

  drawCharacter(ctx, fighter.character, {
    x: slot.x + lunge + shake,
    y: slot.y + (side === 'player' ? 6 : 2),
    scale: slot.scale * (display.entering ? 0.6 + display.entering * 0.4 : 1),
    facing: slot.facing,
    bob: bob + display.hop,
    flash: display.flash,
    alpha: display.alpha,
    time,
  });

  if (fighter.shielded) {
    ctx.save();
    ctx.globalAlpha = 0.35 + Math.sin(time * 6) * 0.1;
    ctx.strokeStyle = '#cfe8ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(slot.x, slot.y - 60 * slot.scale, 74 * slot.scale, 88 * slot.scale, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

/* ----------------------------------------------------------------- panels */

export function drawPanels(ctx, battle, display) {
  drawPanel(ctx, battle, 'enemy', display.enemy.hpShown);
  drawPanel(ctx, battle, 'player', display.player.hpShown);
}

function drawPanel(ctx, battle, side, hpShown) {
  const fighter = battle.activeOf(side);
  const panel = PANELS[side];
  const width = PANEL_WIDTH;
  const height = 84;
  const type = TYPE_BY_ID.get(fighter.character.type);

  ctx.save();
  ctx.fillStyle = 'rgba(14, 18, 38, 0.82)';
  roundedRect(ctx, panel.x, panel.y, width, height, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 20px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillText(fighter.character.name, panel.x + 16, panel.y + 22);

  // Type chip
  const chipText = type.name.toUpperCase();
  ctx.font = '700 11px "Trebuchet MS", system-ui, sans-serif';
  const chipWidth = ctx.measureText(chipText).width + 16;
  const chipX = panel.x + width - 16 - chipWidth;
  ctx.fillStyle = type.color;
  roundedRect(ctx, chipX, panel.y + 13, chipWidth, 18, 9);
  ctx.fill();
  ctx.fillStyle = '#15182b';
  ctx.textAlign = 'center';
  ctx.fillText(chipText, chipX + chipWidth / 2, panel.y + 23);

  // HP bar
  const barX = panel.x + 16;
  const barY = panel.y + 40;
  const barW = width - 32;
  const ratio = clamp(hpShown / fighter.maxHp, 0, 1);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  roundedRect(ctx, barX, barY, barW, 12, 6);
  ctx.fill();
  ctx.fillStyle = ratio > 0.5 ? '#6ee7a8' : ratio > 0.22 ? '#ffd166' : '#ff6b6b';
  if (ratio > 0) {
    roundedRect(ctx, barX, barY, Math.max(6, barW * ratio), 12, 6);
    ctx.fill();
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.font = '600 13px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillText(`${Math.max(0, Math.round(hpShown))} / ${fighter.maxHp}`, barX, barY + 26);

  // Status and stat-stage chips
  let chipRight = panel.x + width - 16;
  if (fighter.status) {
    const status = STATUSES[fighter.status.id];
    chipRight = drawMiniChip(ctx, chipRight, barY + 20, status.short, '#ff9f6b');
  }
  for (const stat of ['atk', 'def', 'spd']) {
    const stage = fighter.stages[stat];
    if (!stage) continue;
    const label = `${stat.toUpperCase()}${stage > 0 ? '+' : ''}${stage}`;
    chipRight = drawMiniChip(ctx, chipRight, barY + 20, label, stage > 0 ? '#8ee7ff' : '#ff8ea8');
  }

  drawTeamPips(ctx, battle, side, panel, width);
  ctx.restore();
}

function drawMiniChip(ctx, right, y, text, color) {
  ctx.font = '700 11px "Trebuchet MS", system-ui, sans-serif';
  const width = ctx.measureText(text).width + 12;
  const x = right - width;
  ctx.fillStyle = color;
  roundedRect(ctx, x, y - 8, width, 16, 8);
  ctx.fill();
  ctx.fillStyle = '#15182b';
  ctx.textAlign = 'center';
  ctx.fillText(text, x + width / 2, y);
  ctx.textAlign = 'left';
  return x - 6;
}

function drawTeamPips(ctx, battle, side, panel, width) {
  const team = battle.teams[side];
  const y = panel.y - 12;
  const startX = panel.x + width - 16 - (team.length - 1) * 18;
  team.forEach((fighter, index) => {
    const x = startX + index * 18;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, TAU);
    ctx.fillStyle = fighter.fainted
      ? 'rgba(255, 255, 255, 0.2)'
      : index === battle.active[side]
        ? fighter.character.color
        : 'rgba(255, 255, 255, 0.7)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(10, 14, 30, 0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

/* ---------------------------------------------------------------- effects */

export function drawPopups(ctx, popups) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const popup of popups) {
    const life = clamp(popup.life / popup.maxLife, 0, 1);
    ctx.globalAlpha = life;
    ctx.font = `700 ${popup.size}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(16, 18, 34, 0.85)';
    ctx.strokeText(popup.text, popup.x, popup.y);
    ctx.fillStyle = popup.color;
    ctx.fillText(popup.text, popup.x, popup.y);
  }
  ctx.globalAlpha = 1;
}

export function drawParticles(ctx, particles) {
  for (const particle of particles) {
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawBanner(ctx, text, alpha) {
  if (!text || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 46px "Trebuchet MS", system-ui, sans-serif';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(12, 14, 30, 0.8)';
  ctx.strokeText(text, W / 2, 150);
  ctx.fillStyle = '#ffe07a';
  ctx.fillText(text, W / 2, 150);
  ctx.restore();
}

export function drawTurnBadge(ctx, turn, limit) {
  ctx.save();
  ctx.fillStyle = 'rgba(14, 18, 38, 0.75)';
  roundedRect(ctx, W / 2 - 58, 16, 116, 30, 15);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 14px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = turn > limit - 6 ? '#ffb3b3' : '#ffffff';
  ctx.fillText(`TURN ${turn} / ${limit}`, W / 2, 32);
  ctx.restore();
}
