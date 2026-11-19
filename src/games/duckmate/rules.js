/**
 * Duckmate rules. Pure logic - no canvas, no DOM, no randomness.
 *
 * An 8x8 chess board, Red against Blue, four pieces each: a Fish, a Dog, a
 * Bird and a Duck. It is rock-paper-scissors on a board:
 *   Fish take Dogs. Dogs take Birds. Birds take Fish.
 *   Ducks take anything, and nothing takes a Duck except another Duck.
 * Every piece moves one square in any of the eight directions. A piece may
 * not land on one it cannot take. Win by taking the enemy Duck, or by taking
 * every enemy piece that is not a Duck.
 *
 * Red starts in the top-right corner (Duck h8, Fish g8, Dog h7, Bird g7) and
 * Blue in the bottom-left (Duck a1, Fish b1, Dog a2, Bird b2).
 *
 * State is treated as immutable: `applyMove` returns a new state, which keeps
 * the search in `ai.js` and the move history honest.
 */

export const BOARD_SIZE = 8;
export const SQUARES = BOARD_SIZE * BOARD_SIZE;

export const SIDES = {
  red: { id: 'red', name: 'Red', color: '#e2564a', light: '#ff8a7d', dark: '#8f2016' },
  blue: { id: 'blue', name: 'Blue', color: '#4a8fe2', light: '#8ec2ff', dark: '#16508f' },
};
export const SIDE_IDS = ['red', 'blue'];

export const PIECES = {
  duck: { id: 'duck', name: 'Duck', takes: ['fish', 'dog', 'bird', 'duck'], value: 1000, blurb: 'Takes anything. Only a Duck can take a Duck.' },
  fish: { id: 'fish', name: 'Fish', takes: ['dog'], value: 100, blurb: 'Can only take Dogs.' },
  dog: { id: 'dog', name: 'Dog', takes: ['bird'], value: 100, blurb: 'Can only take Birds.' },
  bird: { id: 'bird', name: 'Bird', takes: ['fish'], value: 100, blurb: 'Can only take Fish.' },
};
export const PIECE_ORDER = ['duck', 'fish', 'dog', 'bird'];

/** Every piece steps one square any way: up, down, sideways or diagonally. */
const DIRECTIONS = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];

/** Moves (both sides counted) without a capture before the match is called a draw: 30 turns each. */
export const STALE_LIMIT = 60;

export const indexOf = (col, row) => row * BOARD_SIZE + col;
export const colOf = (index) => index % BOARD_SIZE;
export const rowOf = (index) => Math.floor(index / BOARD_SIZE);
export const onBoard = (col, row) => col >= 0 && col < BOARD_SIZE && row >= 0 && row < BOARD_SIZE;

/** Chess name for a square, e.g. 7 -> "h8". Row 0 is the 8th rank. */
export function squareName(index) {
  return `${'abcdefgh'[colOf(index)]}${BOARD_SIZE - rowOf(index)}`;
}

/** The square a chess name points at, e.g. "a1" -> 56. */
export function squareFrom(name) {
  return indexOf('abcdefgh'.indexOf(name[0]), BOARD_SIZE - Number(name.slice(1)));
}

export const opponentOf = (side) => (side === 'red' ? 'blue' : 'red');

/** Whether a piece of type `attacker` may take one of type `target`. */
export const canTake = (attacker, target) => PIECES[attacker].takes.includes(target);

export const START = {
  red: { duck: 'h8', dog: 'h7', fish: 'g8', bird: 'g7' },
  blue: { duck: 'a1', dog: 'a2', fish: 'b1', bird: 'b2' },
};

export function createBoard() {
  const board = new Array(SQUARES).fill(null);
  for (const side of SIDE_IDS) {
    for (const [type, square] of Object.entries(START[side])) {
      board[squareFrom(square)] = { id: `${side}-${type}`, side, type };
    }
  }
  return board;
}

export function createGame() {
  return {
    board: createBoard(),
    turn: 'red',
    moveNumber: 1,
    movesSinceCapture: 0,
    captured: { red: [], blue: [] }, // pieces each side has lost
    lastMove: null,
    over: false,
    winner: null,
    reason: null,
  };
}

export function piecesOf(state, side) {
  const pieces = [];
  for (let index = 0; index < SQUARES; index += 1) {
    const piece = state.board[index];
    if (piece && piece.side === side) pieces.push({ ...piece, index });
  }
  return pieces;
}

export function materialOf(state, side) {
  return piecesOf(state, side).reduce((total, piece) => total + PIECES[piece.type].value, 0);
}

/** Every move the piece on `index` can make: one step, onto an empty square or something it can take. */
export function movesFrom(state, index) {
  const piece = state.board[index];
  if (!piece) return [];
  const col = colOf(index);
  const row = rowOf(index);
  const moves = [];
  for (const [dx, dy] of DIRECTIONS) {
    if (!onBoard(col + dx, row + dy)) continue;
    const to = indexOf(col + dx, row + dy);
    const occupant = state.board[to];
    if (!occupant) moves.push({ from: index, to, piece: piece.type, side: piece.side, captured: null });
    else if (occupant.side !== piece.side && canTake(piece.type, occupant.type)) {
      moves.push({ from: index, to, piece: piece.type, side: piece.side, captured: occupant.type });
    }
  }
  return moves;
}

export function legalMoves(state, side = state.turn) {
  if (state.over) return [];
  const moves = [];
  for (const piece of piecesOf(state, side)) moves.push(...movesFrom(state, piece.index));
  return moves;
}

export function isLegal(state, move) {
  return movesFrom(state, move.from).some((option) => option.to === move.to);
}

/** Applies a move and returns the new state, including any end-of-game verdict. */
export function applyMove(state, move) {
  const piece = state.board[move.from];
  if (!piece) throw new Error(`No piece on ${squareName(move.from)}`);
  if (piece.side !== state.turn) throw new Error(`It is ${state.turn}'s turn`);
  if (!isLegal(state, move)) throw new Error(`Illegal move ${squareName(move.from)}-${squareName(move.to)}`);

  const board = state.board.slice();
  const target = board[move.to];
  board[move.to] = piece;
  board[move.from] = null;

  const captured = { red: [...state.captured.red], blue: [...state.captured.blue] };
  if (target) captured[target.side].push(target.type);

  const next = {
    ...state,
    board,
    captured,
    turn: opponentOf(state.turn),
    moveNumber: state.moveNumber + 1,
    movesSinceCapture: target ? 0 : state.movesSinceCapture + 1,
    lastMove: { from: move.from, to: move.to, side: piece.side, piece: piece.type, captured: target ? target.type : null },
  };
  return applyVerdict(next);
}

/** Decides whether the game is over after a move. */
function applyVerdict(state) {
  const mover = opponentOf(state.turn); // the side that just moved
  const defender = state.turn;

  if (state.lastMove?.captured === 'duck') {
    return { ...state, over: true, winner: mover, reason: `${SIDES[mover].name}'s Duck took the other Duck` };
  }
  if (!piecesOf(state, defender).some((piece) => piece.type !== 'duck')) {
    return { ...state, over: true, winner: mover, reason: `${SIDES[mover].name} took every ${SIDES[defender].name} animal but the Duck` };
  }
  if (legalMoves(state, defender).length === 0) {
    return { ...state, over: true, winner: mover, reason: `${SIDES[defender].name} has no move` };
  }
  if (state.movesSinceCapture >= STALE_LIMIT) {
    return { ...state, over: true, winner: null, reason: `a draw: nothing taken for ${STALE_LIMIT / 2} turns` };
  }
  return state;
}

/** Short move notation for the log, e.g. "Fish g8-f7 takes Dog". */
export function describeMove(move) {
  const piece = PIECES[move.piece].name;
  const capture = move.captured ? ` takes ${PIECES[move.captured].name}` : '';
  return `${piece} ${squareName(move.from)}-${squareName(move.to)}${capture}`;
}
