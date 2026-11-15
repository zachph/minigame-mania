import { TAU, clamp } from '../../core/utils.js';
import { BOX } from './content.js';
import { drawHead } from './heads.js';
import { abilityOf, abilitiesOf, isClock } from './battle.js';

/**
 * The Undertale battle box, made bigger: black, a thick white border, and
 * the fight happening inside it. Health sits underneath in the same style -
 * name, HP, a yellow bar on red.
 */

const FONT = '"Courier New", ui-monospace, monospace';

export function drawScreen(ctx, width, height) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
}

export function drawBox(ctx, pressure = 1, time = 0) {
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(BOX.x, BOX.y, BOX.w, BOX.h);
  // Once everything starts hitting harder, the border says so.
  const hot = clamp((pressure - 1) * 1.2, 0, 1) * (0.6 + 0.4 * Math.sin(time * 6));
  ctx.strokeStyle = hot > 0.02 ? `rgb(255, ${Math.round(255 - hot * 150)}, ${Math.round(255 - hot * 200)})` : '#fff';
  ctx.lineWidth = 5;
  ctx.strokeRect(BOX.x - 2.5, BOX.y - 2.5, BOX.w + 5, BOX.h + 5);
  ctx.restore();
}

/** One fighter as a ball, with its name on it. */
export function drawBall(ctx, who, { flash = 0, trail = [] } = {}) {
  ctx.save();
  for (let i = 0; i < trail.length; i += 1) {
    const t = (i + 1) / trail.length;
    ctx.globalAlpha = t * 0.25;
    ctx.fillStyle = who.spec.colour;
    ctx.beginPath();
    ctx.arc(trail[i].x, trail[i].y, who.radius * t, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // The head is the fighter. A dark disc behind it and a white ring around it
  // keep the edge you are watching for collisions easy to see.
  ctx.fillStyle = '#1a1a22';
  ctx.beginPath();
  ctx.arc(who.x, who.y, who.radius, 0, TAU);
  ctx.fill();
  drawHead(ctx, who.undying ? 'undying' : who.kind === 'whis' ? 'whis' : who.id, who.x, who.y, who.radius * 0.95);
  // The ring says what is happening to it: blue when Sans has thrown it,
  // orange while it burns.
  ctx.strokeStyle = who.launched ? '#4aa8ff' : who.burn ? '#f93' : '#fff';
  ctx.lineWidth = who.launched || who.burn ? 3.5 : 2;
  ctx.beginPath();
  ctx.arc(who.x, who.y, who.radius, 0, TAU);
  ctx.stroke();

  if (flash > 0) {
    ctx.globalAlpha = clamp(flash, 0, 1) * 0.8;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(who.x, who.y, who.radius, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = '#fff';
  ctx.font = `bold 12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText((who.name || '').toUpperCase(), who.x, who.y - who.radius - 8);
  ctx.restore();
}

/**
 * The Undertale health line: NAME  HP [yellow on red]  n / max. For a fighter
 * with dodges left, the count shows where the bar would be no use.
 */
export function drawStatus(ctx, who, x, y, align = 'left') {
  if (!who) return;
  const w = 330;
  const left = align === 'right' ? x - w : x;
  ctx.save();
  ctx.font = `bold 18px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.fillText(who.name.toUpperCase(), left, y);
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillText('HP', left + 120, y + 1);

  const barX = left + 146;
  const barW = 100;
  ctx.fillStyle = '#c00';
  ctx.fillRect(barX, y - 9, barW, 18);
  ctx.fillStyle = '#ff0';
  ctx.fillRect(barX, y - 9, barW * clamp(who.hp / who.maxHp, 0, 1), 18);

  ctx.fillStyle = '#fff';
  ctx.font = `bold 15px ${FONT}`;
  ctx.fillText(`${Math.ceil(who.hp)} / ${who.maxHp}`, barX + barW + 10, y);
  if (who.dodgesLeft > 0) {
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillStyle = '#9be8ff';
    ctx.fillText(`dodges left ${who.dodgesLeft}`, left, y + 20);
  }
  ctx.font = `bold 12px ${FONT}`;
  const notes = [];
  for (const ability of abilitiesOf(who).filter(isClock)) {
    const left = Math.ceil(Math.max(0, ability.every - (who.timers[ability.kind] || 0)));
    notes.push({ text: `${ability.name} ${left}s`, colour: '#8f8' });
  }
  if (who.burn) notes.push({ text: `burning ${Math.ceil(who.burn.left)}s`, colour: '#f93' });
  // One line under the health bar, as many notes as fit.
  let at = left + (who.dodgesLeft > 0 ? 160 : 0);
  for (const note of notes) {
    ctx.fillStyle = note.colour;
    ctx.fillText(note.text, at, y + 20);
    at += ctx.measureText(note.text).width + 18;
  }
  ctx.restore();
}

/** The ones waiting, as small dots with names. */
export function drawBench(ctx, lane, x, y, align = 'left') {
  ctx.save();
  ctx.font = `bold 12px ${FONT}`;
  ctx.textBaseline = 'middle';
  let at = 0;
  lane.team.forEach((who, i) => {
    if (i === lane.front) return;
    const cx = align === 'right' ? x - at * 110 - 8 : x + at * 110 + 8;
    ctx.globalAlpha = who.hp > 0 ? 1 : 0.3;
    drawHead(ctx, who.id, cx, y, 11);
    ctx.fillStyle = '#fff';
    ctx.textAlign = align === 'right' ? 'right' : 'left';
    ctx.fillText(who.hp > 0 ? who.name.toUpperCase() : `${who.name.toUpperCase()} X`, align === 'right' ? cx - 16 : cx + 16, y);
    at += 1;
  });
  ctx.restore();
}

export function drawPopup(ctx, popup) {
  const t = clamp(popup.life / popup.maxLife, 0, 1);
  ctx.save();
  ctx.globalAlpha = t;
  ctx.fillStyle = popup.colour;
  ctx.font = `bold ${popup.size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(popup.text, popup.x, popup.y - (1 - t) * 30);
  ctx.restore();
}

export function drawSpark(ctx, spark) {
  const t = clamp(spark.life / spark.maxLife, 0, 1);
  ctx.save();
  ctx.globalAlpha = t;
  ctx.fillStyle = '#fff';
  ctx.fillRect(spark.x - 2, spark.y - 2, 4, 4);
  ctx.restore();
}

export function drawText(ctx, text, x, y, { size = 16, colour = '#fff', align = 'center' } = {}) {
  ctx.save();
  ctx.fillStyle = colour;
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Big words across the middle of the box: the countdown and the verdict. */
export function drawBanner(ctx, text, sub) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(BOX.x, BOX.y + BOX.h / 2 - 50, BOX.w, sub ? 100 : 76);
  drawText(ctx, text, BOX.x + BOX.w / 2, BOX.y + BOX.h / 2 - 14, { size: 34 });
  if (sub) drawText(ctx, sub, BOX.x + BOX.w / 2, BOX.y + BOX.h / 2 + 24, { size: 15, colour: '#ccc' });
  ctx.restore();
}

/**
 * Gojo's Infinity: a faint ring at its range, brighter while someone is
 * inside it and being slowed.
 */
export function drawInfinity(ctx, who, active, time = 0) {
  const aura = abilityOf(who, 'infinity');
  if (!aura || who.hp <= 0) return;
  ctx.save();
  ctx.strokeStyle = '#9fd8ff';
  ctx.globalAlpha = active ? 0.55 + 0.25 * Math.sin(time * 10) : 0.18;
  ctx.lineWidth = active ? 3 : 1.5;
  ctx.setLineDash(active ? [] : [6, 6]);
  ctx.beginPath();
  ctx.arc(who.x, who.y, aura.range, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** A slowed ball gets a blue rim, so you can see Infinity doing its job. */
export function drawSlowed(ctx, who) {
  ctx.save();
  ctx.strokeStyle = '#9fd8ff';
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(who.x, who.y, who.radius + 4, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** A shot in flight: a long streak, brightest at the head. */
export function drawShot(ctx, shot) {
  ctx.save();
  const tailX = shot.x - shot.dx * shot.length;
  const tailY = shot.y - shot.dy * shot.length;
  const grad = ctx.createLinearGradient(tailX, tailY, shot.x, shot.y);
  grad.addColorStop(0, 'rgba(255, 40, 40, 0)');
  grad.addColorStop(1, shot.colour);
  ctx.strokeStyle = grad;
  ctx.lineCap = 'round';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(shot.x, shot.y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 220, 220, 0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(shot.x - shot.dx * shot.length * 0.5, shot.y - shot.dy * shot.length * 0.5);
  ctx.lineTo(shot.x, shot.y);
  ctx.stroke();
  ctx.restore();
}

/** Dismantle landing: a few clean cuts across the target, fading out. */
export function drawSlash(ctx, slash) {
  const t = clamp(slash.life / slash.maxLife, 0, 1);
  ctx.save();
  ctx.globalAlpha = t;
  ctx.lineCap = 'round';
  for (const [angle, offset] of [[-0.7, -10], [-0.6, 4], [-0.8, 16]]) {
    const len = 34 + (1 - t) * 16;
    const cx = slash.x + offset * 0.6;
    const cy = slash.y + offset * 0.4;
    ctx.strokeStyle = '#ff3355';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(angle) * len, cy - Math.sin(angle) * len);
    ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A Gaster Blaster: a long skull on the wall, and a white beam from its mouth
 * to whoever it has locked on to.
 */
export function drawBlaster(ctx, blaster, target, time = 0) {
  ctx.save();
  const angle = target ? Math.atan2(target.y - blaster.y, target.x - blaster.x) : 0;
  if (target) {
    const flicker = 0.75 + 0.25 * Math.sin(time * 40);
    ctx.globalAlpha = flicker;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(blaster.x, blaster.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // The skull, pointing along the beam.
  ctx.translate(blaster.x, blaster.y);
  ctx.rotate(angle);
  ctx.fillStyle = '#f2f2f2';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-22, -14);
  ctx.lineTo(10, -16);
  ctx.lineTo(24, -6);
  ctx.lineTo(24, 6);
  ctx.lineTo(10, 16);
  ctx.lineTo(-22, 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(-4, -7, 4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(-4, 7, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = '#7ab8ff';
  ctx.beginPath(); ctx.arc(-4, -7, 1.6, 0, TAU); ctx.fill();
  ctx.restore();
}
