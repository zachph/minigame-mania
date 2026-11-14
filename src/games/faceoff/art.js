import { TAU, clamp } from '../../core/utils.js';
import { BOX } from './content.js';

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

  const grad = ctx.createRadialGradient(who.x - who.radius * 0.35, who.y - who.radius * 0.4, 2, who.x, who.y, who.radius);
  grad.addColorStop(0, who.spec.colour);
  grad.addColorStop(1, who.spec.shade);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(who.x, who.y, who.radius, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
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
  ctx.fillText(who.name.toUpperCase(), who.x, who.y - who.radius - 8);
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
    ctx.fillStyle = who.spec.colour;
    ctx.beginPath();
    ctx.arc(cx, y, 7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = align === 'right' ? 'right' : 'left';
    ctx.fillText(who.hp > 0 ? who.name.toUpperCase() : `${who.name.toUpperCase()} X`, align === 'right' ? cx - 12 : cx + 12, y);
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
