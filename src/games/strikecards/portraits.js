import { TAU } from '../../core/utils.js';

/**
 * A portrait for every card, drawn from code.
 *
 * Each one works in a box from -30 to 30 around the origin, so a caller only
 * has to translate and scale. There is no shared body plan here on purpose: a
 * Ravener is a mouth and a Tank is a shell, and the point of the roster is that
 * you can tell them apart at a glance rather than reading the name.
 */

const OUTLINE = 'rgba(10, 14, 22, 0.85)';

/** Fill and outline whatever the last path was. */
function ink(ctx, fill, width = 2) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

const blob = (ctx, x, y, rx, ry, fill) => {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ink(ctx, fill);
};

const poly = (ctx, points, fill) => {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ink(ctx, fill);
};

/** Two dots, which is most of what makes a shape look like a creature. */
function eyes(ctx, x, y, spread = 6, size = 2.6, colour = '#101820') {
  ctx.fillStyle = colour;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + side * spread, y, size, 0, TAU);
    ctx.fill();
  }
}

/** A pair of wings behind whatever else is drawn. */
function wings(ctx, y, span, drop, fill) {
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(side * span, y - drop, side * span * 0.8, y + drop * 0.8);
    ctx.quadraticCurveTo(side * span * 0.4, y + drop * 0.4, 0, y);
    ink(ctx, fill, 1.5);
  }
}

const bolt = (ctx, x, y, scale, fill) => {
  ctx.beginPath();
  ctx.moveTo(x, y - 16 * scale);
  ctx.lineTo(x + 7 * scale, y - 2 * scale);
  ctx.lineTo(x + 1 * scale, y - 1 * scale);
  ctx.lineTo(x + 6 * scale, y + 16 * scale);
  ctx.lineTo(x - 7 * scale, y - 1 * scale);
  ctx.lineTo(x - 1 * scale, y - 2 * scale);
  ctx.closePath();
  ink(ctx, fill, 1.8);
};

/* ------------------------------------------------------------ the roster */

const PORTRAITS = {
  nipper(ctx, c) {
    for (const side of [-1, 1]) {
      poly(ctx, [[side * 8, 2], [side * 24, -10], [side * 26, -2], [side * 14, 6]], c.shade);
    }
    blob(ctx, 0, 4, 13, 10, c.tint);
    eyes(ctx, 0, 0, 5, 2.2);
  },

  flicker(ctx, c) {
    ctx.beginPath();
    ctx.moveTo(-26, 12); ctx.quadraticCurveTo(-6, 6, 6, -14);
    ctx.strokeStyle = c.shade; ctx.lineWidth = 4; ctx.stroke();
    poly(ctx, [[8, -18], [20, 2], [8, -2], [12, 16], [-2, -4], [6, -6]], c.tint);
  },

  warden(ctx, c) {
    // A helmeted head behind a shield that covers most of it.
    blob(ctx, 4, -10, 9, 9, c.shade);
    ctx.beginPath(); ctx.rect(-4, -13, 16, 4); ink(ctx, '#2c3542', 1.2);
    poly(ctx, [[-22, -16], [2, -16], [2, 10], [-10, 22], [-22, 10]], c.tint);
    ctx.strokeStyle = c.shade; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-10, -12); ctx.lineTo(-10, 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-19, -3); ctx.lineTo(-1, -3); ctx.stroke();
  },

  hiver(ctx, c) {
    wings(ctx, -6, 24, 14, 'rgba(230, 244, 255, 0.55)');
    blob(ctx, 0, 4, 11, 15, c.tint);
    ctx.fillStyle = c.shade;
    for (const y of [-2, 6, 13]) { ctx.beginPath(); ctx.rect(-10, y, 20, 4); ctx.fill(); }
    poly(ctx, [[-3, 19], [3, 19], [0, 28]], c.shade);
    blob(ctx, 0, -12, 8, 7, c.tint);
    eyes(ctx, 0, -13, 4, 2.2);
  },

  armoren(ctx, c) {
    blob(ctx, 0, 6, 18, 15, c.shade);
    ctx.beginPath();
    ctx.ellipse(0, 4, 14, 11, 0, Math.PI, 0);
    ink(ctx, c.tint);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, 4); ctx.stroke();
    blob(ctx, 0, -12, 8, 6, c.tint);
    eyes(ctx, 0, -13, 4, 2);
  },

  razor(ctx, c) {
    for (const side of [-1, 1]) {
      poly(ctx, [[side * 3, 14], [side * 9, -20], [side * 14, -4], [side * 7, 16]], c.tint);
    }
    blob(ctx, 0, 10, 7, 8, c.shade);
    eyes(ctx, 0, 9, 3, 2, '#ffe9a8');
  },

  bulwark(ctx, c) {
    // A gatehouse: two towers, a battlement between them, and a lit doorway.
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.rect(side * 22 - 9, -16, 18, 36); ink(ctx, c.shade);
      ctx.fillStyle = c.tint;
      for (let i = 0; i < 3; i += 1) ctx.fillRect(side * 22 - 9 + i * 6.5, -21, 4.5, 6);
    }
    ctx.beginPath(); ctx.rect(-14, -6, 28, 26); ink(ctx, c.tint);
    ctx.fillStyle = c.shade;
    for (let i = -14; i < 14; i += 7) ctx.fillRect(i, -12, 4.5, 7);
    // The gate, standing open, with something awake behind it.
    ctx.beginPath();
    ctx.moveTo(-7, 20); ctx.lineTo(-7, 4); ctx.quadraticCurveTo(0, -4, 7, 4); ctx.lineTo(7, 20);
    ctx.closePath(); ink(ctx, '#0d1220', 1.5);
    eyes(ctx, 0, 8, 3.4, 1.8, c.tint);
  },

  gorewing(ctx, c) {
    for (const side of [-1, 1]) {
      poly(ctx, [[0, -2], [side * 30, -16], [side * 22, 2], [side * 28, 8], [side * 10, 10]], c.shade);
    }
    blob(ctx, 0, 0, 9, 13, c.tint);
    poly(ctx, [[-6, -10], [6, -10], [0, -20]], c.tint);
    eyes(ctx, 0, -4, 4, 2.4, '#3a0a10');
  },

  zaplin(ctx, c) {
    blob(ctx, 0, 6, 12, 11, c.shade);
    bolt(ctx, 0, -4, 1, c.tint);
    eyes(ctx, 0, 10, 5, 2.2, '#0b1c28');
  },

  bolter(ctx, c) {
    blob(ctx, 0, 8, 14, 12, c.shade);
    bolt(ctx, -8, -4, 0.9, c.tint);
    bolt(ctx, 9, -6, 1.1, c.tint);
    eyes(ctx, 0, 12, 6, 2.4, '#0b1c28');
  },

  stormbeat(ctx, c) {
    blob(ctx, -9, -6, 12, 9, c.shade);
    blob(ctx, 9, -8, 13, 10, c.shade);
    blob(ctx, 0, -2, 16, 11, c.tint);
    bolt(ctx, -9, 14, 0.8, '#ffe9a8');
    bolt(ctx, 9, 15, 0.7, '#ffe9a8');
    eyes(ctx, 0, -4, 7, 3, '#2a1050');
  },

  sparkfly(ctx, c) {
    wings(ctx, -2, 20, 12, 'rgba(255, 255, 255, 0.5)');
    blob(ctx, 0, 4, 8, 11, c.tint);
    bolt(ctx, 0, 2, 0.5, '#ffffff');
    eyes(ctx, 0, -4, 4, 2);
  },

  duskmoth(ctx, c) {
    for (const side of [-1, 1]) {
      poly(ctx, [[0, 0], [side * 26, -14], [side * 20, 12], [0, 8]], c.tint);
      ctx.beginPath();
      ctx.arc(side * 15, -2, 4, 0, TAU);
      ink(ctx, c.shade, 1.2);
    }
    blob(ctx, 0, 2, 5, 13, c.shade);
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.quadraticCurveTo(side * 8, -20, side * 11, -16);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
    }
  },

  stonewall(ctx, c) {
    // Rough stones stacked into something that is watching you back.
    const rows = [
      [-26, -18, [13, 15, 12, 12]],
      [-22, -5, [16, 13, 15]],
      [-26, 8, [12, 14, 13, 13]],
    ];
    for (const [x0, y, widths] of rows) {
      let x = x0;
      for (const w of widths) {
        ctx.beginPath();
        ctx.moveTo(x + 1, y + 1);
        ctx.lineTo(x + w - 1, y);
        ctx.lineTo(x + w - 2, y + 11);
        ctx.lineTo(x + 2, y + 12);
        ctx.closePath();
        ink(ctx, c.tint, 1.4);
        x += w;
      }
    }
    // Moss along the top course, and two eyes deep in the middle seam.
    ctx.fillStyle = 'rgba(122, 168, 108, 0.7)';
    for (const [x, w] of [[-24, 9], [-8, 12], [12, 8]]) ctx.fillRect(x, -19, w, 3.5);
    ctx.beginPath(); ctx.rect(-11, -2, 22, 6); ink(ctx, '#0d1220', 1.2);
    eyes(ctx, 0, 1, 5.5, 1.9, '#ffd98a');
  },

  windkin(ctx, c) {
    ctx.strokeStyle = c.tint;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(0, -8 + i * 11, 14 - i * 3, 0.15 * Math.PI, 1.5 * Math.PI);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    blob(ctx, 2, -8, 7, 7, c.tint);
    eyes(ctx, 2, -9, 3.5, 2, c.shade);
  },

  ravener(ctx, c) {
    blob(ctx, 0, 2, 20, 17, c.shade);
    ctx.beginPath();
    ctx.ellipse(0, 4, 14, 11, 0, 0, TAU);
    ink(ctx, '#2a0c08', 1.5);
    ctx.fillStyle = c.tint;
    for (let i = -12; i <= 12; i += 6) {
      ctx.beginPath(); ctx.moveTo(i, -5); ctx.lineTo(i + 3, 3); ctx.lineTo(i + 6, -5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(i, 13); ctx.lineTo(i + 3, 5); ctx.lineTo(i + 6, 13); ctx.closePath(); ctx.fill();
    }
    eyes(ctx, 0, -14, 9, 2.6, '#ffe0d0');
  },

  warpike(ctx, c) {
    // The pike goes corner to corner so it reads as a long weapon, not a stick.
    ctx.save();
    ctx.translate(6, 0);
    ctx.rotate(0.42);
    ctx.beginPath(); ctx.rect(-2.5, -18, 5, 44); ink(ctx, '#6b4a22', 1.5);
    poly(ctx, [[-7, -18], [0, -34], [7, -18], [0, -12]], '#e8eef5');
    ctx.beginPath(); ctx.rect(-6, -14, 12, 4); ink(ctx, c.shade, 1.2);
    ctx.restore();
    blob(ctx, -8, 10, 13, 13, c.tint);
    blob(ctx, -8, -8, 9, 8, c.shade);
    eyes(ctx, -8, -9, 4, 2.2, '#ffe9c8');
  },

  tank(ctx, c) {
    // A plated shell over a low body, so it reads as armour rather than foliage.
    ctx.beginPath();
    ctx.ellipse(0, 8, 25, 18, 0, Math.PI, 0);
    ink(ctx, c.tint);
    ctx.strokeStyle = c.shade;
    ctx.lineWidth = 2.5;
    for (const angle of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.moveTo(-25 + 50 * angle, 8);
      ctx.lineTo(Math.cos(Math.PI + Math.PI * angle) * 14, 8 + Math.sin(Math.PI + Math.PI * angle) * 12);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(0, 8, 13, 9, 0, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath(); ctx.rect(-25, 8, 50, 7); ink(ctx, c.shade, 1.5);
    for (const x of [-17, 0, 17]) { ctx.beginPath(); ctx.rect(x - 4, 15, 8, 5); ink(ctx, c.shade, 1.2); }
    blob(ctx, 0, 6, 7, 6, c.shade);
    eyes(ctx, 0, 5, 3, 1.8, '#dfe6d8');
  },

  'iron-boots'(ctx, c) {
    for (const side of [-1, 1]) {
      poly(ctx, [[side * 3, -18], [side * 13, -18], [side * 13, 8], [side * 22, 8], [side * 22, 18], [side * 3, 18]], c.tint);
      ctx.beginPath(); ctx.rect(side === -1 ? -14 : 2, -14, 12, 5); ink(ctx, c.shade, 1.2);
    }
  },

  sword(ctx, c) {
    poly(ctx, [[-4, -28], [4, -28], [5, 8], [0, 14], [-5, 8]], c.tint);
    ctx.beginPath(); ctx.rect(-14, 8, 28, 5); ink(ctx, c.shade, 1.5);
    ctx.beginPath(); ctx.rect(-3, 13, 6, 14); ink(ctx, c.shade, 1.5);
    ctx.beginPath(); ctx.arc(0, 28, 4, 0, TAU); ink(ctx, c.tint, 1.5);
  },

  greatshield(ctx, c) {
    poly(ctx, [[0, -26], [20, -18], [20, 6], [0, 26], [-20, 6], [-20, -18]], c.tint);
    ctx.strokeStyle = c.shade;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, 18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-13, -4); ctx.lineTo(13, -4); ctx.stroke();
  },

  spurs(ctx, c) {
    ctx.beginPath();
    ctx.arc(0, 4, 13, 0.85 * Math.PI, 2.15 * Math.PI);
    ctx.strokeStyle = c.shade;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.save();
    ctx.translate(0, -12);
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * TAU;
      const radius = i % 2 === 0 ? 11 : 5;
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath();
    ink(ctx, c.tint, 1.5);
    ctx.restore();
  },
};

/** Falls back to a plain wedge for anything not drawn yet. */
function fallback(ctx, card) {
  poly(ctx, [[0, -18], [16, 12], [-16, 12]], card.tint || '#b7c0cf');
}

/**
 * Draws `card`'s portrait centred on (x, y). `size` is roughly how tall it
 * comes out; the drawings are authored in a 60-unit box.
 */
export function drawPortrait(ctx, card, x, y, size = 60) {
  const draw = PORTRAITS[card.id] || fallback;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 60, size / 60);
  draw(ctx, card);
  ctx.restore();
}

export const hasPortrait = (id) => Object.hasOwn(PORTRAITS, id);
export const portraitCount = () => Object.keys(PORTRAITS).length;
