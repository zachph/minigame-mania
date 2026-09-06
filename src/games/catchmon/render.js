import { TAU, clamp, formatTime, roundedRect } from '../../core/utils.js';
import { FIELD, THROW_ORIGIN, depthScale } from './constants.js';

const W = 960;
const H = 540;

/* ------------------------------------------------------------------ scene */

export function drawBackground(ctx, decor, time) {
  const sky = ctx.createLinearGradient(0, 0, 0, FIELD.top + 40);
  sky.addColorStop(0, '#6fc7ff');
  sky.addColorStop(1, '#cdeeff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, FIELD.top + 40);

  // Distant hills: hazier and bluer the further back they sit
  ctx.fillStyle = '#7aa9a0';
  hill(ctx, 190, FIELD.top + 22, 320, 130);
  hill(ctx, 620, FIELD.top + 16, 400, 160);
  ctx.fillStyle = '#5d9273';
  hill(ctx, 400, FIELD.top + 32, 340, 110);
  hill(ctx, 880, FIELD.top + 28, 300, 130);

  // Treeline along the horizon
  ctx.fillStyle = '#35704a';
  for (let x = -10; x < W + 20; x += 26) {
    const height = 16 + ((x * 7919) % 11);
    ctx.beginPath();
    ctx.ellipse(x, FIELD.top + 12, 17, height, 0, Math.PI, TAU);
    ctx.fill();
  }

  const grass = ctx.createLinearGradient(0, FIELD.top, 0, H);
  grass.addColorStop(0, '#57a75f');
  grass.addColorStop(0.55, '#469252');
  grass.addColorStop(1, '#357a46');
  ctx.fillStyle = grass;
  ctx.fillRect(0, FIELD.top + 10, W, H - FIELD.top - 10);

  for (const item of decor) {
    if (item.type === 'bush') drawBush(ctx, item);
    else drawFlower(ctx, item, time);
  }
}

function hill(ctx, x, y, width, height) {
  ctx.beginPath();
  ctx.ellipse(x, y, width / 2, height / 2, 0, Math.PI, TAU);
  ctx.fill();
}

function drawBush(ctx, item) {
  const s = item.scale;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
  ctx.beginPath();
  ctx.ellipse(item.x, item.y + 6 * s, 26 * s, 7 * s, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#3f8f4d';
  for (const [dx, dy, r] of [[-14, 2, 15], [14, 2, 15], [0, -6, 19]]) {
    ctx.beginPath();
    ctx.arc(item.x + dx * s, item.y + dy * s, r * s, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#56a862';
  ctx.beginPath();
  ctx.arc(item.x - 4 * s, item.y - 10 * s, 11 * s, 0, TAU);
  ctx.fill();
}

function drawFlower(ctx, item, time) {
  const sway = Math.sin(time * 1.6 + item.x * 0.05) * 1.6;
  ctx.strokeStyle = '#3c8a45';
  ctx.lineWidth = 2 * item.scale;
  ctx.beginPath();
  ctx.moveTo(item.x, item.y);
  ctx.lineTo(item.x + sway, item.y - 12 * item.scale);
  ctx.stroke();
  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.arc(item.x + sway, item.y - 14 * item.scale, 4 * item.scale, 0, TAU);
  ctx.fill();
}

/** The trainer the balls are thrown from. */
export function drawTrainer(ctx, chargeAmount, time) {
  const bob = Math.sin(time * 2.2) * 1.5;
  const x = THROW_ORIGIN.x;
  const y = THROW_ORIGIN.y + bob;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y + 6, 44, 9, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = '#2f3a63';
  roundedRect(ctx, x - 28, y - 44, 56, 52, 16);
  ctx.fill();

  ctx.fillStyle = '#f0c9a0';
  ctx.beginPath();
  ctx.arc(x, y - 54, 20, 0, TAU);
  ctx.fill();

  ctx.fillStyle = '#e0453f';
  ctx.beginPath();
  ctx.arc(x, y - 60, 21, Math.PI, TAU);
  ctx.fill();
  ctx.fillRect(x - 21, y - 61, 42, 5);

  // Throwing arm, raised further the longer the throw is charged
  const armAngle = -0.5 - chargeAmount * 0.9;
  ctx.save();
  ctx.translate(x + 22, y - 34);
  ctx.rotate(armAngle);
  ctx.fillStyle = '#f0c9a0';
  roundedRect(ctx, 0, -6, 30, 12, 6);
  ctx.fill();
  drawBallShape(ctx, 32, 0, 9, time * 3);
  ctx.restore();
}

/* -------------------------------------------------------------------- mon */

export function drawMon(ctx, mon, time) {
  const scale = depthScale(mon.y) * mon.scale;
  if (scale <= 0.01 || mon.alpha <= 0.01) return;
  const { species } = mon;
  const bounce = Math.abs(Math.sin(mon.walkPhase)) * 4 * scale;
  const x = mon.x;
  const y = mon.y - bounce;
  const r = species.radius * scale;

  ctx.save();
  ctx.globalAlpha = mon.alpha;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(mon.x, mon.y + 4 * scale, r * 0.9, r * 0.32, 0, 0, TAU);
  ctx.fill();

  if (species.rarity >= 4) {
    const glow = 0.25 + 0.15 * Math.sin(time * 4 + mon.seed);
    ctx.save();
    ctx.globalAlpha = mon.alpha * glow;
    ctx.fillStyle = species.color;
    ctx.beginPath();
    ctx.arc(x, y - r * 0.2, r * 1.7, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(x, y - r * 0.2);
  ctx.rotate(mon.tilt);
  drawCrest(ctx, species, r, time, mon.seed);

  // Body
  ctx.fillStyle = species.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.92, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(24, 26, 40, 0.85)';
  ctx.lineWidth = Math.max(2, r * 0.11);
  ctx.stroke();

  ctx.fillStyle = species.belly;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.28, r * 0.55, r * 0.42, 0, 0, TAU);
  ctx.fill();

  drawFace(ctx, mon, r, time);
  ctx.restore();
  ctx.restore();
}

function drawCrest(ctx, species, r, time, seed) {
  ctx.fillStyle = species.accent;
  switch (species.crest) {
    case 'leaf': {
      ctx.save();
      ctx.rotate(Math.sin(time * 2 + seed) * 0.12);
      ctx.beginPath();
      ctx.ellipse(0, -r * 1.25, r * 0.28, r * 0.55, 0.35, 0, TAU);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'flame': {
      const flicker = 1 + Math.sin(time * 9 + seed) * 0.12;
      ctx.beginPath();
      ctx.moveTo(0, -r * (1.75 * flicker));
      ctx.quadraticCurveTo(r * 0.5, -r * 1.0, 0, -r * 0.82);
      ctx.quadraticCurveTo(-r * 0.5, -r * 1.0, 0, -r * (1.75 * flicker));
      ctx.fill();
      break;
    }
    case 'drop': {
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.6);
      ctx.quadraticCurveTo(r * 0.34, -r * 1.0, 0, -r * 0.86);
      ctx.quadraticCurveTo(-r * 0.34, -r * 1.0, 0, -r * 1.6);
      ctx.fill();
      break;
    }
    case 'bolt': {
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, -r * 1.7);
      ctx.lineTo(r * 0.42, -r * 1.0);
      ctx.lineTo(r * 0.1, -r * 1.0);
      ctx.lineTo(r * 0.36, -r * 0.4);
      ctx.lineTo(-r * 0.3, -r * 1.05);
      ctx.lineTo(0, -r * 1.05);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'horns': {
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(dir * r * 0.45, -r * 0.72);
        ctx.quadraticCurveTo(dir * r * 1.05, -r * 1.4, dir * r * 0.5, -r * 1.55);
        ctx.quadraticCurveTo(dir * r * 0.7, -r * 1.1, dir * r * 0.28, -r * 0.8);
        ctx.fill();
      }
      break;
    }
    case 'star': {
      ctx.save();
      ctx.translate(0, -r * 1.35);
      ctx.rotate(time * 1.6 + seed);
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const radius = i % 2 === 0 ? r * 0.5 : r * 0.2;
        const angle = (i / 10) * TAU - Math.PI / 2;
        ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    default:
      break;
  }
}

function drawFace(ctx, mon, r, time) {
  const blink = Math.sin(time * 1.4 + mon.seed * 3) > 0.97;
  const eyeY = -r * 0.12;
  const eyeX = r * 0.35;
  const scared = mon.state === 'flee';

  for (const dir of [-1, 1]) {
    if (blink) {
      ctx.strokeStyle = '#1b1b28';
      ctx.lineWidth = Math.max(1.4, r * 0.08);
      ctx.beginPath();
      ctx.moveTo(dir * eyeX - r * 0.14, eyeY);
      ctx.lineTo(dir * eyeX + r * 0.14, eyeY);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(dir * eyeX, eyeY, r * 0.19, r * 0.23, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1b1b28';
    ctx.beginPath();
    ctx.arc(dir * eyeX + mon.lookX * r * 0.06, eyeY + (scared ? -r * 0.03 : 0), r * (scared ? 0.07 : 0.1), 0, TAU);
    ctx.fill();
  }

  ctx.strokeStyle = '#1b1b28';
  ctx.lineWidth = Math.max(1.2, r * 0.07);
  ctx.beginPath();
  if (scared) ctx.ellipse(0, r * 0.26, r * 0.12, r * 0.14, 0, 0, TAU);
  else ctx.arc(0, r * 0.14, r * 0.18, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
}

/* ------------------------------------------------------------------- ball */

export function drawBallShape(ctx, x, y, r, spin = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.fillStyle = '#f4f6ff';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e8453c';
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, TAU);
  ctx.fill();
  ctx.strokeStyle = '#1b1b28';
  ctx.lineWidth = Math.max(1.2, r * 0.16);
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#f4f6ff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.34, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.34, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

export function drawBall(ctx, ball) {
  const scale = depthScale(ball.y);
  const r = 11 * scale;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(ball.x, ball.y + 3, r * 0.8, r * 0.3, 0, 0, TAU);
  ctx.fill();

  if (ball.state === 'flight') {
    drawBallShape(ctx, ball.x, ball.y - ball.height, r, ball.spin);
    return;
  }

  const wobble = ball.state === 'wobble' ? Math.sin(ball.wobblePhase * Math.PI * 2) * 0.45 : 0;
  ctx.save();
  ctx.translate(ball.x, ball.y - r * 0.6);
  ctx.rotate(wobble);
  drawBallShape(ctx, 0, 0, r, 0);
  ctx.restore();

  if (ball.state === 'caught') {
    const pulse = 1 - clamp(ball.stateTime / 0.5, 0, 1);
    ctx.strokeStyle = `rgba(255, 226, 122, ${pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y - r * 0.6, r + (1 - pulse) * 40, 0, TAU);
    ctx.stroke();
  }
}

/* -------------------------------------------------------- effects and hud */

export function drawParticles(ctx, particles) {
  for (const p of particles) {
    const life = p.life / p.maxLife;
    ctx.globalAlpha = clamp(life, 0, 1);
    ctx.fillStyle = p.color;
    if (p.shape === 'spark') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillRect(-p.size / 2, -p.size / 6, p.size, p.size / 3);
      ctx.fillRect(-p.size / 6, -p.size / 2, p.size / 3, p.size);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + life * 0.8), 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export function drawFloatingTexts(ctx, texts) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of texts) {
    const life = clamp(t.life / t.maxLife, 0, 1);
    ctx.globalAlpha = life;
    ctx.font = `700 ${t.size}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(20, 22, 40, 0.75)';
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

/** Aim reticle; tints and names the mon underneath it. */
export function drawReticle(ctx, aim, charge, target) {
  const r = 16 + charge * 12;
  const color = target ? target.species.color : '#ffffff';
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(aim.x, aim.y, r, 0, TAU);
  ctx.stroke();

  if (charge > 0) {
    ctx.strokeStyle = '#ffe07a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(aim.x, aim.y, r, -Math.PI / 2, -Math.PI / 2 + charge * TAU);
    ctx.stroke();
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    ctx.beginPath();
    ctx.moveTo(aim.x + dx * (r + 4), aim.y + dy * (r + 4));
    ctx.lineTo(aim.x + dx * (r + 11), aim.y + dy * (r + 11));
    ctx.stroke();
  }

  if (target) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = '700 14px "Trebuchet MS", system-ui, sans-serif';
    const label = `${target.species.name} ${'★'.repeat(target.species.rarity)}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(20, 22, 40, 0.8)';
    ctx.strokeText(label, aim.x, aim.y - r - 14);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, aim.x, aim.y - r - 14);
  }
  ctx.restore();
}

export function drawHud(ctx, state) {
  ctx.save();
  ctx.fillStyle = 'rgba(12, 16, 34, 0.55)';
  roundedRect(ctx, 12, 12, W - 24, 54, 14);
  ctx.fill();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 26px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillText(state.score.toLocaleString(), 28, 39);
  ctx.font = '600 12px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.fillText('SCORE', 28, 57);

  ctx.textAlign = 'center';
  const lowTime = state.timeLeft <= 10;
  ctx.fillStyle = lowTime ? '#ff8f8f' : '#ffffff';
  ctx.font = '700 30px "Trebuchet MS", system-ui, sans-serif';
  const pulse = lowTime ? 1 + Math.sin(state.time * 8) * 0.05 : 1;
  ctx.save();
  ctx.translate(W / 2, 36);
  ctx.scale(pulse, pulse);
  ctx.fillText(formatTime(state.timeLeft), 0, 0);
  ctx.restore();

  // Ball counter
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 24px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillText(`x${state.balls}`, W - 28, 39);
  drawBallShape(ctx, W - 74, 38, 13, 0);

  if (state.streak > 1) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe07a';
    ctx.font = '700 20px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(`x${state.multiplier.toFixed(2).replace(/0$/, '')} streak ${state.streak}`, 130, 39);
  }
  ctx.restore();
}

export function drawRoundIntro(ctx, remaining) {
  const t = clamp(remaining, 0, 1);
  ctx.save();
  ctx.globalAlpha = t;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 54px "Trebuchet MS", system-ui, sans-serif';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(20, 22, 40, 0.7)';
  ctx.strokeText('Catch!', W / 2, H / 2 - 40);
  ctx.fillStyle = '#ffe07a';
  ctx.fillText('Catch!', W / 2, H / 2 - 40);
  ctx.restore();
}
