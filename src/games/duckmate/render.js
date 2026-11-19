import { TAU, clamp, roundedRect } from '../../core/utils.js';
import { BOARD_SIZE, PIECES, SIDES, colOf, rowOf } from './rules.js';

/**
 * Board and piece drawing. Pieces are drawn from code - a duck, a fish, a dog
 * and a bird - each in the colour of the side that owns them.
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
  if (piece.type === 'duck') drawDuck(ctx, side);
  else if (piece.type === 'fish') drawFish(ctx, side);
  else if (piece.type === 'dog') drawDog(ctx, side);
  else drawBird(ctx, side);
  ctx.restore();
}

const BEAK = '#f4b33d';
const INK = '#14162a';

function eye(ctx, x, y, r = 1.8) {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, r + 1.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x + 0.4, y, r, 0, TAU);
  ctx.fill();
}

/** A sitting duck, side on, with a gold crown so it reads as the piece that matters. */
function drawDuck(ctx, side) {
  // Body
  ctx.fillStyle = side.color;
  ctx.beginPath();
  ctx.moveTo(-16, 4);
  ctx.quadraticCurveTo(-20, -4, -13, -3);   // tail tip
  ctx.quadraticCurveTo(-6, 0, 2, 0);
  ctx.quadraticCurveTo(16, 0, 15, 9);
  ctx.quadraticCurveTo(12, 17, 0, 17);
  ctx.quadraticCurveTo(-14, 17, -16, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Wing
  ctx.fillStyle = side.dark;
  ctx.beginPath();
  ctx.moveTo(-9, 6);
  ctx.quadraticCurveTo(-1, 1, 7, 7);
  ctx.quadraticCurveTo(-1, 13, -9, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Head
  ctx.fillStyle = side.light;
  ctx.beginPath();
  ctx.arc(7, -9, 8, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // Bill
  ctx.fillStyle = BEAK;
  ctx.beginPath();
  ctx.moveTo(13, -9);
  ctx.quadraticCurveTo(22, -10, 22, -6);
  ctx.quadraticCurveTo(19, -3, 13, -5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  eye(ctx, 9, -11);
  // Crown
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.moveTo(1, -16);
  ctx.lineTo(2, -24);
  ctx.lineTo(5, -19);
  ctx.lineTo(8, -25);
  ctx.lineTo(10, -19);
  ctx.lineTo(13, -23);
  ctx.lineTo(13, -15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** A fish, side on, swimming right. */
function drawFish(ctx, side) {
  // Tail
  ctx.fillStyle = side.dark;
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.lineTo(-21, -10);
  ctx.quadraticCurveTo(-17, 0, -21, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Body
  ctx.fillStyle = side.color;
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.quadraticCurveTo(0, -16, 18, 0);
  ctx.quadraticCurveTo(0, 16, -12, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Fins and a stripe
  ctx.fillStyle = side.light;
  ctx.beginPath();
  ctx.moveTo(-2, -9);
  ctx.quadraticCurveTo(2, -17, 8, -8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = side.light;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(1, -8);
  ctx.quadraticCurveTo(-2, 0, 1, 8);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(14, 16, 32, 0.9)';
  ctx.lineWidth = 2.5;
  eye(ctx, 10, -2);
  // Mouth
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(14, 2);
  ctx.stroke();
}

/** A dog's head, facing out, with floppy ears. */
function drawDog(ctx, side) {
  // Ears behind the head
  ctx.fillStyle = side.dark;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * 8, -14);
    ctx.quadraticCurveTo(dir * 22, -14, dir * 18, 4);
    ctx.quadraticCurveTo(dir * 13, 6, dir * 11, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Head
  ctx.fillStyle = side.color;
  ctx.beginPath();
  ctx.ellipse(0, -2, 12, 14, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // Muzzle
  ctx.fillStyle = side.light;
  ctx.beginPath();
  ctx.ellipse(0, 6, 8, 6.5, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // Nose and mouth
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(0, 3, 3.5, 2.5, 0, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, 5);
  ctx.lineTo(0, 8);
  ctx.moveTo(-3.5, 9.5);
  ctx.quadraticCurveTo(0, 11, 3.5, 9.5);
  ctx.stroke();
  // Tongue
  ctx.fillStyle = '#ff7a9a';
  ctx.beginPath();
  ctx.ellipse(1.5, 12, 2.2, 3, 0, 0, TAU);
  ctx.fill();
  eye(ctx, -5, -6);
  eye(ctx, 5, -6);
}

/** A small bird in flight, wings up. */
function drawBird(ctx, side) {
  // Wings
  ctx.fillStyle = side.light;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * 3, -2);
    ctx.quadraticCurveTo(dir * 14, -22, dir * 22, -16);
    ctx.quadraticCurveTo(dir * 16, -12, dir * 15, -6);
    ctx.quadraticCurveTo(dir * 10, -4, dir * 3, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Tail
  ctx.fillStyle = side.dark;
  ctx.beginPath();
  ctx.moveTo(-4, 12);
  ctx.lineTo(0, 20);
  ctx.lineTo(4, 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Body
  ctx.fillStyle = side.color;
  ctx.beginPath();
  ctx.ellipse(0, 4, 7.5, 10, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // Head
  ctx.beginPath();
  ctx.arc(0, -8, 6.5, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // Beak
  ctx.fillStyle = BEAK;
  ctx.beginPath();
  ctx.moveTo(-2.5, -6);
  ctx.lineTo(0, -1);
  ctx.lineTo(2.5, -6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  eye(ctx, -2.6, -9.5, 1.4);
  eye(ctx, 2.6, -9.5, 1.4);
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
