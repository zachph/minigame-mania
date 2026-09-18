import { TAU, clamp, roundedRect } from '../../core/utils.js';
import { GRID, START_LIVES, WAVE_COUNT } from './content.js';
import { PATH, pointAt } from './rules.js';

/** The map, the road, everything standing on it, and the strip along the top. */
const ROAD_WIDTH = 30;

export const cellOf = (x, y) => ({
  col: Math.floor(x / GRID.cell),
  row: Math.floor((y - GRID.top) / GRID.cell),
});

export const cellCentre = (col, row) => ({
  x: col * GRID.cell + GRID.cell / 2,
  y: GRID.top + row * GRID.cell + GRID.cell / 2,
});

export function drawGround(ctx, width, height, time) {
  const ground = ctx.createLinearGradient(0, 0, 0, height);
  ground.addColorStop(0, '#20301f');
  ground.addColorStop(1, '#16241a');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, width, height);

  // Buildable ground reads as a faint lattice.
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#9fd8a8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let col = 0; col <= GRID.cols; col += 1) {
    ctx.moveTo(col * GRID.cell, GRID.top);
    ctx.lineTo(col * GRID.cell, GRID.top + GRID.rows * GRID.cell);
  }
  for (let row = 0; row <= GRID.rows; row += 1) {
    ctx.moveTo(0, GRID.top + row * GRID.cell);
    ctx.lineTo(GRID.cols * GRID.cell, GRID.top + row * GRID.cell);
  }
  ctx.stroke();
  ctx.restore();
  void time;
}

export function drawRoad(ctx) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(PATH.points[0].x, PATH.points[0].y);
    for (const point of PATH.points.slice(1)) ctx.lineTo(point.x, point.y);
  };
  ctx.strokeStyle = '#2c2519';
  ctx.lineWidth = ROAD_WIDTH + 8;
  trace();
  ctx.stroke();
  ctx.strokeStyle = '#6b5a3c';
  ctx.lineWidth = ROAD_WIDTH;
  trace();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 233, 180, 0.25)';
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 13]);
  trace();
  ctx.stroke();
  ctx.setLineDash([]);

  // Where they come in, and what they are walking towards.
  const start = PATH.points[0];
  const end = PATH.points[PATH.points.length - 1];
  ctx.fillStyle = 'rgba(255, 120, 120, 0.85)';
  ctx.beginPath();
  ctx.arc(start.x + 8, start.y, 9, 0, TAU);
  ctx.fill();

  ctx.fillStyle = '#7fd4ff';
  roundedRect(ctx, end.x - 20, end.y - 28, 44, 56, 8);
  ctx.fill();
  ctx.fillStyle = '#3aa0d8';
  roundedRect(ctx, end.x - 14, end.y - 22, 32, 20, 4);
  ctx.fill();
  ctx.fillStyle = '#123044';
  ctx.font = '700 11px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BASE', end.x + 2, end.y + 12);
  ctx.restore();
}

/**
 * Flame Road: the whole track alight. Drawn over the road and under everything
 * that walks on it, so it reads as the ground burning rather than an effect on
 * any one enemy.
 */
export function drawRoadFire(ctx, time, fade = 1) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(PATH.points[0].x, PATH.points[0].y);
    for (const point of PATH.points.slice(1)) ctx.lineTo(point.x, point.y);
  };

  const flicker = 0.75 + 0.25 * Math.sin(time * 11);
  ctx.globalAlpha = clamp(fade, 0, 1);
  ctx.strokeStyle = `rgba(122, 31, 12, ${0.55 * flicker})`;
  ctx.lineWidth = ROAD_WIDTH;
  trace();
  ctx.stroke();
  ctx.strokeStyle = `rgba(255, 138, 61, ${0.45 * flicker})`;
  ctx.lineWidth = ROAD_WIDTH - 10;
  trace();
  ctx.stroke();

  // Tongues of flame licking along the length of it.
  ctx.globalAlpha = clamp(fade, 0, 1) * 0.85;
  for (let d = 0; d < PATH.length; d += 26) {
    const p = pointAt(d + ((time * 60) % 26));
    const lift = 7 + 5 * Math.sin(time * 9 + d * 0.13);
    ctx.fillStyle = d % 52 === 0 ? '#ffd166' : '#ff8a3d';
    ctx.beginPath();
    ctx.moveTo(p.x - 4, p.y + 4);
    ctx.quadraticCurveTo(p.x, p.y - lift, p.x + 4, p.y + 4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/* ----------------------------------------------------------------- towers */

export function drawTower(ctx, tower, options = {}, time = 0) {
  const spec = tower.spec;
  const { x, y } = tower;
  const stunned = tower.stunUntil > time;
  ctx.save();
  if (stunned) ctx.globalAlpha = 0.45;

  if (options.showRange && spec.range > 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.beginPath();
    ctx.arc(x, y, spec.range, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + 12, 15, 6, 0, 0, TAU);
  ctx.fill();

  drawTowerShape(ctx, spec, x, y, 1, tower.angle || 0);

  if (spec.onRoad && tower.maxHp > 0) {
    const ratio = clamp(tower.hp / tower.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    roundedRect(ctx, x - 16, y - 22, 32, 5, 2.5);
    ctx.fill();
    ctx.fillStyle = ratio > 0.4 ? '#9be8a8' : '#ff8b6b';
    roundedRect(ctx, x - 16, y - 22, Math.max(2, 32 * ratio), 5, 2.5);
    ctx.fill();
  }
  if (stunned) {
    // Broken arcs jittering over the top: the lights are out.
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffe07a';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * TAU + time * 6;
      ctx.beginPath();
      ctx.arc(x, y - 2, 17, angle, angle + 0.8);
      ctx.stroke();
    }
  }
  if (options.selected) {
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2.5;
    roundedRect(ctx, x - 19, y - 19, 38, 38, 8);
    ctx.stroke();
  }
  ctx.restore();
}

/** A silhouette per defender, so ten towers do not look like ten boxes. */
export function drawTowerShape(ctx, spec, x, y, scale = 1, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = 'rgba(8, 12, 10, 0.8)';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.fillStyle = spec.dark;

  // Every defender stands on the same little plinth.
  ctx.beginPath();
  ctx.arc(0, 6, 13, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = spec.color;

  switch (spec.shape) {
    case 'pylon':
      ctx.beginPath();
      ctx.moveTo(0, -18); ctx.lineTo(7, 4); ctx.lineTo(-7, 4); ctx.closePath();
      ctx.fill(); ctx.stroke();
      break;
    case 'spire':
      ctx.beginPath();
      ctx.moveTo(0, -20); ctx.lineTo(6, -2); ctx.lineTo(0, 5); ctx.lineTo(-6, -2); ctx.closePath();
      ctx.fill(); ctx.stroke();
      break;
    case 'lance':
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(-6, -5); ctx.lineTo(20, -2); ctx.lineTo(20, 2); ctx.lineTo(-6, 5); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, TAU);
      ctx.fill(); ctx.stroke();
      break;
    case 'mortar':
      ctx.save();
      ctx.rotate(angle - 0.5);
      ctx.beginPath();
      roundedRect(ctx, -4, -18, 9, 20, 3);
      ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(0, 2, 9, 0, TAU);
      ctx.fill(); ctx.stroke();
      break;
    case 'coil':
      ctx.lineWidth = 3;
      ctx.strokeStyle = spec.color;
      ctx.beginPath();
      for (let i = 0; i < 3; i += 1) ctx.arc(0, -4 - i * 5, 8 - i * 2, 0, Math.PI, true);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(8, 12, 10, 0.8)';
      ctx.lineWidth = 2;
      break;
    case 'wall':
      ctx.beginPath();
      roundedRect(ctx, -16, -14, 32, 24, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = spec.dark;
      ctx.fillRect(-16, -6, 32, 3);
      ctx.fillRect(-2, -14, 4, 24);
      break;
    case 'claw':
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(dir * 3, 2);
        ctx.quadraticCurveTo(dir * 14, -6, dir * 9, -18);
        ctx.quadraticCurveTo(dir * 8, -6, dir * 1, -2);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
      break;
    case 'tree': {
      ctx.fillStyle = spec.dark;
      ctx.beginPath();
      roundedRect(ctx, -3, -6, 6, 14, 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = spec.color;
      for (const [cx, cy, r] of [[0, -14, 9], [-7, -7, 7], [7, -7, 7]]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = '#ffd166';   // the coins it is heavy with
      for (const [cx, cy] of [[-6, -10], [5, -12], [0, -4]]) {
        ctx.beginPath();
        ctx.arc(cx, cy, 2.6, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'glide': {
      // Three blades of ice fanned out around a cold core.
      for (const dir of [-1, 0, 1]) {
        ctx.save();
        ctx.rotate(dir * 0.7);
        ctx.beginPath();
        ctx.moveTo(0, 2); ctx.lineTo(4, -8); ctx.lineTo(0, -20); ctx.lineTo(-4, -8); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = spec.dark;
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, TAU);
      ctx.fill(); ctx.stroke();
      break;
    }
    default: // night
      ctx.beginPath();
      ctx.arc(0, -6, 11, 0.35 * Math.PI, 1.75 * Math.PI);
      ctx.arc(4, -10, 9, 1.75 * Math.PI, 0.35 * Math.PI, true);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      break;
  }
  ctx.restore();
}

/* ---------------------------------------------------------------- enemies */

export function drawEnemy(ctx, enemy, time) {
  const spec = enemy.spec;
  const slowed = enemy.slowUntil > time;
  const snared = enemy.snareUntil > time;
  const frozen = enemy.freezeUntil > time;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(enemy.x, enemy.y + spec.size * 0.7, spec.size * 0.8, spec.size * 0.35, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = frozen ? '#e6f7ff' : slowed ? '#bfe9ff' : spec.color;
  ctx.strokeStyle = frozen ? '#8fd8ff' : snared ? '#8ce6a8' : spec.dark;
  ctx.lineWidth = snared || frozen ? 3 : 2;
  ctx.beginPath();
  if (spec.flameRoad) {
    // A ragged flame, taller than it is wide, guttering as it walks.
    const r = spec.size;
    const gutter = 1 + 0.12 * Math.sin(time * 8 + enemy.uid);
    ctx.moveTo(enemy.x, enemy.y + r * 0.9);
    ctx.quadraticCurveTo(enemy.x - r, enemy.y + r * 0.2, enemy.x - r * 0.45, enemy.y - r * 0.5);
    ctx.quadraticCurveTo(enemy.x - r * 0.6, enemy.y - r * 0.2, enemy.x - r * 0.1, enemy.y - r * 1.2 * gutter);
    ctx.quadraticCurveTo(enemy.x + r * 0.25, enemy.y - r * 0.55, enemy.x + r * 0.55, enemy.y - r * 1.05 * gutter);
    ctx.quadraticCurveTo(enemy.x + r, enemy.y + r * 0.1, enemy.x, enemy.y + r * 0.9);
    ctx.closePath();
  } else if (spec.stun) {
    const r = spec.size;
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * TAU + 0.35;
      ctx.lineTo(enemy.x + Math.cos(angle) * r, enemy.y + Math.sin(angle) * r);
    }
    ctx.closePath();
  } else if (spec.boss) {
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * TAU - Math.PI / 2;
      const r = spec.size * (i % 2 === 0 ? 1 : 0.78);
      ctx.lineTo(enemy.x + Math.cos(angle) * r, enemy.y + Math.sin(angle) * r);
    }
    ctx.closePath();
  } else {
    ctx.arc(enemy.x, enemy.y, spec.size, 0, TAU);
  }
  ctx.fill();
  ctx.stroke();

  if (spec.flameRoad) {
    // Two hollow eyes, so it reads as a skull inside the fire.
    ctx.fillStyle = '#2a0c04';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(enemy.x + dir * spec.size * 0.24, enemy.y - spec.size * 0.1, 2.6, 3.4, 0, 0, TAU);
      ctx.fill();
    }
  }
  if (spec.stun) {
    // A crack across the stone, and the reach it can put a tower out from.
    ctx.strokeStyle = 'rgba(30, 26, 18, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(enemy.x - spec.size * 0.5, enemy.y - spec.size * 0.4);
    ctx.lineTo(enemy.x + spec.size * 0.1, enemy.y);
    ctx.lineTo(enemy.x - spec.size * 0.2, enemy.y + spec.size * 0.5);
    ctx.stroke();
    ctx.strokeStyle = `rgba(201, 194, 168, ${0.12 + 0.06 * Math.sin(time * 3)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, spec.stun.range, 0, TAU);
    ctx.stroke();
  }
  if (spec.armour) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, spec.size + 3, -0.8, 0.8);
    ctx.stroke();
  }
  if (frozen) {
    ctx.strokeStyle = 'rgba(190, 236, 255, 0.85)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * TAU + time * 0.8;
      const r = spec.size + 4;
      ctx.beginPath();
      ctx.moveTo(enemy.x + Math.cos(angle) * r * 0.5, enemy.y + Math.sin(angle) * r * 0.5);
      ctx.lineTo(enemy.x + Math.cos(angle) * r, enemy.y + Math.sin(angle) * r);
      ctx.stroke();
    }
  }
  if (enemy.dread.length > 0) {
    ctx.fillStyle = `rgba(169, 139, 255, ${0.25 + enemy.dread.length * 0.18})`;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, spec.size + 5, 0, TAU);
    ctx.fill();
  }

  const ratio = clamp(enemy.hp / enemy.maxHp, 0, 1);
  if (ratio < 1) {
    const width = spec.size * 2.2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    roundedRect(ctx, enemy.x - width / 2, enemy.y - spec.size - 9, width, 4, 2);
    ctx.fill();
    ctx.fillStyle = ratio > 0.5 ? '#8ef0a8' : ratio > 0.25 ? '#ffd166' : '#ff6b6b';
    roundedRect(ctx, enemy.x - width / 2, enemy.y - spec.size - 9, Math.max(1, width * ratio), 4, 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawShots(ctx, state) {
  ctx.save();
  for (const beam of state.beams) {
    ctx.globalAlpha = clamp(beam.life / beam.maxLife, 0, 1);
    ctx.strokeStyle = beam.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(beam.x1, beam.y1);
    ctx.lineTo(beam.x2, beam.y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const shell of state.shells) {
    const lift = Math.sin(Math.PI * shell.t) * 18;
    ctx.fillStyle = '#ffb066';
    ctx.beginPath();
    ctx.arc(shell.x, shell.y - lift, 5, 0, TAU);
    ctx.fill();
  }
  for (const mark of state.hits) {
    const life = clamp(mark.life / mark.maxLife, 0, 1);
    ctx.globalAlpha = life * 0.7;
    ctx.strokeStyle = mark.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(mark.x, mark.y, mark.size * (1.4 - life), 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/* -------------------------------------------------------------------- hud */

export function drawHud(ctx, state, width) {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 14, 10, 0.8)';
  ctx.fillRect(0, 0, width, GRID.top);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = '700 15px "Trebuchet MS", system-ui, sans-serif';

  ctx.fillStyle = state.lives > START_LIVES * 0.35 ? '#8ef0a8' : '#ff8b8b';
  ctx.fillText(`${Math.max(0, state.lives)} lives`, 16, GRID.top / 2);

  ctx.fillStyle = '#ffd166';
  ctx.fillText(`${state.gold} gold`, 116, GRID.top / 2);

  ctx.fillStyle = '#e8f2e8';
  ctx.fillText(`Wave ${Math.max(1, state.waveIndex)} / ${WAVE_COUNT}`, 226, GRID.top / 2);

  const next = Math.max(0, state.waveTimer);
  ctx.fillStyle = next < 4 ? '#ffb3b3' : 'rgba(232, 242, 232, 0.7)';
  ctx.font = '600 13px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillText(
    state.waveIndex >= WAVE_COUNT ? 'last wave - hold the line' : `next wave in ${next.toFixed(0)}s`,
    340, GRID.top / 2
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(232, 242, 232, 0.72)';
  ctx.fillText(`${state.enemies.length} on the road   ${state.stats.kills} down`, width - 16, GRID.top / 2);
  ctx.restore();
}

/** The cell under the cursor while a defender is picked up. */
export function drawPlacement(ctx, spec, col, row, allowed) {
  const { x, y } = cellCentre(col, row);
  ctx.save();
  ctx.globalAlpha = 0.85;
  if (spec.range > 0) {
    ctx.fillStyle = allowed ? 'rgba(140, 230, 168, 0.10)' : 'rgba(255, 120, 120, 0.10)';
    ctx.beginPath();
    ctx.arc(x, y, spec.range, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = allowed ? 'rgba(140, 230, 168, 0.6)' : 'rgba(255, 120, 120, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.fillStyle = allowed ? 'rgba(140, 230, 168, 0.25)' : 'rgba(255, 120, 120, 0.25)';
  roundedRect(ctx, x - GRID.cell / 2 + 2, y - GRID.cell / 2 + 2, GRID.cell - 4, GRID.cell - 4, 6);
  ctx.fill();
  ctx.globalAlpha = allowed ? 0.9 : 0.4;
  drawTowerShape(ctx, spec, x, y, 0.9, 0);
  ctx.restore();
}

export function drawBanner(ctx, width, text, subtext, alpha) {
  if (!text || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 42px "Trebuchet MS", system-ui, sans-serif';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(6, 12, 8, 0.85)';
  ctx.strokeText(text, width / 2, 190);
  ctx.fillStyle = '#ffd166';
  ctx.fillText(text, width / 2, 190);
  if (subtext) {
    ctx.font = '600 17px "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeText(subtext, width / 2, 226);
    ctx.fillStyle = '#e8f2e8';
    ctx.fillText(subtext, width / 2, 226);
  }
  ctx.restore();
}
