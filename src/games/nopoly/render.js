import { TAU, clamp, roundedRect } from '../../core/utils.js';
import { BOARD_SIZE, PIECES, SIDES, colOf, rowOf } from './rules.js';

/**
 * Board and piece drawing. Pieces are drawn from code - a farmer under a straw
 * hat, a golem cut from stone, a dragon on the wing - tinted by the side that
 * owns them.
 */

export const BOARD = { x: 54, y: 54, square: 54 };
export const BOARD_PX = BOARD.square * BOARD_SIZE;

const LIGHT_SQUARE = '#c9d0ea';
const DARK_SQUARE = '#5b6699';
const EDGE = '#2b3358';

export const squareCentre = (index) => ({
  x: BOARD.x + colOf(index) * BOARD.square + BOARD.square / 2,
  y: BOARD.y + rowOf(index) * BOARD.square + BOARD.square / 2,
});

/** The square under a canvas point, or null when the point is off the board. */
export function squareAt(x, y) {
  const col = Math.floor((x - BOARD.x) / BOARD.square);
  const row = Math.floor((y - BOARD.y) / BOARD.square);
  if (col < 0 || col >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE) return null;
  return row * BOARD_SIZE + col;
}

export function drawBackdrop(ctx, width, height, time) {
  const sky = ctx.createLinearGradient(0, 0, width, height);
  sky.addColorStop(0, '#161c38');
  sky.addColorStop(1, '#0d1024');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // Slow drifting field furrows behind the board, so the page is not flat black.
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = '#8ea0ff';
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i += 1) {
    const offset = ((time * 8 + i * 46) % (height + 120)) - 60;
    ctx.beginPath();
    ctx.moveTo(0, offset);
    ctx.lineTo(width, offset - 80);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawBoard(ctx, state, view) {
  ctx.save();
  ctx.fillStyle = EDGE;
  roundedRect(ctx, BOARD.x - 10, BOARD.y - 10, BOARD_PX + 20, BOARD_PX + 20, 12);
  ctx.fill();

  for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
    const col = colOf(index);
    const row = rowOf(index);
    ctx.fillStyle = (col + row) % 2 === 0 ? LIGHT_SQUARE : DARK_SQUARE;
    ctx.fillRect(BOARD.x + col * BOARD.square, BOARD.y + row * BOARD.square, BOARD.square, BOARD.square);
  }

  if (state.lastMove) {
    for (const index of [state.lastMove.from, state.lastMove.to]) {
      ctx.fillStyle = 'rgba(255, 209, 102, 0.28)';
      ctx.fillRect(BOARD.x + colOf(index) * BOARD.square, BOARD.y + rowOf(index) * BOARD.square, BOARD.square, BOARD.square);
    }
  }

  drawCoordinates(ctx);
  ctx.restore();
}

function drawCoordinates(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(214, 221, 255, 0.55)';
  ctx.font = '600 12px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < BOARD_SIZE; i += 1) {
    ctx.fillText('abcdefgh'[i], BOARD.x + i * BOARD.square + BOARD.square / 2, BOARD.y + BOARD_PX + 20);
    ctx.fillText(String(BOARD_SIZE - i), BOARD.x - 20, BOARD.y + i * BOARD.square + BOARD.square / 2);
  }
  ctx.restore();
}

/** Selection ring, legal-move dots and capture rings. */
export function drawHints(ctx, { selected, moves, cursor, time }) {
  ctx.save();
  if (selected != null) {
    const { x, y } = squareCentre(selected);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 3;
    roundedRect(ctx, x - BOARD.square / 2 + 3, y - BOARD.square / 2 + 3, BOARD.square - 6, BOARD.square - 6, 8);
    ctx.stroke();
  }

  const pulse = 0.55 + Math.sin(time * 4) * 0.12;
  for (const move of moves) {
    const { x, y } = squareCentre(move.to);
    if (move.captured) {
      ctx.strokeStyle = `rgba(255, 122, 122, ${pulse + 0.2})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, BOARD.square / 2 - 5, 0, TAU);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(255, 245, 214, ${pulse})`;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, TAU);
      ctx.fill();
    }
  }

  if (cursor != null) {
    const { x, y } = squareCentre(cursor);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 2;
    roundedRect(ctx, x - BOARD.square / 2 + 4, y - BOARD.square / 2 + 4, BOARD.square - 8, BOARD.square - 8, 7);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ pieces */

export function drawPiece(ctx, piece, x, y, scale = 1, alpha = 1) {
  const side = SIDES[piece.side];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(10, 12, 26, 0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 18, 17, 6, 0, 0, TAU);
  ctx.fill();

  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(14, 16, 32, 0.9)';
  if (piece.type === 'farmer') drawFarmer(ctx, side);
  else if (piece.type === 'golem') drawGolem(ctx, side);
  else drawDragon(ctx, side);
  ctx.restore();
}

function drawFarmer(ctx, side) {
  // Body
  ctx.fillStyle = side.color;
  ctx.beginPath();
  ctx.moveTo(-11, 17);
  ctx.quadraticCurveTo(-12, -2, -6, -6);
  ctx.lineTo(6, -6);
  ctx.quadraticCurveTo(12, -2, 11, 17);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Head
  ctx.fillStyle = '#f3d3ae';
  ctx.beginPath();
  ctx.arc(0, -11, 7.5, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Straw hat
  ctx.fillStyle = '#f0cf87';
  ctx.beginPath();
  ctx.ellipse(0, -16, 15, 5, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, -20, 7, 5.5, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Band in the side's darker tone
  ctx.fillStyle = side.dark;
  ctx.fillRect(-7, -18, 14, 2.5);

  ctx.fillStyle = '#1b1d31';
  ctx.beginPath();
  ctx.arc(-2.6, -10.5, 1.2, 0, TAU);
  ctx.arc(2.6, -10.5, 1.2, 0, TAU);
  ctx.fill();
}

function drawGolem(ctx, side) {
  // Stone torso
  ctx.fillStyle = side.dark;
  ctx.beginPath();
  ctx.moveTo(-13, 18);
  ctx.lineTo(-15, -4);
  ctx.lineTo(-8, -10);
  ctx.lineTo(8, -10);
  ctx.lineTo(15, -4);
  ctx.lineTo(13, 18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Shoulders
  ctx.fillStyle = side.color;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * 9, -8);
    ctx.lineTo(dir * 18, -2);
    ctx.lineTo(dir * 16, 9);
    ctx.lineTo(dir * 10, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Head block with a glowing core
  ctx.fillStyle = side.color;
  ctx.beginPath();
  ctx.moveTo(-8, -11);
  ctx.lineTo(-7, -21);
  ctx.lineTo(7, -21);
  ctx.lineTo(8, -11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = side.light;
  ctx.fillRect(-4.5, -18, 9, 3.5);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillRect(-4.5, -18, 9, 1.2);

  // Cracks
  ctx.strokeStyle = 'rgba(12, 14, 28, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-4, -2);
  ctx.lineTo(0, 5);
  ctx.lineTo(-3, 12);
  ctx.stroke();
}

function drawDragon(ctx, side) {
  // Wings first, so the body sits in front of them
  ctx.fillStyle = side.light;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * 3, -4);
    ctx.quadraticCurveTo(dir * 20, -22, dir * 21, -6);
    ctx.quadraticCurveTo(dir * 15, -8, dir * 13, 1);
    ctx.quadraticCurveTo(dir * 10, -4, dir * 3, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Tail
  ctx.strokeStyle = 'rgba(14, 16, 32, 0.9)';
  ctx.fillStyle = side.dark;
  ctx.beginPath();
  ctx.moveTo(-2, 8);
  ctx.quadraticCurveTo(-13, 14, -15, 5);
  ctx.quadraticCurveTo(-9, 12, -3, 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Body and neck
  ctx.beginPath();
  ctx.moveTo(-6, 17);
  ctx.quadraticCurveTo(-9, 2, -1, -3);
  ctx.quadraticCurveTo(6, -7, 5, -14);
  ctx.lineTo(11, -14);
  ctx.quadraticCurveTo(12, -3, 5, 3);
  ctx.quadraticCurveTo(8, 10, 8, 17);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Head
  ctx.beginPath();
  ctx.moveTo(3, -15);
  ctx.quadraticCurveTo(4, -23, 12, -22);
  ctx.lineTo(19, -19);
  ctx.lineTo(12, -16);
  ctx.quadraticCurveTo(11, -12, 4, -13);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Horn and eye
  ctx.fillStyle = '#f0cf87';
  ctx.beginPath();
  ctx.moveTo(5, -21);
  ctx.lineTo(1, -28);
  ctx.lineTo(9, -23);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(9, -19.5, 1.6, 0, TAU);
  ctx.fill();
}

/** Piece portrait for the DOM panels (captured lists, rules key). */
export function drawPieceIcon(ctx, type, sideId, size) {
  ctx.save();
  ctx.translate(size / 2, size * 0.62);
  ctx.scale(size / 52, size / 52);
  drawPiece(ctx, { type, side: sideId }, 0, 0, 1, 1);
  ctx.restore();
}

export function drawBanner(ctx, width, text, subtext, alpha) {
  if (!text || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 44px "Trebuchet MS", system-ui, sans-serif';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(10, 12, 26, 0.85)';
  ctx.strokeText(text, width / 2, 210);
  ctx.fillStyle = '#ffe07a';
  ctx.fillText(text, width / 2, 210);
  if (subtext) {
    ctx.font = '600 18px "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeText(subtext, width / 2, 248);
    ctx.fillStyle = '#e7ecff';
    ctx.fillText(subtext, width / 2, 248);
  }
  ctx.restore();
}

export const PIECE_NAMES = Object.fromEntries(
  Object.values(PIECES).map((piece) => [piece.id, piece.name])
);
