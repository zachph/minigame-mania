import {
  BOARD_SIZE,
  PIECES,
  applyMove,
  colOf,
  legalMoves,
  opponentOf,
  piecesOf,
  rowOf,
} from './rules.js';

/**
 * The computer opponent: alpha-beta minimax over the move tree, with captures
 * searched first so cut-offs happen early.
 *
 * The search deepens one ply at a time and keeps the best move from the last
 * depth it finished, so a crowded position (a dragon alone offers two dozen
 * moves) costs a shallower search rather than a frozen screen.
 *
 * Difficulties differ only in how deep they are allowed to look and how long
 * they may spend; the same evaluation drives all of them.
 */
export const DIFFICULTIES = {
  easy: { id: 'easy', name: 'Easy', depth: 1, budgetMs: 80, jitter: 90, blurb: 'Looks one move ahead.' },
  normal: { id: 'normal', name: 'Normal', depth: 3, budgetMs: 300, jitter: 25, blurb: 'Looks three moves ahead.' },
  hard: { id: 'hard', name: 'Hard', depth: 4, budgetMs: 900, jitter: 0, blurb: 'Looks four moves ahead and takes no chances.' },
};

const WIN_SCORE = 100000;

/** How far up the board a square is from `side`'s point of view. */
function advancement(side, index) {
  const row = rowOf(index);
  return side === 'red' ? BOARD_SIZE - 1 - row : row;
}

/** Distance from the middle of the board, 0 in the centre. */
function centreDistance(index) {
  const middle = (BOARD_SIZE - 1) / 2;
  return Math.abs(colOf(index) - middle) + Math.abs(rowOf(index) - middle);
}

/** Positive numbers favour `side`. */
export function evaluate(state, side) {
  if (state.over) {
    if (!state.winner) return 0;
    return state.winner === side ? WIN_SCORE : -WIN_SCORE;
  }

  let score = 0;
  for (const owner of [side, opponentOf(side)]) {
    const sign = owner === side ? 1 : -1;
    for (const piece of piecesOf(state, owner)) {
      const spec = PIECES[piece.type];
      let value = spec.value;
      value += advancement(owner, piece.index) * (piece.type === 'farmer' ? 6 : piece.type === 'dragon' ? 1 : 2);
      value += (6 - centreDistance(piece.index)) * 3;
      score += sign * value;
    }
  }
  score += (legalMoves(state, side).length - legalMoves(state, opponentOf(side)).length) * 4;
  return score;
}

/** Captures first, biggest first: better ordering means more alpha-beta cut-offs. */
function orderMoves(moves) {
  return [...moves].sort((a, b) => {
    const av = a.captured ? PIECES[a.captured].value : 0;
    const bv = b.captured ? PIECES[b.captured].value : 0;
    return bv - av;
  });
}

/** Set while a search is running; a deepening pass that trips it is discarded. */
let deadline = Infinity;
let nodeCount = 0;
let ranOut = false;

function outOfTime() {
  if (ranOut) return true;
  nodeCount += 1;
  if ((nodeCount & 1023) === 0 && performance.now() > deadline) ranOut = true;
  return ranOut;
}

function search(state, depth, alpha, beta, side) {
  if (outOfTime()) return evaluate(state, side);
  if (state.over || depth === 0) return evaluate(state, side);
  const maximizing = state.turn === side;
  const moves = orderMoves(legalMoves(state, state.turn));
  if (moves.length === 0) return evaluate(state, side);

  let best = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    const score = search(applyMove(state, move), depth - 1, alpha, beta, side);
    if (maximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, score);
    }
    if (beta <= alpha) break;
  }
  return best;
}

/** One full-width pass at a fixed depth. Returns null if the clock ran out. */
function searchRoot(state, depth, moves, side, jitter, random) {
  let best = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  for (const move of moves) {
    const raw = search(applyMove(state, move), depth - 1, alpha, Infinity, side);
    if (ranOut) return null;
    const score = raw + (jitter ? (random() - 0.5) * jitter : 0);
    if (score > bestScore) {
      bestScore = score;
      best = move;
      alpha = Math.max(alpha, raw);
    }
  }
  return best;
}

/**
 * Picks a move for `state.turn`. `random` is injectable so tests can pin the
 * jitter that keeps the easier levels from being perfectly repeatable.
 */
export function chooseMove(state, difficulty = 'normal', random = Math.random) {
  const level = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  const side = state.turn;
  const moves = orderMoves(legalMoves(state, side));
  if (moves.length === 0) return null;

  deadline = performance.now() + level.budgetMs;
  nodeCount = 0;
  ranOut = false;

  let best = moves[0]; // captures are ordered first, so this is never terrible
  for (let depth = 1; depth <= level.depth; depth += 1) {
    const move = searchRoot(state, depth, moves, side, level.jitter, random);
    if (!move) break; // out of time: keep the best move from the last full pass
    best = move;
  }
  deadline = Infinity;
  return best;
}
