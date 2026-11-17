import { TAU, clamp } from '../../core/utils.js';
import { BOX } from './content.js';
import { drawHead } from './heads.js';
import { abilityOf, abilitiesOf, beamLine, beamWidth, isClock } from './battle.js';

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
  // A dash leaves streaks of water behind it.
  if (who.dash) {
    ctx.strokeStyle = 'rgba(150, 210, 255, 0.7)';
    ctx.lineCap = 'round';
    for (const [off, len] of [[-12, 70], [0, 95], [12, 70]]) {
      const px = -who.dash.dy * off;
      const py = who.dash.dx * off;
      ctx.lineWidth = off === 0 ? 4 : 2.5;
      ctx.beginPath();
      ctx.moveTo(who.x + px - who.dash.dx * who.radius, who.y + py - who.dash.dy * who.radius);
      ctx.lineTo(who.x + px - who.dash.dx * len, who.y + py - who.dash.dy * len);
      ctx.stroke();
    }
  }

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
  // Under the health bar, wrapping onto a second line rather than running off
  // the edge - Sans has a dodge count and three countdowns.
  const edge = Math.min(left + w + 40, 950);
  let at = left + (who.dodgesLeft > 0 ? 160 : 0);
  let line = y + 20;
  for (const note of notes) {
    const width = ctx.measureText(note.text).width;
    if (at + width > edge && at > left) {
      at = left;
      line += 16;
    }
    ctx.fillStyle = note.colour;
    ctx.fillText(note.text, at, line);
    at += width + 18;
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
  // Kept inside the box - at this size it would otherwise run over the
  // health bars underneath.
  ctx.beginPath();
  ctx.rect(BOX.x, BOX.y, BOX.w, BOX.h);
  ctx.clip();
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
  if (shot.style === 'ball') { drawFireball(ctx, shot); return; }
  if (shot.style === 'spear') { drawSpear(ctx, shot); return; }
  if (shot.style === 'table') { drawTable(ctx, shot.x, shot.y, shot.size || 26, (shot.spin = (shot.spin || 0) + 0.35)); return; }
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

export { beamLine };

/** A Gaster Blaster: a skull on the wall and a white beam across the box. */
export function drawBlaster(ctx, blaster, time = 0) {
  const { start, end, angle } = beamLine(blaster);
  const width = beamWidth(blaster);
  const size = Math.min(width / 26, 3.6);   // the skull grows with its beam, up to a point
  ctx.save();
  ctx.save();
  ctx.beginPath();
  ctx.rect(BOX.x, BOX.y, BOX.w, BOX.h);     // the beam stays inside the box
  ctx.clip();
  const flicker = 0.75 + 0.25 * Math.sin(time * 40);
  ctx.globalAlpha = flicker;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineCap = 'butt';
  ctx.lineWidth = width;
  ctx.beginPath();
  // Start back behind the skull so the beam comes out of the wall (the clip trims it).
  ctx.moveTo(start.x - Math.cos(angle) * 60, start.y - Math.sin(angle) * 60);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = width * 0.55;
  ctx.stroke();
  ctx.restore();

  // The skull, pointing along the beam.
  ctx.translate(start.x, start.y);
  ctx.rotate(angle);
  ctx.scale(size, size);
  ctx.fillStyle = '#f2f2f2';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2 / size;
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

/** One bone: a white rod with a knob at each end, from y1 to y2. */
function bone(ctx, x, y1, y2) {
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 6;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(x, y1);
  ctx.lineTo(x, y2);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  for (const y of [y1, y2]) {
    ctx.beginPath();
    ctx.arc(x - 3, y, 4.5, 0, TAU);
    ctx.arc(x + 3, y, 4.5, 0, TAU);
    ctx.fill();
  }
}

/**
 * A Bone Wave: rows of bones up from the floor and down from the ceiling,
 * rising and falling as they sweep across the box from one side.
 */
export function drawBones(ctx, wave) {
  const progress = 1 - wave.left / wave.lasts;
  const spacing = 34;
  const travel = BOX.w + spacing * 8;
  const shift = progress * travel;
  ctx.save();
  ctx.beginPath();
  ctx.rect(BOX.x, BOX.y, BOX.w, BOX.h);
  ctx.clip();
  for (let i = 0; i < 40; i += 1) {
    const along = i * spacing - spacing * 8 + shift;
    const x = wave.from === 'left' ? BOX.x + along : BOX.x + BOX.w - along;
    if (x < BOX.x - 10 || x > BOX.x + BOX.w + 10) continue;
    const rise = 40 + 50 * (0.5 + 0.5 * Math.sin(i * 0.9 + progress * 8));
    bone(ctx, x, BOX.y + BOX.h - 6, BOX.y + BOX.h - rise);
    bone(ctx, x, BOX.y + 6, BOX.y + 130 - rise);
  }
  ctx.restore();
}

/** A fireball: a hot core in a glow, with flame trailing behind it. */
export function drawFireball(ctx, shot) {
  const r = shot.size || 13;
  ctx.save();
  for (let i = 5; i >= 1; i -= 1) {
    const back = i * r * 0.7;
    ctx.globalAlpha = 0.12 * (6 - i);
    ctx.fillStyle = i > 3 ? '#ff4a1a' : '#ff8a1a';
    ctx.beginPath();
    ctx.arc(shot.x - shot.dx * back, shot.y - shot.dy * back, r * (1 - i * 0.12), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const glow = ctx.createRadialGradient(shot.x, shot.y, 1, shot.x, shot.y, r * 1.6);
  glow.addColorStop(0, '#fff6c0');
  glow.addColorStop(0.4, '#ffb030');
  glow.addColorStop(1, 'rgba(255, 70, 20, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(shot.x, shot.y, r * 1.6, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** One of Undyne's spears: a shaft with a head, pointing where it flies. */
export function drawSpear(ctx, shot) {
  const len = shot.length || 46;
  ctx.save();
  ctx.translate(shot.x, shot.y);
  ctx.rotate(Math.atan2(shot.dy, shot.dx));
  ctx.strokeStyle = shot.colour;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-len, 0);
  ctx.lineTo(-6, 0);
  ctx.stroke();
  ctx.fillStyle = '#cfe6ff';
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-8, -6);
  ctx.lineTo(-5, 0);
  ctx.lineTo(-8, 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shot.colour;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/**
 * A Kamehameha: a glowing ball at the fighter's hands and a blue beam from it
 * to the target, pulsing.
 */
export function drawBeam(ctx, beam, from, target, time = 0) {
  if (!from || !target) return;
  const angle = Math.atan2(target.y - from.y, target.x - from.x);
  const sx = from.x + Math.cos(angle) * (from.radius + 4);
  const sy = from.y + Math.sin(angle) * (from.radius + 4);
  const pulse = 0.85 + 0.15 * Math.sin(time * 30);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = beam.colour;
  ctx.lineWidth = 30 * pulse;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 14 * pulse;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#eaf8ff';
  ctx.lineWidth = 5;
  ctx.stroke();
  const glow = ctx.createRadialGradient(sx, sy, 1, sx, sy, 22);
  glow.addColorStop(0, '#ffffff');
  glow.addColorStop(0.4, beam.colour);
  glow.addColorStop(1, 'rgba(106, 200, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sx, sy, 22, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** The big triangle - Saitama's table - centred on x, y, turned by `angle`. */
export function drawTable(ctx, x, y, size, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#d9a35a';
  ctx.strokeStyle = '#5a3a14';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.95, size * 0.7);
  ctx.lineTo(-size * 0.95, size * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90, 58, 20, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.45);
  ctx.lineTo(size * 0.5, size * 0.42);
  ctx.lineTo(-size * 0.5, size * 0.42);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/**
 * Saitama winding up: the triangle hangs over his head, rising as the hold
 * runs down, with a bar under it filling towards the throw.
 */
export function drawWindup(ctx, who) {
  if (!who?.windup) return;
  const done = 1 - who.windup.left / who.windup.hold;
  const lift = done * 8;
  const tx = who.x;
  // Clear of his name label, which sits just over the ball.
  const ty = who.y - who.radius - 46 - lift;
  drawTable(ctx, tx, ty, 24, Math.sin(done * 12) * 0.05);
  ctx.save();
  const barY = ty - 34;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fillRect(tx - 28, barY, 56, 5);
  ctx.fillStyle = '#ffe07a';
  ctx.fillRect(tx - 28, barY, 56 * clamp(done, 0, 1), 5);
  ctx.restore();
}

/** A Hakai square: a purple outline over a faint fill, flickering. */
export function drawZone(ctx, zone, time = 0) {
  const size = zone.stages[zone.stage]?.size || 0;
  if (!size) return;
  const half = size / 2;
  ctx.save();
  ctx.globalAlpha = 0.16 + 0.06 * Math.sin(time * 12);
  ctx.fillStyle = zone.colour;
  ctx.fillRect(zone.x - half, zone.y - half, size, size);
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = zone.colour;
  ctx.lineWidth = 4;
  ctx.strokeRect(zone.x - half, zone.y - half, size, size);
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#efe0ff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(zone.x - half + 6, zone.y - half + 6, size - 12, size - 12);
  ctx.restore();
}
