import { TAU, clamp, roundedRect } from '../../core/utils.js';
import { CHARGE_FULL } from './content.js';

/**
 * Everything Faceoff draws. It reads the fight and changes nothing in it.
 *
 * The two fighters in front are drawn big in the middle; the ones waiting sit
 * small at the edges with their own health showing, because a Mender healing
 * the bench is only worth watching if you can see the bench.
 */

const INK = 'rgba(8, 12, 20, 0.85)';

export const STAGE = { x: 24, y: 96, w: 912, h: 300 };
export const SPOT = { a: { x: 356, y: 302 }, b: { x: 604, y: 302 } };

/* ------------------------------------------------------------ the figures */

/** One mark per fighter, drawn in a box from -1 to 1 over the body. */
const MARKS = {
  bulwark(ctx) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(-0.55, -0.1, 1.1, 0.75);
    ctx.fillStyle = 'rgba(8, 12, 20, 0.45)';
    for (let i = -0.55; i < 0.55; i += 0.37) ctx.fillRect(i, -0.1, 0.06, 0.75);
  },
  edge(ctx) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.moveTo(0, -0.85); ctx.lineTo(0.28, 0.5); ctx.lineTo(0, 0.8); ctx.lineTo(-0.28, 0.5);
    ctx.closePath(); ctx.fill();
  },
  flicker(ctx) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 0.17; ctx.lineCap = 'round';
    for (const dx of [-0.42, 0, 0.42]) {
      ctx.beginPath(); ctx.moveTo(dx - 0.12, -0.6); ctx.lineTo(dx + 0.12, 0.6); ctx.stroke();
    }
  },
  mender(ctx) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(-0.18, -0.6, 0.36, 1.2);
    ctx.fillRect(-0.6, -0.18, 1.2, 0.36);
  },
  rot(ctx) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (const [x, y, r] of [[-0.3, -0.2, 0.26], [0.28, 0.05, 0.2], [-0.05, 0.45, 0.16]]) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  },
  mirror(ctx) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 0.14;
    ctx.beginPath(); ctx.moveTo(0, -0.8); ctx.lineTo(0, 0.8); ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath(); ctx.moveTo(-0.08, -0.7); ctx.lineTo(-0.6, 0); ctx.lineTo(-0.08, 0.7); ctx.closePath(); ctx.fill();
  },
  leech(ctx) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.moveTo(-0.5, -0.4); ctx.quadraticCurveTo(0, 0.25, 0.5, -0.4);
    ctx.lineTo(0.3, 0.6); ctx.quadraticCurveTo(0, 0.15, -0.3, 0.6);
    ctx.closePath(); ctx.fill();
  },
  halt(ctx) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 0.16;
    ctx.beginPath(); ctx.arc(0, 0, 0.55, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -0.4); ctx.moveTo(0, 0); ctx.lineTo(0.35, 0.12); ctx.stroke();
  },
  encore(ctx) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 0.16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, 0.5, 0.6, TAU * 0.86); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.3, -0.52); ctx.lineTo(0.42, -0.1); ctx.lineTo(0.02, -0.2); ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.fill();
  },
};

const plainMark = (ctx) => {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.beginPath(); ctx.arc(0, 0, 0.42, 0, TAU); ctx.fill();
};

/**
 * One fighter. `scale` is the body radius, so the same drawing does for the
 * two in front and the small ones waiting their turn.
 */
export function drawFighter(ctx, who, x, y, scale, { flash = 0, facing = 1, dim = false, bob = 0 } = {}) {
  const out = who.hp <= 0;
  ctx.save();
  ctx.translate(x, y + bob);
  if (out || dim) ctx.globalAlpha = out ? 0.3 : 0.75;

  // A shadow, so nothing floats.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(0, scale * 1.05, scale * 0.8, scale * 0.22, 0, 0, TAU);
  ctx.fill();

  ctx.scale(facing, 1);
  const body = ctx.createLinearGradient(0, -scale, 0, scale);
  body.addColorStop(0, who.spec.colour);
  body.addColorStop(1, who.spec.shade);
  ctx.fillStyle = body;
  roundedRect(ctx, -scale * 0.78, -scale, scale * 1.56, scale * 2, scale * 0.42);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1.5, scale * 0.09);
  ctx.stroke();

  ctx.save();
  ctx.scale(scale * 0.62, scale * 0.62);
  (MARKS[who.id] || plainMark)(ctx);
  ctx.restore();

  if (flash > 0) {
    ctx.globalAlpha = clamp(flash, 0, 1) * 0.8;
    ctx.fillStyle = '#fff';
    roundedRect(ctx, -scale * 0.78, -scale, scale * 1.56, scale * 2, scale * 0.42);
    ctx.fill();
  }
  ctx.restore();
}

/* --------------------------------------------------------------- the bars */

function bar(ctx, x, y, w, h, share, colour, back = 'rgba(255, 255, 255, 0.12)') {
  ctx.fillStyle = back;
  roundedRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  const fill = Math.max(0, w * clamp(share, 0, 1));
  if (fill > 1) {
    ctx.fillStyle = colour;
    roundedRect(ctx, x, y, fill, h, h / 2);
    ctx.fill();
  }
}

const healthColour = (share) => (share > 0.5 ? '#8ef0a8' : share > 0.22 ? '#ffd166' : '#ff8b6b');

/** The front fighter's name, health and charge, under where it stands. */
export function drawFrontPanel(ctx, who, x, y, align) {
  if (!who) return;
  const w = 236;
  const left = align === 'right' ? x - w : x;
  ctx.save();
  ctx.textAlign = align === 'right' ? 'right' : 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = who.spec.colour;
  ctx.font = '700 16px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillText(who.name, align === 'right' ? left + w : left, y);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '700 11px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillText(who.spec.title, align === 'right' ? left + w : left, y + 14);

  const share = who.hp / who.maxHp;
  bar(ctx, left, y + 22, w, 13, share, healthColour(share));
  ctx.fillStyle = 'rgba(12, 18, 30, 0.85)';
  ctx.font = '700 10px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = align === 'right' ? 'right' : 'left';
  ctx.fillText(`${Math.ceil(Math.max(0, who.hp))}`, align === 'right' ? left + w - 7 : left + 7, y + 32);

  // The charge bar is the one that says what is about to happen.
  bar(ctx, left, y + 39, w, 7, who.charge / CHARGE_FULL, '#9be8ff');

  const spec = who.spec.ability;
  const until = spec.charge > 0 ? spec.charge - (who.acts % spec.charge) : 0;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.font = '700 11px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = align === 'right' ? 'right' : 'left';
  const label = spec.passive ? spec.name
    : until === spec.charge ? `${spec.name} ready` : `${spec.name} in ${until}`;
  ctx.fillText(label, align === 'right' ? left + w : left, y + 60);
  ctx.restore();
}

/** The ones waiting, down the outside edge. */
export function drawBench(ctx, lane, x, y, align) {
  ctx.save();
  lane.team.forEach((who, i) => {
    if (i === lane.front) return;
    const top = y + i * 46;
    const cx = align === 'right' ? x - 20 : x + 20;
    drawFighter(ctx, who, cx, top + 16, 15, { dim: true, facing: align === 'right' ? -1 : 1 });
    const w = 92;
    const left = align === 'right' ? x - 44 - w : x + 44;
    ctx.fillStyle = who.hp > 0 ? 'rgba(255, 255, 255, 0.75)' : 'rgba(255, 255, 255, 0.3)';
    ctx.font = '700 11px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = align === 'right' ? 'right' : 'left';
    ctx.fillText(who.name, align === 'right' ? left + w : left, top + 10);
    bar(ctx, left, top + 16, w, 7, who.hp / who.maxHp, healthColour(who.hp / who.maxHp));
  });
  ctx.restore();
}

/* ------------------------------------------------------------ the extras */

export function drawPopup(ctx, popup) {
  const t = clamp(popup.life / popup.maxLife, 0, 1);
  ctx.save();
  ctx.globalAlpha = t;
  ctx.fillStyle = popup.colour;
  ctx.font = `800 ${popup.size}px "Trebuchet MS", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(popup.text, popup.x, popup.y - (1 - t) * 40);
  ctx.restore();
}

export function drawStage(ctx, width, height, time, pressure = 1) {
  ctx.save();
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#141d35');
  sky.addColorStop(1, '#0b1020');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // The floor the two of them stand on.
  const floor = ctx.createLinearGradient(0, STAGE.y, 0, STAGE.y + STAGE.h);
  floor.addColorStop(0, 'rgba(120, 160, 255, 0.07)');
  floor.addColorStop(1, 'rgba(120, 160, 255, 0.015)');
  ctx.fillStyle = floor;
  roundedRect(ctx, STAGE.x, STAGE.y, STAGE.w, STAGE.h, 20);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Once the pressure is on, the room says so.
  if (pressure > 1.01) {
    ctx.globalAlpha = clamp((pressure - 1) * 0.5, 0, 0.35) * (0.6 + 0.4 * Math.sin(time * 4));
    ctx.strokeStyle = '#ff8b6b';
    ctx.lineWidth = 3;
    roundedRect(ctx, STAGE.x, STAGE.y, STAGE.w, STAGE.h, 20);
    ctx.stroke();
  }
  ctx.restore();
}

/** The running commentary, newest last. */
export function drawLog(ctx, entries, x, y, width, height) {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 12, 22, 0.55)';
  roundedRect(ctx, x, y, width, height, 10);
  ctx.fill();
  const rows = entries.slice(-3);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  rows.forEach((entry, i) => {
    const fade = 0.35 + (i / Math.max(1, rows.length - 1)) * 0.6;
    ctx.globalAlpha = rows.length === 1 ? 0.95 : fade;
    ctx.fillStyle = entry.ability ? '#ffd166' : 'rgba(255, 255, 255, 0.85)';
    ctx.font = `${entry.ability ? 700 : 400} 13px "Trebuchet MS", system-ui, sans-serif`;
    ctx.fillText(entry.text.slice(0, 92), x + 14, y + 20 + i * 17);
  });
  ctx.restore();
}

export function drawBanner(ctx, width, height, text, sub) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(8, 12, 22, 0.62)';
  ctx.fillRect(0, height / 2 - 62, width, sub ? 118 : 88);
  ctx.fillStyle = '#ffd166';
  ctx.font = '800 40px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillText(text, width / 2, height / 2);
  if (sub) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '700 16px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(sub, width / 2, height / 2 + 32);
  }
  ctx.restore();
}
