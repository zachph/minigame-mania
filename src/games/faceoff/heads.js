import { TAU } from '../../core/utils.js';

/**
 * A head for every fighter, drawn in code in a box from -1 to 1.
 *
 * Simplified on purpose - the hair, the marks, the one thing you would
 * recognise each of them by - so they still read at the size of a ball
 * bouncing around the box.
 */

const SKIN = '#f4d2b0';
const INK = '#111';

function circle(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}

function poly(ctx, points, fill) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** A row of spikes along the top of a head. */
function spikes(ctx, fill, tips, { base = -0.2, spread = 0.95 } = {}) {
  ctx.beginPath();
  ctx.moveTo(-spread, base);
  tips.forEach(([x, y], i) => {
    const next = i < tips.length - 1 ? (x + tips[i + 1][0]) / 2 : spread;
    ctx.lineTo(x, y);
    ctx.lineTo(next, base - 0.25);
  });
  ctx.lineTo(spread, base);
  ctx.quadraticCurveTo(0, -0.55, -spread, base);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function eyes(ctx, y, spread, r, fill = INK) {
  circle(ctx, -spread, y, r, fill);
  circle(ctx, spread, y, r, fill);
}

function mouth(ctx, y, w, colour = INK) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-w, y);
  ctx.quadraticCurveTo(0, y + 0.08, w, y);
  ctx.stroke();
}

/**
 * A full head of hair: spikes all the way round the top of the skull, and a
 * fringe falling over the forehead. Points are laid out around the head rather
 * than along a flat line, so the hair follows the shape of it instead of
 * sitting on top like a crown.
 */
function hair(ctx, { fill, outline, outer, inner, count, fringe, cy = 0.1 }) {
  ctx.beginPath();
  const from = Math.PI * 0.97;
  const to = Math.PI * 2.03;
  for (let i = 0; i <= count; i += 1) {
    const angle = from + ((to - from) * i) / count;
    const edge = i === 0 || i === count;
    const r = edge ? 0.76 : i % 2 ? outer : inner;
    const x = Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (const [x, y] of fringe) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 0.05;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

export const HEADS = {
  gojo(ctx) {
    circle(ctx, 0, 0.12, 0.72, SKIN);
    // The blindfold first, so his fringe can fall over the top of it.
    ctx.fillStyle = INK;
    ctx.fillRect(-0.74, 0.06, 1.48, 0.38);
    hair(ctx, {
      fill: '#f4f6ff',
      outline: '#9aa3b8',
      outer: 1.02,
      inner: 0.8,
      count: 13,
      // Tips only just over the top of the blindfold - it is the thing you
      // know him by, so most of it has to show.
      fringe: [[0.66, 0.0], [0.48, 0.12], [0.32, -0.04], [0.14, 0.13], [-0.04, -0.04],
        [-0.22, 0.12], [-0.4, -0.04], [-0.56, 0.1], [-0.7, -0.02]],
    });
    mouth(ctx, 0.64, 0.16);
  },

  sukuna(ctx) {
    circle(ctx, 0, 0.12, 0.72, SKIN);
    // Shorter and swept up, with the forehead showing.
    hair(ctx, {
      fill: '#f39aa6',
      outline: '#b85a6a',
      outer: 0.98,
      inner: 0.8,
      count: 11,
      fringe: [[0.62, -0.16], [0.44, -0.05], [0.26, -0.2], [0.06, -0.07], [-0.14, -0.21],
        [-0.34, -0.06], [-0.52, -0.18], [-0.68, -0.08]],
    });
    eyes(ctx, 0.08, 0.28, 0.08, '#c0102a');
    // The second pair, under the first.
    eyes(ctx, 0.3, 0.33, 0.055, '#c0102a');
    // Black markings under the eyes and down the cheeks.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.06;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 0.14, 0.18);
      ctx.lineTo(side * 0.42, 0.18);
      ctx.moveTo(side * 0.5, 0.4);
      ctx.lineTo(side * 0.6, 0.6);
      ctx.stroke();
    }
    mouth(ctx, 0.58, 0.2, '#600');
  },

  sans(ctx) {
    circle(ctx, 0, 0, 0.92, '#f2f2f2');
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.06;
    ctx.stroke();
    // Two empty sockets, each with a pinpoint of light.
    eyes(ctx, -0.12, 0.34, 0.2, INK);
    eyes(ctx, -0.12, 0.34, 0.06, '#fff');
    circle(ctx, 0, 0.18, 0.06, INK);
    // The grin.
    ctx.beginPath();
    ctx.moveTo(-0.55, 0.38);
    ctx.quadraticCurveTo(0, 0.78, 0.55, 0.38);
    ctx.stroke();
    for (let i = -2; i <= 2; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * 0.18, 0.44 + Math.abs(i) * -0.02);
      ctx.lineTo(i * 0.18, 0.6 - Math.abs(i) * 0.05);
      ctx.stroke();
    }
  },

  ralsei(ctx) {
    circle(ctx, 0, 0.2, 0.7, '#f6f1e4');
    // Floppy ears.
    poly(ctx, [[-0.6, 0.0], [-1.0, 0.35], [-0.62, 0.42]], '#e9e0cc');
    poly(ctx, [[0.6, 0.0], [1.0, 0.35], [0.62, 0.42]], '#e9e0cc');
    // The big green hat.
    poly(ctx, [[-0.85, -0.12], [0.85, -0.12], [0.2, -1.05], [0.05, -0.95]], '#2f8a4a');
    ctx.fillStyle = '#1f6a36';
    ctx.fillRect(-0.85, -0.2, 1.7, 0.14);
    // Glasses.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.06;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * 0.28, 0.18, 0.17, 0, TAU);
      ctx.stroke();
    }
    eyes(ctx, 0.18, 0.28, 0.05);
    mouth(ctx, 0.52, 0.12);
    ctx.fillStyle = '#e86aa0';
    ctx.fillRect(-0.55, 0.78, 1.1, 0.16);
  },

  undyne(ctx) {
    // The ponytail first, so the head sits over it.
    poly(ctx, [[0.2, -0.5], [0.95, -1.0], [0.75, -0.3]], '#d6243a');
    circle(ctx, 0, 0.1, 0.74, '#5aa8e8');
    spikes(ctx, '#d6243a', [[-0.7, -0.6], [-0.35, -0.82], [0.0, -0.75], [0.35, -0.85]], { base: -0.15, spread: 0.78 });
    // Fins for ears.
    poly(ctx, [[-0.7, 0.0], [-1.05, -0.2], [-0.9, 0.25]], '#3d7fc0');
    poly(ctx, [[0.7, 0.0], [1.05, -0.2], [0.9, 0.25]], '#3d7fc0');
    // One yellow eye, one eyepatch.
    circle(ctx, 0.28, 0.1, 0.13, '#ffe14a');
    circle(ctx, 0.28, 0.1, 0.05, INK);
    circle(ctx, -0.28, 0.1, 0.17, INK);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-0.7, -0.15);
    ctx.lineTo(0.5, 0.0);
    ctx.stroke();
    // A grin with teeth in it.
    poly(ctx, [[-0.32, 0.45], [0.32, 0.45], [0.2, 0.6], [-0.2, 0.6]], '#fff');
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.moveTo(-0.32, 0.45); ctx.lineTo(0.32, 0.45); ctx.lineTo(0.2, 0.6); ctx.lineTo(-0.2, 0.6); ctx.closePath();
    ctx.stroke();
  },

  garou(ctx) {
    circle(ctx, 0, 0.14, 0.7, SKIN);
    // Silver hair swept back into points.
    poly(ctx, [[-0.75, 0.0], [-0.95, -0.55], [-0.55, -0.35], [-0.5, -0.95], [-0.1, -0.5], [0.2, -1.05], [0.35, -0.5], [0.8, -0.85], [0.7, -0.25], [0.95, -0.2], [0.72, 0.05], [0.0, -0.3]], '#dfe2ea');
    // Narrow, angry eyes.
    ctx.fillStyle = INK;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 0.12, 0.1);
      ctx.lineTo(side * 0.48, 0.0);
      ctx.lineTo(side * 0.42, 0.14);
      ctx.closePath();
      ctx.fill();
    }
    // A scar across the cheek.
    ctx.strokeStyle = '#a0403a';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(0.3, 0.3);
    ctx.lineTo(0.5, 0.48);
    ctx.stroke();
    mouth(ctx, 0.5, 0.18);
  },

  saitama(ctx) {
    // Completely bald, and completely unbothered.
    circle(ctx, 0, 0.05, 0.88, SKIN);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.ellipse(-0.32, -0.45, 0.22, 0.12, -0.5, 0, TAU);
    ctx.fill();
    eyes(ctx, 0.12, 0.3, 0.06);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.moveTo(-0.12, 0.5);
    ctx.lineTo(0.12, 0.5);
    ctx.stroke();
  },

  goku(ctx) { gokuHead(ctx, INK, '#6a6a7a'); },

  beerus(ctx) {
    // Tall pointed ears.
    poly(ctx, [[-0.7, -0.2], [-0.6, -1.05], [-0.2, -0.45]], '#8a5cc8');
    poly(ctx, [[0.7, -0.2], [0.6, -1.05], [0.2, -0.45]], '#8a5cc8');
    poly(ctx, [[-0.6, -0.3], [-0.55, -0.85], [-0.32, -0.45]], '#c9a4f0');
    poly(ctx, [[0.6, -0.3], [0.55, -0.85], [0.32, -0.45]], '#c9a4f0');
    circle(ctx, 0, 0.15, 0.72, '#9a6cd6');
    // Yellow eyes with dark rims.
    for (const side of [-1, 1]) {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.ellipse(side * 0.3, 0.08, 0.2, 0.14, side * 0.3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath();
      ctx.ellipse(side * 0.3, 0.08, 0.13, 0.09, side * 0.3, 0, TAU);
      ctx.fill();
    }
    // Gold earrings.
    circle(ctx, -0.74, 0.35, 0.1, '#e8b830');
    circle(ctx, 0.74, 0.35, 0.1, '#e8b830');
    mouth(ctx, 0.52, 0.15);
  },
};

HEADS['gojo-eyes'] = (ctx) => {
  // The blindfold is off: bright blue eyes under the white hair.
  circle(ctx, 0, 0.12, 0.72, SKIN);
  for (const side of [-1, 1]) {
    circle(ctx, side * 0.27, 0.27, 0.15, '#fff');
    circle(ctx, side * 0.27, 0.27, 0.11, '#3ab0ff');
    circle(ctx, side * 0.27, 0.27, 0.05, '#e8f8ff');
  }
  hair(ctx, {
    fill: '#f4f6ff',
    outline: '#9aa3b8',
    outer: 1.02,
    inner: 0.8,
    count: 13,
    fringe: [[0.66, -0.02], [0.48, 0.1], [0.32, -0.06], [0.14, 0.09], [-0.04, -0.06],
      [-0.22, 0.09], [-0.4, -0.06], [-0.56, 0.08], [-0.7, -0.04]],
  });
  mouth(ctx, 0.64, 0.16);
};

HEADS.vegeta = (ctx) => {
  // Hair standing straight up in a tall flame, with a sharp widow's peak.
  poly(ctx, [[-0.7, 0.1], [-0.85, -0.5], [-0.6, -0.4], [-0.6, -1.0], [-0.3, -0.6], [-0.15, -1.15], [0.05, -0.65], [0.25, -1.12], [0.35, -0.6], [0.62, -1.0], [0.6, -0.4], [0.85, -0.5], [0.7, 0.1]], INK);
  ctx.strokeStyle = '#6a6a7a';
  ctx.lineWidth = 0.06;
  ctx.lineJoin = 'round';
  ctx.stroke();
  circle(ctx, 0, 0.25, 0.6, SKIN);
  poly(ctx, [[-0.5, -0.2], [0, 0.08], [0.5, -0.2], [0.4, -0.35], [-0.4, -0.35]], INK);
  // A frown: slanted brows and a flat mouth.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  ctx.moveTo(-0.42, 0.1); ctx.lineTo(-0.12, 0.2);
  ctx.moveTo(0.42, 0.1); ctx.lineTo(0.12, 0.2);
  ctx.stroke();
  eyes(ctx, 0.27, 0.3, 0.07);
  ctx.beginPath();
  ctx.moveTo(-0.14, 0.58); ctx.lineTo(0.14, 0.55);
  ctx.stroke();
};

HEADS.whis = (ctx) => {
  // A tall white crest of hair and a halo ring around the neck.
  poly(ctx, [[-0.35, -0.2], [-0.2, -1.05], [0.0, -0.4], [0.2, -1.05], [0.35, -0.2]], '#f4f6ff');
  circle(ctx, 0, 0.18, 0.66, '#9cc4e8');
  eyes(ctx, 0.12, 0.25, 0.07);
  mouth(ctx, 0.5, 0.14);
  ctx.strokeStyle = '#7ab8ff';
  ctx.lineWidth = 0.1;
  ctx.beginPath();
  ctx.ellipse(0, 0.86, 0.6, 0.14, 0, 0, TAU);
  ctx.stroke();
};

/** Undyne after she refuses to die: armour, and the eye burning. */
HEADS.undying = (ctx) => {
  HEADS.undyne(ctx);
  ctx.fillStyle = '#e8eef8';
  ctx.fillRect(-0.85, 0.32, 0.3, 0.42);
  ctx.fillRect(0.55, 0.32, 0.3, 0.42);
  ctx.fillStyle = 'rgba(255, 220, 60, 0.5)';
  ctx.beginPath();
  ctx.arc(0.28, 0.1, 0.26, 0, TAU);
  ctx.fill();
};

/** Draws `id`'s head centred on x, y with radius r. */
/** Goku, with his hair in whatever colour his form gives it. */
function gokuHead(ctx, hair, outline) {
  // The hair is most of him. Outlined, or black hair vanishes into the dark
  // disc every fighter sits on.
  poly(ctx, [[-0.95, 0.15], [-1.0, -0.4], [-0.7, -0.2], [-0.85, -0.85], [-0.4, -0.45], [-0.3, -1.1], [0.0, -0.55], [0.3, -1.08], [0.4, -0.45], [0.85, -0.9], [0.72, -0.2], [1.02, -0.38], [0.92, 0.15]], hair);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 0.06;
  ctx.lineJoin = 'round';
  ctx.stroke();
  circle(ctx, 0, 0.22, 0.64, SKIN);
  // A fringe of spikes over the forehead.
  poly(ctx, [[-0.6, -0.15], [-0.3, 0.12], [-0.15, -0.15], [0.05, 0.15], [0.2, -0.15], [0.4, 0.1], [0.6, -0.15], [0.3, -0.4], [-0.3, -0.4]], hair);
  eyes(ctx, 0.28, 0.25, 0.08);
  mouth(ctx, 0.58, 0.14);
}

// Goku's forms: Super Saiyan gold, God red, Blue blue, Ultra Instinct silver.
HEADS['goku-ssj'] = (ctx) => gokuHead(ctx, '#ffd84a', '#a07a10');
HEADS['goku-god'] = (ctx) => gokuHead(ctx, '#e83a4a', '#7a1020');
HEADS['goku-blue'] = (ctx) => gokuHead(ctx, '#3ac8ff', '#10608a');
HEADS['goku-ui'] = (ctx) => gokuHead(ctx, '#dfe6f4', '#7a8296');

/* ------------------------------------------------- the Story unlockables */

HEADS.genos = (ctx) => {
  // Blond spikes, and the cyborg's black eyes with yellow irises.
  circle(ctx, 0, 0.14, 0.7, SKIN);
  hair(ctx, {
    fill: '#ffd84a', outline: '#a07a10', outer: 0.98, inner: 0.78, count: 11,
    fringe: [[0.64, -0.06], [0.42, 0.06], [0.24, -0.12], [0.04, 0.04], [-0.16, -0.12], [-0.36, 0.04], [-0.56, -0.08], [-0.68, -0.02]],
  });
  for (const side of [-1, 1]) {
    circle(ctx, side * 0.28, 0.24, 0.14, INK);
    circle(ctx, side * 0.28, 0.24, 0.07, '#ffd84a');
  }
  // Metal jaw seams.
  ctx.strokeStyle = '#8a95a8';
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(-0.5, 0.45); ctx.lineTo(-0.3, 0.72);
  ctx.moveTo(0.5, 0.45); ctx.lineTo(0.3, 0.72);
  ctx.stroke();
  mouth(ctx, 0.56, 0.12);
};

HEADS.yuji = (ctx) => {
  // Pink spiky hair over a dark undercut, and the marks under his eyes.
  circle(ctx, 0, 0.14, 0.72, SKIN);
  ctx.fillStyle = '#3a2a2a';
  ctx.fillRect(-0.74, -0.1, 0.12, 0.35);
  ctx.fillRect(0.62, -0.1, 0.12, 0.35);
  hair(ctx, {
    fill: '#ff8fa0', outline: '#a84a5a', outer: 0.98, inner: 0.78, count: 11,
    fringe: [[0.6, -0.14], [0.4, 0.0], [0.2, -0.16], [0.0, 0.02], [-0.2, -0.16], [-0.4, 0.0], [-0.6, -0.14]],
  });
  eyes(ctx, 0.22, 0.28, 0.07);
  ctx.strokeStyle = '#a84a5a';
  ctx.lineWidth = 0.05;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 0.4, 0.34); ctx.lineTo(side * 0.2, 0.36);
    ctx.stroke();
  }
  mouth(ctx, 0.56, 0.16);
};

HEADS.frieza = (ctx) => {
  // White face, a purple dome on top, red eyes, purple lips.
  circle(ctx, 0, 0.18, 0.7, '#f6f2fa');
  ctx.fillStyle = '#9a4ad6';
  ctx.beginPath();
  ctx.ellipse(0, -0.28, 0.58, 0.46, 0, Math.PI, TAU);
  ctx.fill();
  ctx.fillStyle = '#c88aff';
  ctx.beginPath();
  ctx.ellipse(-0.18, -0.46, 0.16, 0.1, -0.4, 0, TAU);
  ctx.fill();
  for (const side of [-1, 1]) {
    circle(ctx, side * 0.27, 0.14, 0.11, '#fff');
    circle(ctx, side * 0.27, 0.14, 0.06, '#d01a2a');
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.06;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 0.42, -0.02); ctx.lineTo(side * 0.14, 0.04);
    ctx.stroke();
  }
  mouth(ctx, 0.5, 0.14, '#7a2a9a');
};

HEADS.lastbreath = (ctx) => {
  // Sans, cracked, with one eye burning.
  HEADS.sans(ctx);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.moveTo(0.05, -0.9); ctx.lineTo(0.15, -0.6); ctx.lineTo(0.05, -0.45); ctx.lineTo(0.2, -0.3);
  ctx.stroke();
  const glow = ctx.createRadialGradient(-0.34, -0.12, 0.02, -0.34, -0.12, 0.34);
  glow.addColorStop(0, '#fff');
  glow.addColorStop(0.3, '#7ad8ff');
  glow.addColorStop(1, 'rgba(122, 216, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(-0.34, -0.12, 0.34, 0, TAU);
  ctx.fill();
};

HEADS.frisk = (ctx) => {
  // A brown bob, eyes closed, and the blue-and-purple stripes of the jumper.
  ctx.fillStyle = '#5ab0ff';
  ctx.fillRect(-0.6, 0.72, 1.2, 0.12);
  ctx.fillStyle = '#9a5ad6';
  ctx.fillRect(-0.6, 0.84, 1.2, 0.1);
  poly(ctx, [[-0.82, 0.55], [-0.86, -0.2], [-0.5, -0.72], [0.0, -0.84], [0.5, -0.72], [0.86, -0.2], [0.82, 0.55], [0.6, 0.55], [0.62, -0.05], [-0.62, -0.05], [-0.6, 0.55]], '#7a4a24');
  circle(ctx, 0, 0.2, 0.6, SKIN);
  poly(ctx, [[-0.62, 0.02], [-0.5, -0.48], [0.5, -0.48], [0.62, 0.02], [0.3, -0.12], [0.0, 0.0], [-0.3, -0.12]], '#7a4a24');
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.05;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 0.36, 0.26); ctx.lineTo(side * 0.16, 0.26);
    ctx.stroke();
  }
  mouth(ctx, 0.5, 0.1);
};

HEADS.gojo1b = (ctx) => {
  // Gojo with the blindfold off, grinning, in a purple glow.
  const glow = ctx.createRadialGradient(0, 0, 0.5, 0, 0, 1);
  glow.addColorStop(0, 'rgba(180, 138, 255, 0)');
  glow.addColorStop(1, 'rgba(180, 138, 255, 0.8)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  HEADS['gojo-eyes'](ctx);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(-0.24, 0.58);
  ctx.quadraticCurveTo(0, 0.74, 0.24, 0.58);
  ctx.stroke();
};

HEADS.fullpower = (ctx) => {
  // Saitama, serious for once: sharp eyes, heavy brows, the red cape at his neck.
  ctx.fillStyle = '#c0202a';
  ctx.beginPath();
  ctx.ellipse(0, 0.86, 0.72, 0.16, 0, 0, TAU);
  ctx.fill();
  circle(ctx, 0, 0.05, 0.88, SKIN);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.ellipse(-0.32, -0.45, 0.22, 0.12, -0.5, 0, TAU);
  ctx.fill();
  for (const side of [-1, 1]) {
    poly(ctx, [[side * 0.46, 0.08], [side * 0.12, 0.16], [side * 0.14, 0.24], [side * 0.44, 0.2]], '#fff');
    circle(ctx, side * 0.27, 0.19, 0.05, INK);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.08;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 0.5, -0.02); ctx.lineTo(side * 0.12, 0.08);
    ctx.stroke();
  }
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.moveTo(-0.16, 0.52); ctx.lineTo(0.16, 0.52);
  ctx.stroke();
};

HEADS.susie = (ctx) => {
  // Lavender skin and a long jaw, a shaggy mane of purple hair hanging over
  // her eyes, and a wide grin full of sharp teeth.
  poly(ctx, [[-0.92, 0.72], [-0.98, 0.0], [-0.82, -0.55], [-0.45, -0.9], [0.0, -0.98], [0.45, -0.9], [0.82, -0.55], [0.98, 0.0], [0.92, 0.72], [0.7, 0.5], [0.62, 0.2], [-0.62, 0.2], [-0.7, 0.5]], '#6a2a5a');
  // The face: narrower at the top, a long jaw underneath.
  ctx.fillStyle = '#a58ad8';
  ctx.beginPath();
  ctx.moveTo(-0.52, -0.2);
  ctx.quadraticCurveTo(-0.62, 0.55, -0.3, 0.82);
  ctx.quadraticCurveTo(0, 0.94, 0.3, 0.82);
  ctx.quadraticCurveTo(0.62, 0.55, 0.52, -0.2);
  ctx.closePath();
  ctx.fill();
  // Fringe right down over the eyes, in ragged points.
  poly(ctx, [[-0.62, 0.25], [-0.58, -0.6], [0.58, -0.6], [0.62, 0.25], [0.46, 0.08], [0.34, 0.3], [0.2, 0.06], [0.06, 0.28], [-0.08, 0.06], [-0.22, 0.3], [-0.36, 0.08], [-0.48, 0.28]], '#6a2a5a');
  // A few darker strands so it reads as hair, not a hat.
  ctx.strokeStyle = '#4a1a40';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  for (const x of [-0.4, -0.15, 0.1, 0.35]) { ctx.moveTo(x, -0.7); ctx.lineTo(x + 0.05, 0.05); }
  ctx.stroke();
  // Nostrils.
  circle(ctx, -0.07, 0.44, 0.03, '#5a3a80');
  circle(ctx, 0.07, 0.44, 0.03, '#5a3a80');
  // The grin, with a row of fangs.
  ctx.fillStyle = '#2a1030';
  ctx.beginPath();
  ctx.moveTo(-0.36, 0.56);
  ctx.quadraticCurveTo(0, 0.86, 0.36, 0.56);
  ctx.quadraticCurveTo(0, 0.66, -0.36, 0.56);
  ctx.fill();
  ctx.fillStyle = '#fff';
  for (let i = -3; i <= 3; i += 1) {
    const x = i * 0.1;
    const top = 0.6 + Math.abs(i) * -0.012;
    ctx.beginPath();
    ctx.moveTo(x - 0.045, top);
    ctx.lineTo(x + 0.045, top);
    ctx.lineTo(x, top + 0.09);
    ctx.closePath();
    ctx.fill();
  }
};

HEADS.roaringknight = (ctx) => {
  // A pitch-black silhouette on a pale disc, like its sprite: spiked
  // shoulders flaring out to the sides, a wide flat helm narrowing to a point
  // at the chin, two branching antlers standing straight up from its corners,
  // and a jagged white V across the bottom of the helm for its visor.
  const BLACK = '#030305';
  const EDGE = '#030305';
  // Black on pale, like its sprite, so the silhouette reads on the dark box.
  circle(ctx, 0, 0, 1.0, '#e4e6ee');
  const outline = (draw, width = 0.06) => {
    draw();
    ctx.fillStyle = BLACK;
    ctx.fill();
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = width;
    ctx.lineJoin = 'miter';
    ctx.stroke();
  };
  const shape = (points) => () => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };

  // Shoulders and the body under the helm.
  outline(shape([[0, 0.12], [0.5, 0.12], [0.98, 0.0], [0.6, 0.3], [0.4, 0.42], [0.18, 0.7], [0.0, 0.98],
    [-0.18, 0.7], [-0.4, 0.42], [-0.6, 0.3], [-0.98, 0.0], [-0.5, 0.12]]));

  // Antlers: a stem up from each corner, a branch out to the side, a fork on top.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 0.36, -0.38);
    ctx.lineTo(side * 0.38, -0.9);
    ctx.moveTo(side * 0.37, -0.66);
    ctx.lineTo(side * 0.62, -0.78);
    ctx.lineTo(side * 0.64, -0.9);
    ctx.moveTo(side * 0.38, -0.84);
    ctx.lineTo(side * 0.24, -0.96);
    ctx.moveTo(side * 0.38, -0.84);
    ctx.lineTo(side * 0.5, -0.98);
    ctx.lineCap = 'square';
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = 0.14;
    ctx.stroke();
  }

  // The helm: wide and flat on top with a little crest, flaring at the sides,
  // narrowing to a point at the chin.
  outline(shape([[-0.42, -0.42], [-0.14, -0.46], [0, -0.58], [0.14, -0.46], [0.42, -0.42], [0.56, -0.2],
    [0.44, -0.04], [0.2, 0.14], [0, 0.34], [-0.2, 0.14], [-0.44, -0.04], [-0.56, -0.2]]));

  // The visor: a ragged white V along the bottom of the helm.
  ctx.beginPath();
  ctx.moveTo(-0.36, 0.0);
  ctx.lineTo(-0.27, 0.04); ctx.lineTo(-0.22, 0.0); ctx.lineTo(-0.12, 0.1); ctx.lineTo(-0.06, 0.08);
  ctx.lineTo(0, 0.18);
  ctx.lineTo(0.06, 0.08); ctx.lineTo(0.12, 0.1); ctx.lineTo(0.22, 0.0); ctx.lineTo(0.27, 0.04);
  ctx.lineTo(0.36, 0.0);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 0.05;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
};

HEADS['roaringknight-half'] = (ctx) => {
  // Half health: it opens up. Two thick horns curve up and out from a white
  // face crowned in jagged black; spikes fan out to either side like a mane;
  // in the middle of its chest a single white eye with a slit pupil; heavy
  // flame-topped shoulders hang below; and under the eye, a thick black ring
  // shaped like a drop, hollow inside.
  const BLACK = '#030305';
  const WHITE = '#e4e6ee';
  circle(ctx, 0, 0, 1.0, WHITE);
  const fill = (points, colour = BLACK) => poly(ctx, points, colour);
  const both = (points, colour) => { fill(points, colour); fill(points.map(([x, y]) => [-x, y]), colour); };

  // Arms: from the shoulders under the mane, angling out and down...
  both([[-0.1, -0.08], [-0.12, 0.08], [-0.36, 0.19], [-0.58, 0.34], [-0.66, 0.1], [-0.42, -0.02], [-0.22, -0.07]]);
  // ...to big clawed hands, spiky on top like flames, coming to a point below.
  both([[-0.52, 0.12], [-0.58, -0.02], [-0.66, 0.06], [-0.74, -0.1], [-0.82, 0.06], [-0.9, -0.06], [-0.92, 0.1],
    [-0.99, 0.08], [-0.96, 0.26], [-0.86, 0.36], [-0.74, 0.42], [-0.64, 0.54], [-0.56, 0.38], [-0.52, 0.24]]);
  // A white gap between the arms and the mane above, so the arms read as arms.
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 0.035;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 0.22, -0.09);
    ctx.lineTo(side * 0.6, 0.02);
    ctx.stroke();
  }

  // The body between them, from under the eye down into the legs.
  fill([[-0.14, -0.14], [0.14, -0.14], [0.16, 0.04], [0.22, 0.16], [-0.22, 0.16], [-0.16, 0.04]]);

  // The mane: a thick band of spikes fanning straight out to the sides.
  both([[-0.08, -0.46], [-0.5, -0.52], [-0.44, -0.44], [-0.98, -0.46], [-0.6, -0.36], [-0.99, -0.3],
    [-0.62, -0.24], [-0.96, -0.14], [-0.56, -0.12], [-0.74, -0.02], [-0.3, -0.08], [-0.08, -0.1]]);
  // Thin white streaks through it.
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 0.022;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 0.28, -0.38); ctx.lineTo(side * 0.78, -0.4);
    ctx.moveTo(side * 0.32, -0.28); ctx.lineTo(side * 0.84, -0.27);
    ctx.moveTo(side * 0.3, -0.17); ctx.lineTo(side * 0.7, -0.14);
    ctx.stroke();
  }

  // Legs: two thick black legs curving down from the hips, kept clear of the
  // arms. They do not meet: the left sweeps all the way down to a point, the
  // right stops short of it.
  fill([[-0.24, 0.12], [-0.06, 0.12], [-0.16, 0.24], [-0.27, 0.36], [-0.28, 0.5], [-0.18, 0.66], [-0.04, 0.8],
    [0.04, 0.88], [0.02, 0.99], [-0.04, 0.99], [-0.12, 0.88], [-0.28, 0.76], [-0.42, 0.6], [-0.46, 0.44], [-0.4, 0.28]]);
  fill([[0.06, 0.12], [0.24, 0.12], [0.4, 0.28], [0.44, 0.46], [0.38, 0.6], [0.26, 0.72], [0.2, 0.74],
    [0.24, 0.62], [0.32, 0.48], [0.32, 0.36], [0.22, 0.26], [0.1, 0.22]]);
  // White between each arm and the leg below it.
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 0.04;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 0.24, 0.16);
    ctx.lineTo(side * 0.54, 0.38);
    ctx.stroke();
  }
  // A spur on the inside of the right leg.
  fill([[0.31, 0.38], [0.2, 0.36], [0.28, 0.46]]);

  // The eye in its chest: white, with a black slit pupil.
  ctx.beginPath();
  ctx.ellipse(0, -0.22, 0.12, 0.1, 0, 0, TAU);
  ctx.fillStyle = WHITE;
  ctx.fill();
  ctx.strokeStyle = BLACK;
  ctx.lineWidth = 0.05;
  ctx.stroke();
  fill([[0, -0.3], [0.035, -0.22], [0, -0.14], [-0.035, -0.22]]);

  // Horns: thick, curving up and out from the sides of the head to sharp tips,
  // each with a small notch on the inside.
  both([[-0.2, -0.42], [-0.4, -0.5], [-0.52, -0.66], [-0.56, -0.8], [-0.48, -0.95], [-0.44, -0.8],
    [-0.38, -0.7], [-0.3, -0.78], [-0.3, -0.66], [-0.16, -0.6]]);

  // The face: white, ringed in black, with a jagged black crown along the top.
  ctx.beginPath();
  ctx.ellipse(0, -0.56, 0.2, 0.17, 0, 0, TAU);
  ctx.fillStyle = WHITE;
  ctx.fill();
  ctx.strokeStyle = BLACK;
  ctx.lineWidth = 0.1;
  ctx.stroke();
  fill([[-0.24, -0.6], [-0.2, -0.74], [-0.14, -0.66], [-0.08, -0.8], [-0.02, -0.68], [0.04, -0.82], [0.1, -0.68],
    [0.16, -0.78], [0.2, -0.66], [0.24, -0.6], [0.16, -0.68], [0.0, -0.72], [-0.16, -0.68]]);
  // Ragged black along its jaw, falling into the mane.
  fill([[-0.2, -0.42], [-0.12, -0.36], [-0.06, -0.42], [0.0, -0.34], [0.06, -0.42], [0.12, -0.36], [0.2, -0.42], [0.12, -0.3], [-0.12, -0.3]]);
};

HEADS.toriel = (ctx) => {
  // A white goat mother: long ears hanging down either side, small horns,
  // a soft muzzle, red eyes - and her purple robe with the Delta Rune.
  ctx.fillStyle = '#7a4ab8';
  ctx.beginPath();
  ctx.ellipse(0, 0.95, 0.85, 0.28, 0, Math.PI, TAU);
  ctx.fill();
  poly(ctx, [[-0.12, 0.74], [0.12, 0.74], [0.0, 0.88]], '#fff');
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#eee6d2';
    ctx.beginPath();
    ctx.ellipse(side * 0.66, 0.34, 0.16, 0.44, side * -0.12, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#c9bfa6';
    ctx.lineWidth = 0.04;
    ctx.stroke();
  }
  poly(ctx, [[-0.3, -0.42], [-0.44, -0.82], [-0.16, -0.5]], '#f4ecd8');
  poly(ctx, [[0.3, -0.42], [0.44, -0.82], [0.16, -0.5]], '#f4ecd8');
  // Head, longer than it is wide, coming down into a muzzle.
  ctx.fillStyle = '#fbf8f0';
  ctx.beginPath();
  ctx.moveTo(-0.5, -0.1);
  ctx.quadraticCurveTo(-0.55, -0.6, 0, -0.62);
  ctx.quadraticCurveTo(0.55, -0.6, 0.5, -0.1);
  ctx.quadraticCurveTo(0.5, 0.42, 0.32, 0.62);
  ctx.quadraticCurveTo(0, 0.78, -0.32, 0.62);
  ctx.quadraticCurveTo(-0.5, 0.42, -0.5, -0.1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#d8cfb8';
  ctx.lineWidth = 0.04;
  ctx.stroke();
  for (const side of [-1, 1]) {
    circle(ctx, side * 0.22, 0.02, 0.085, '#fff');
    circle(ctx, side * 0.22, 0.03, 0.055, '#c01a24');
  }
  // Snout, nose and a gentle smile.
  ctx.fillStyle = '#f0e9dc';
  ctx.beginPath();
  ctx.ellipse(0, 0.42, 0.26, 0.18, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#b88a90';
  ctx.beginPath();
  ctx.ellipse(0, 0.33, 0.07, 0.045, 0, 0, TAU);
  ctx.fill();
  mouth(ctx, 0.5, 0.12, '#6a4a3a');
};

export function drawHead(ctx, id, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r, r);
  const draw = HEADS[id];
  if (draw) draw(ctx);
  else circle(ctx, 0, 0, 0.8, '#888');
  ctx.restore();
}
