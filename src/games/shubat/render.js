import { TAU, clamp, roundedRect } from '../../core/utils.js';
import { FACTIONS } from './cards.js';
import { LANES } from './rules.js';

/** Board geometry, shared by the renderer and the click handling. */
export const VIEW = { width: 960, height: 540 };
export const LANE = { width: 132, height: 92, gap: 22, top: { rival: 74, you: 208 } };
export const HAND = { y: 452, spread: 96, width: 88, height: 120 };
export const END_TURN = { x: 760, y: 318, w: 180, h: 46 };

export const laneX = (lane) => 306 + lane * (LANE.width + LANE.gap);

export function laneRect(side, lane) {
  return { x: laneX(lane), y: LANE.top[side], w: LANE.width, h: LANE.height };
}

export function laneAt(x, y) {
  for (const side of ['rival', 'you']) {
    for (let lane = 0; lane < LANES; lane += 1) {
      const rect = laneRect(side, lane);
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return { side, lane };
    }
  }
  return null;
}

export function handPositions(count) {
  const spread = Math.min(HAND.spread, 620 / Math.max(1, count));
  const start = 470 - ((count - 1) * spread) / 2;
  return Array.from({ length: count }, (_, i) => ({ x: start + i * spread, y: HAND.y }));
}

export function handCardAt(x, y, positions) {
  for (let i = positions.length - 1; i >= 0; i -= 1) {
    const spot = positions[i];
    if (Math.abs(x - spot.x) <= HAND.width / 2 && Math.abs(y - spot.y) <= HAND.height / 2) return i;
  }
  return -1;
}

export const inEndTurn = (x, y) =>
  x >= END_TURN.x && x <= END_TURN.x + END_TURN.w && y >= END_TURN.y && y <= END_TURN.y + END_TURN.h;

/* ------------------------------------------------------------------ table */

export function drawTable(ctx, time) {
  const bg = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  bg.addColorStop(0, '#241a2e');
  bg.addColorStop(0.5, '#151424');
  bg.addColorStop(1, '#1d1a2c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#9fb4ff';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 20; i += 1) {
    const y = ((time * 6 + i * 32) % (VIEW.height + 40)) - 20;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW.width, y - 12);
    ctx.stroke();
  }
  ctx.restore();

  // The line between the two halves
  ctx.strokeStyle = 'rgba(180, 195, 255, 0.22)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(280, 182);
  ctx.lineTo(920, 182);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawLanes(ctx, state, highlight) {
  for (const side of ['rival', 'you']) {
    for (let lane = 0; lane < LANES; lane += 1) {
      const rect = laneRect(side, lane);
      const lit = highlight.some((spot) => spot.side === side && spot.lane === lane);
      ctx.fillStyle = lit ? 'rgba(255, 209, 102, 0.16)' : 'rgba(255, 255, 255, 0.045)';
      roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
      ctx.fill();
      ctx.strokeStyle = lit ? '#ffd166' : 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = lit ? 2.5 : 1.2;
      ctx.stroke();
    }
  }
}

/* --------------------------------------------------------------- fighters */

export function drawFighter(ctx, fighter, side, lane, options = {}) {
  const rect = laneRect(side, lane);
  const faction = FACTIONS[fighter.card.faction];
  const hurt = options.flash || 0;

  ctx.save();
  ctx.fillStyle = faction.dark;
  roundedRect(ctx, rect.x + 3, rect.y + 3, rect.w - 6, rect.h - 6, 9);
  ctx.fill();
  ctx.fillStyle = hurt > 0 ? '#ffffff' : faction.color;
  ctx.globalAlpha = hurt > 0 ? 0.35 + hurt * 0.5 : 1;
  roundedRect(ctx, rect.x + 3, rect.y + 3, rect.w - 6, 22, 9);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#12101d';
  ctx.font = '700 13px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(fighter.name, rect.x + 10, rect.y + 15);

  drawFighterArt(ctx, fighter.card.art, faction, rect.x + rect.w - 26, rect.y + 46, 20);

  // HP bar
  const ratio = clamp(fighter.hp / fighter.maxHp, 0, 1);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  roundedRect(ctx, rect.x + 10, rect.y + 62, rect.w - 20, 9, 5);
  ctx.fill();
  ctx.fillStyle = ratio > 0.5 ? '#6ee7a8' : ratio > 0.25 ? '#ffd166' : '#ff6b6b';
  if (ratio > 0) {
    roundedRect(ctx, rect.x + 10, rect.y + 62, Math.max(5, (rect.w - 20) * ratio), 9, 5);
    ctx.fill();
  }

  ctx.fillStyle = '#f4f2ff';
  ctx.font = '700 15px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillText(`${fighter.hp}`, rect.x + 10, rect.y + 44);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffd166';
  ctx.fillText(`${fighter.damage + fighter.turnDamage}`, rect.x + rect.w - 44, rect.y + 44);

  ctx.textAlign = 'left';
  ctx.font = '600 10px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(244, 242, 255, 0.6)';
  ctx.fillText('HP', rect.x + 10, rect.y + 56);

  if (fighter.shield > 0) badge(ctx, rect.x + 8, rect.y + 78, `shield ${fighter.shield}`, '#8ed6ff');
  else if (fighter.silenced > 0) badge(ctx, rect.x + 8, rect.y + 78, `tangled ${fighter.silenced}`, '#c39bff');
  else if (!options.ready) badge(ctx, rect.x + 8, rect.y + 78, 'landing', 'rgba(255,255,255,0.45)');
  ctx.restore();
}

function badge(ctx, x, y, text, color) {
  ctx.font = '700 10px "Trebuchet MS", system-ui, sans-serif';
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = color;
  roundedRect(ctx, x, y - 7, w, 14, 7);
  ctx.fill();
  ctx.fillStyle = '#14121f';
  ctx.textAlign = 'left';
  ctx.fillText(text, x + 6, y);
}

/** A quick silhouette per fighter, so the lanes are not all rectangles. */
export function drawFighterArt(ctx, art, faction, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 20, size / 20);
  ctx.fillStyle = faction.light;
  ctx.strokeStyle = 'rgba(10, 8, 20, 0.7)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  switch (art) {
    case 'orb': ctx.arc(0, 0, 11, 0, TAU); break;
    case 'spike':
      ctx.moveTo(0, -13); ctx.lineTo(9, 10); ctx.lineTo(0, 5); ctx.lineTo(-9, 10); ctx.closePath(); break;
    case 'anvil':
      ctx.moveTo(-11, -6); ctx.lineTo(11, -6); ctx.lineTo(7, 2); ctx.lineTo(4, 11); ctx.lineTo(-4, 11); ctx.lineTo(-7, 2); ctx.closePath(); break;
    case 'tower':
      ctx.rect(-9, -11, 18, 22); break;
    case 'brain':
      ctx.arc(-4, -2, 7, 0, TAU); ctx.arc(4, -2, 7, 0, TAU); ctx.arc(0, 5, 6, 0, TAU); break;
    case 'prism':
      ctx.moveTo(0, -12); ctx.lineTo(10, 6); ctx.lineTo(-10, 6); ctx.closePath(); break;
    case 'block':
      ctx.rect(-11, -8, 22, 16); break;
    case 'puppet':
      ctx.moveTo(0, -12); ctx.lineTo(3, -4); ctx.lineTo(10, 0); ctx.lineTo(3, 4); ctx.lineTo(0, 12);
      ctx.lineTo(-3, 4); ctx.lineTo(-10, 0); ctx.lineTo(-3, -4); ctx.closePath(); break;
    case 'crown':
      ctx.moveTo(-11, 8); ctx.lineTo(-8, -8); ctx.lineTo(-3, 2); ctx.lineTo(0, -10);
      ctx.lineTo(3, 2); ctx.lineTo(8, -8); ctx.lineTo(11, 8); ctx.closePath(); break;
    default:
      ctx.moveTo(-9, 10); ctx.lineTo(-5, -9); ctx.lineTo(5, -9); ctx.lineTo(9, 10); ctx.closePath(); break;
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------- hand */

export function drawHandCard(ctx, card, x, y, options = {}) {
  const { selected = false, playable = true, scale = 1 } = options;
  const w = HAND.width * scale;
  const h = HAND.height * scale;
  const faction = FACTIONS[card.faction];
  const lift = selected ? 16 : 0;

  ctx.save();
  ctx.translate(x, y - lift);
  ctx.globalAlpha = playable ? 1 : 0.55;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  roundedRect(ctx, -w / 2 + 2, -h / 2 + 4, w, h, 9);
  ctx.fill();
  ctx.fillStyle = '#f2eefb';
  roundedRect(ctx, -w / 2, -h / 2, w, h, 9);
  ctx.fill();
  ctx.strokeStyle = selected ? '#ffd166' : faction.dark;
  ctx.lineWidth = selected ? 3 : 1.5;
  ctx.stroke();

  ctx.fillStyle = faction.color;
  roundedRect(ctx, -w / 2, -h / 2, w, 20, 9);
  ctx.fill();

  ctx.fillStyle = '#14121f';
  ctx.font = `700 ${Math.round(11 * scale)}px "Trebuchet MS", system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(card.name.slice(0, 13), -w / 2 + 6, -h / 2 + 10);

  // Cost pip
  ctx.fillStyle = '#2c2447';
  ctx.beginPath();
  ctx.arc(w / 2 - 12, -h / 2 + 30, 11, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.font = `700 ${Math.round(13 * scale)}px "Trebuchet MS", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(String(card.cost), w / 2 - 12, -h / 2 + 31);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#4a4266';
  ctx.font = `600 ${Math.round(9 * scale)}px "Trebuchet MS", system-ui, sans-serif`;
  ctx.fillText(card.kind.toUpperCase(), -w / 2 + 6, -h / 2 + 30);

  if (card.kind === 'fighter') {
    drawFighterArt(ctx, card.art, faction, 0, -2, 26);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1d1830';
    ctx.font = `700 ${Math.round(12 * scale)}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.fillText(`${card.hp}`, -w / 2 + 7, h / 2 - 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8a3b12';
    ctx.fillText(`${card.damage}`, w / 2 - 7, h / 2 - 12);
  } else {
    wrapText(ctx, card.blurb, -w / 2 + 7, -6, w - 14, 11 * scale, `600 ${Math.round(9.5 * scale)}px "Trebuchet MS", system-ui, sans-serif`, '#3b3456');
  }
  ctx.restore();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, font, color) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  const words = String(text).split(' ');
  let line = '';
  let cursor = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursor);
      line = word;
      cursor += lineHeight;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, cursor);
}

/* -------------------------------------------------------------------- hud */

export function drawSideBar(ctx, state, side, player, faction) {
  const top = side === 'rival' ? 20 : 320;
  const name = side === 'rival' ? 'Rival' : 'You';

  ctx.save();
  ctx.fillStyle = 'rgba(12, 10, 24, 0.72)';
  roundedRect(ctx, 20, top, 250, 46, 10);
  ctx.fill();
  ctx.strokeStyle = FACTIONS[faction].color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(22, top + 4);
  ctx.lineTo(22, top + 42);
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f4f2ff';
  ctx.font = '700 14px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillText(`${name} - ${FACTIONS[faction].name}`, 34, top + 14);

  const ratio = clamp(player.core / player.maxCore, 0, 1);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  roundedRect(ctx, 34, top + 26, 168, 12, 6);
  ctx.fill();
  ctx.fillStyle = ratio > 0.5 ? '#6ee7a8' : ratio > 0.25 ? '#ffd166' : '#ff6b6b';
  if (ratio > 0) {
    roundedRect(ctx, 34, top + 26, Math.max(6, 168 * ratio), 12, 6);
    ctx.fill();
  }
  ctx.fillStyle = '#f4f2ff';
  ctx.font = '700 13px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${player.core}`, 262, top + 32);

  // Cards, deck and traps
  ctx.textAlign = 'left';
  ctx.font = '600 11px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(244, 242, 255, 0.68)';
  ctx.fillText(`${player.hand.length} in hand   ${player.deck.length} in deck   ${player.traps.length} trap${player.traps.length === 1 ? '' : 's'} set`, 34, top + 46 + 10);
  ctx.restore();
}

export function drawEnergy(ctx, player) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '700 12px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(244, 242, 255, 0.7)';
  ctx.fillText('ENERGY', 300, 340);
  for (let i = 0; i < Math.max(player.maxEnergy, player.energy); i += 1) {
    ctx.beginPath();
    ctx.arc(300 + 18 + i * 22, 341, 8, 0, TAU);
    ctx.fillStyle = i < player.energy ? '#ffd166' : 'rgba(255, 255, 255, 0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

export function drawEndTurn(ctx, enabled, hot) {
  ctx.save();
  ctx.fillStyle = enabled ? (hot ? '#ffdf8f' : '#ffd166') : 'rgba(255, 255, 255, 0.12)';
  roundedRect(ctx, END_TURN.x, END_TURN.y, END_TURN.w, END_TURN.h, 12);
  ctx.fill();
  ctx.fillStyle = enabled ? '#1a1400' : 'rgba(255, 255, 255, 0.4)';
  ctx.font = '700 15px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Attack & end turn', END_TURN.x + END_TURN.w / 2, END_TURN.y + END_TURN.h / 2);
  ctx.font = '600 10px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = enabled ? 'rgba(26, 20, 0, 0.6)' : 'rgba(255, 255, 255, 0.3)';
  ctx.fillText('or press Enter', END_TURN.x + END_TURN.w / 2, END_TURN.y + END_TURN.h + 10);
  ctx.restore();
}

export function drawRivalHand(ctx, count) {
  ctx.save();
  for (let i = 0; i < count; i += 1) {
    const x = 700 + i * 22;
    ctx.fillStyle = '#3b2f5c';
    roundedRect(ctx, x, 20, 26, 38, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

export function drawTraps(ctx, count, side) {
  const y = side === 'rival' ? 172 : 300;
  ctx.save();
  for (let i = 0; i < count; i += 1) {
    const x = 306 + i * 26;
    ctx.fillStyle = side === 'rival' ? 'rgba(255, 120, 120, 0.75)' : 'rgba(140, 220, 180, 0.8)';
    roundedRect(ctx, x, y, 20, 12, 4);
    ctx.fill();
  }
  ctx.restore();
}

export function drawPopups(ctx, popups) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const popup of popups) {
    ctx.globalAlpha = clamp(popup.life / popup.maxLife, 0, 1);
    ctx.font = `700 ${popup.size}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(10, 8, 20, 0.8)';
    ctx.strokeText(popup.text, popup.x, popup.y);
    ctx.fillStyle = popup.color;
    ctx.fillText(popup.text, popup.x, popup.y);
  }
  ctx.restore();
}

export function drawMessage(ctx, text, tone) {
  if (!text) return;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '600 14px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = tone === 'good' ? '#8ef0b4' : tone === 'bad' ? '#ffb3b3' : 'rgba(240, 238, 255, 0.85)';
  ctx.fillText(text, 300, 372);
  ctx.restore();
}

export function drawBanner(ctx, text, subtext, alpha) {
  if (!text || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 44px "Trebuchet MS", system-ui, sans-serif';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(8, 6, 18, 0.85)';
  ctx.strokeText(text, VIEW.width / 2, 180);
  ctx.fillStyle = '#ffd166';
  ctx.fillText(text, VIEW.width / 2, 180);
  if (subtext) {
    ctx.font = '600 18px "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeText(subtext, VIEW.width / 2, 218);
    ctx.fillStyle = '#f0eeff';
    ctx.fillText(subtext, VIEW.width / 2, 218);
  }
  ctx.restore();
}
