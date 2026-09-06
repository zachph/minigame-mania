/**
 * Nopoly rules. Pure logic - no canvas, no DOM, no randomness.
 *
 * An 8x8 chess board, Red against Blue, eight pieces each:
 *   6 Farmers - one square up, down, left or right.
 *   2 Golems  - up to two squares in any of the eight directions.
 * Sixteen pieces on the board at the start. Landing on an enemy captures it;
 * nothing jumps over anything.
 *
 * State is treated as immutable: `applyMove` returns a new state, which keeps
 * the search in `ai.js` and the move history honest.
 */

export const BOARD_SIZE = 8;
export const SQUARES = BOARD_SIZE * BOARD_SIZE;

export const SIDES = {
  red: { id: 'red', name: 'Red', color: '#e2564a', light: '#ff8a7d', dark: '#8f2016', home: 'bottom' },
  blue: { id: 'blue', name: 'Blue', color: '#4a8fe2', light: '#8ec2ff', dark: '#16508f', home: 'top' },
};
export const SIDE_IDS = ['red', 'blue'];

const ORTHOGONAL = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const DIAGONAL = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

export const PIECES = {
  farmer: {
    id: 'farmer',
    name: 'Farmer',
    count: 6,
    steps: 1,
    directions: ORTHOGONAL,
    value: 100,
    blurb: 'One square up, down, left or right.',
  },
  golem: {
    id: 'golem',
    name: 'Golem',
    count: 2,
    steps: 2,
    directions: [...ORTHOGONAL, ...DIAGONAL],
    value: 380,
    blurb: 'Up to two squares in any direction, including diagonals.',
  },
};

/** Turns without a capture before the match is called on material. */
export const STALE_LIMIT = 50;

export const indexOf = (col, row) => row * BOARD_SIZE + col;
export const colOf = (index) => index % BOARD_SIZE;
export const rowOf = (index) => Math.floor(index / BOARD_SIZE);
export const onBoard = (col, row) => col >= 0 && col < BOARD_SIZE && row >= 0 && row < BOARD_SIZE;

/** Standard algebraic-ish name for a square, e.g. 12 -> "e7". */
export function squareName(index) {
  return `${'abcdefgh'[colOf(index)]}${BOARD_SIZE - rowOf(index)}`;
}

export const opponentOf = (side) => (side === 'red' ? 'blue' : 'red');

/**
 * The opening position: golems on the back rank at c and f, farmers filling
 * b-g on the rank in front of them. Blue at the top, Red at the bottom.
 */
export function createBoard() {
  const board = new Array(SQUARES).fill(null);
  let serial = 0;
  const place = (side, type, col, row) => {
    board[indexOf(col, row)] = { id: `${side}-${type}-${serial += 1}`, side, type };
  };

  for (const col of [2, 5]) {
    place('blue', 'golem', col, 0);
    place('red', 'golem', col, BOARD_SIZE - 1);
  }
  for (let col = 1; col <= 6; col += 1) {
    place('blue', 'farmer', col, 1);
    place('red', 'farmer', col, BOARD_SIZE - 2);
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

/** Every move the piece on `index` can make. Nothing jumps; landing captures. */
export function movesFrom(state, index) {
  const piece = state.board[index];
  if (!piece) return [];
  const { steps, directions } = PIECES[piece.type];
  const col = colOf(index);
  const row = rowOf(index);
  const moves = [];

  for (const [dx, dy] of directions) {
    for (let step = 1; step <= steps; step += 1) {
      const nextCol = col + dx * step;
      const nextRow = row + dy * step;
      if (!onBoard(nextCol, nextRow)) break;
      const target = indexOf(nextCol, nextRow);
      const occupant = state.board[target];
      if (!occupant) {
        moves.push({ from: index, to: target, piece: piece.type, side: piece.side, captured: null });
        continue;
      }
      if (occupant.side !== piece.side) {
        moves.push({ from: index, to: target, piece: piece.type, side: piece.side, captured: occupant.type });
      }
      break; // blocked either way: no jumping
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
    lastMove: {
      from: move.from,
      to: move.to,
      side: piece.side,
      piece: piece.type,
      captured: target ? target.type : null,
    },
  };

  return applyVerdict(next);
}

/** Decides whether the game is over after a move. */
function applyVerdict(state) {
  const mover = opponentOf(state.turn); // the side that just moved
  const defender = state.turn;

  if (piecesOf(state, defender).length === 0) {
    return { ...state, over: true, winner: mover, reason: 'every piece captured' };
  }
  if (legalMoves(state, defender).length === 0) {
    return { ...state, over: true, winner: mover, reason: `${SIDES[defender].name} has no legal move` };
  }
  if (state.movesSinceCapture >= STALE_LIMIT) {
    const red = materialOf(state, 'red');
    const blue = materialOf(state, 'blue');
    if (red === blue) return { ...state, over: true, winner: null, reason: 'a draw: nothing captured for 50 turns' };
    return {
      ...state,
      over: true,
      winner: red > blue ? 'red' : 'blue',
      reason: 'nothing captured for 50 turns - the stronger army wins',
    };
  }
  return state;
}

/** Short move notation for the log, e.g. "Golem c1-e3 x Farmer". */
export function describeMove(move) {
  const piece = PIECES[move.piece].name;
  const capture = move.captured ? ` takes ${PIECES[move.captured].name}` : '';
  return `${piece} ${squareName(move.from)}-${squareName(move.to)}${capture}`;
}
