import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_SIZE,
  PIECES,
  STALE_LIMIT,
  applyMove,
  createGame,
  describeMove,
  indexOf,
  legalMoves,
  materialOf,
  movesFrom,
  piecesOf,
  squareName,
} from '../src/games/nopoly/rules.js';
import { chooseMove, evaluate } from '../src/games/nopoly/ai.js';

/** A board with only the listed pieces, for testing a rule in isolation. */
function position(entries, turn = 'red') {
  const state = createGame();
  const board = new Array(BOARD_SIZE * BOARD_SIZE).fill(null);
  let serial = 0;
  for (const [square, side, type] of entries) {
    board[square] = { id: `${side}-${type}-${serial += 1}`, side, type };
  }
  return { ...state, board, turn };
}

const at = (name) => {
  const col = 'abcdefgh'.indexOf(name[0]);
  const row = BOARD_SIZE - Number(name[1]);
  return indexOf(col, row);
};

test('the opening position is sixteen pieces, eight a side', () => {
  const state = createGame();
  assert.equal(state.board.filter(Boolean).length, 16);
  for (const side of ['red', 'blue']) {
    const pieces = piecesOf(state, side);
    assert.equal(pieces.length, 8, `${side} fields eight pieces`);
    assert.equal(pieces.filter((p) => p.type === 'farmer').length, 6, `${side} has six farmers`);
    assert.equal(pieces.filter((p) => p.type === 'golem').length, 2, `${side} has two golems`);
  }
  assert.equal(state.turn, 'red', 'Red moves first');
  assert.equal(state.over, false);
});

test('the two sides start as mirror images', () => {
  const state = createGame();
  for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
    const piece = state.board[index];
    const mirror = state.board[(BOARD_SIZE * BOARD_SIZE - 1) - index];
    if (!piece) {
      assert.equal(mirror, null, `${squareName(index)} mirrors an empty square`);
      continue;
    }
    assert.equal(mirror.type, piece.type, `${squareName(index)} mirrors the same piece`);
    assert.notEqual(mirror.side, piece.side);
  }
});

test('a farmer moves one square up, down, left or right - never diagonally', () => {
  const state = position([[at('d4'), 'red', 'farmer']]);
  const targets = movesFrom(state, at('d4')).map((move) => squareName(move.to)).sort();
  assert.deepEqual(targets, ['c4', 'd3', 'd5', 'e4'].sort());
});

test('a farmer in the corner only has two squares', () => {
  const state = position([[at('a1'), 'red', 'farmer']]);
  assert.deepEqual(movesFrom(state, at('a1')).map((m) => squareName(m.to)).sort(), ['a2', 'b1']);
});

test('a golem moves up to two squares in all eight directions', () => {
  const state = position([[at('d4'), 'red', 'golem']]);
  const targets = movesFrom(state, at('d4')).map((move) => squareName(move.to)).sort();
  assert.equal(targets.length, 16, 'eight directions, two distances each');
  for (const square of ['d5', 'd6', 'e5', 'f6', 'b2', 'd2', 'f4', 'b4']) {
    assert.ok(targets.includes(square), `${square} is reachable`);
  }
  assert.ok(!targets.includes('d7'), 'three squares is too far');
  assert.ok(!targets.includes('e6'), 'no knight-style moves');
});

test('nothing jumps: a piece in the way blocks the square behind it', () => {
  const friendly = position([
    [at('d4'), 'red', 'golem'],
    [at('d5'), 'red', 'farmer'],
  ]);
  const friendlyTargets = movesFrom(friendly, at('d4')).map((m) => squareName(m.to));
  assert.ok(!friendlyTargets.includes('d5'), 'cannot land on a friend');
  assert.ok(!friendlyTargets.includes('d6'), 'cannot jump a friend');

  const enemy = position([
    [at('d4'), 'red', 'golem'],
    [at('d5'), 'blue', 'farmer'],
  ]);
  const enemyTargets = movesFrom(enemy, at('d4'));
  assert.ok(enemyTargets.some((m) => squareName(m.to) === 'd5' && m.captured === 'farmer'), 'captures it');
  assert.ok(!enemyTargets.some((m) => squareName(m.to) === 'd6'), 'cannot jump over it either');
});

test('a golem can capture two squares away when the path is clear', () => {
  const state = position([
    [at('d4'), 'red', 'golem'],
    [at('f6'), 'blue', 'golem'],
  ]);
  const move = movesFrom(state, at('d4')).find((option) => squareName(option.to) === 'f6');
  assert.ok(move, 'the diagonal reaches two squares');
  assert.equal(move.captured, 'golem');
});

test('applying a move leaves the previous position untouched', () => {
  const before = createGame();
  const snapshot = JSON.stringify(before);
  const move = legalMoves(before, 'red')[0];
  const after = applyMove(before, move);
  assert.equal(JSON.stringify(before), snapshot, 'the old state is unchanged');
  assert.notEqual(after.board, before.board);
  assert.equal(after.turn, 'blue');
  assert.equal(after.moveNumber, 2);
});

test('a capture is recorded, and resets the no-capture clock', () => {
  const state = position([
    [at('d4'), 'red', 'golem'],
    [at('d5'), 'blue', 'farmer'],
    [at('a8'), 'blue', 'golem'],
  ]);
  const next = applyMove({ ...state, movesSinceCapture: 9 }, { from: at('d4'), to: at('d5') });
  assert.equal(next.board[at('d5')].side, 'red');
  assert.equal(next.board[at('d4')], null);
  assert.deepEqual(next.captured.blue, ['farmer']);
  assert.equal(next.movesSinceCapture, 0);
  assert.equal(next.lastMove.captured, 'farmer');
});

test('illegal moves are refused', () => {
  const state = createGame();
  assert.throws(() => applyMove(state, { from: at('d2'), to: at('d5') }), /Illegal move/);
  assert.throws(() => applyMove(state, { from: at('d7'), to: at('d6') }), /red's turn/);
  assert.throws(() => applyMove(state, { from: at('d4'), to: at('d5') }), /No piece/);
});

test('taking the last enemy piece wins the match', () => {
  const state = position([
    [at('d4'), 'red', 'golem'],
    [at('d5'), 'blue', 'farmer'],
  ]);
  const next = applyMove(state, { from: at('d4'), to: at('d5') });
  assert.equal(next.over, true);
  assert.equal(next.winner, 'red');
  assert.match(next.reason, /every piece captured/);
  assert.deepEqual(legalMoves(next, 'blue'), [], 'a finished game offers no moves');
});

test('a long stretch with no captures is called on material', () => {
  const state = position([
    [at('d4'), 'red', 'golem'],
    [at('a1'), 'red', 'farmer'],
    [at('h8'), 'blue', 'farmer'],
  ]);
  const next = applyMove({ ...state, movesSinceCapture: STALE_LIMIT - 1 }, { from: at('d4'), to: at('d5') });
  assert.equal(next.over, true);
  assert.equal(next.winner, 'red', 'the bigger army takes it');
  assert.match(next.reason, /50 turns/);
});

test('an even stretch with no captures is a draw', () => {
  const state = position([
    [at('d4'), 'red', 'farmer'],
    [at('h8'), 'blue', 'farmer'],
  ]);
  const next = applyMove({ ...state, movesSinceCapture: STALE_LIMIT - 1 }, { from: at('d4'), to: at('d5') });
  assert.equal(next.over, true);
  assert.equal(next.winner, null);
  assert.match(next.reason, /draw/);
});

test('squares are named like a chess board', () => {
  assert.equal(squareName(0), 'a8');
  assert.equal(squareName(63), 'h1');
  assert.equal(squareName(at('e4')), 'e4');
});

test('moves read as plain English', () => {
  const state = createGame();
  const move = movesFrom(state, at('d2')).find((option) => squareName(option.to) === 'd3');
  assert.equal(describeMove({ ...move }), 'Farmer d2-d3');
  assert.equal(
    describeMove({ from: at('d4'), to: at('d5'), piece: 'golem', captured: 'farmer' }),
    'Golem d4-d5 takes Farmer'
  );
});

test('a golem is worth more than a farmer, and material adds up', () => {
  assert.ok(PIECES.golem.value > PIECES.farmer.value);
  const state = createGame();
  assert.equal(materialOf(state, 'red'), 6 * PIECES.farmer.value + 2 * PIECES.golem.value);
  assert.equal(materialOf(state, 'red'), materialOf(state, 'blue'), 'the sides start even');
});

test('the evaluation is symmetric at the start and follows material', () => {
  const state = createGame();
  // Written as a sum: strict equality treats 0 and -0 as different.
  assert.equal(evaluate(state, 'red') + evaluate(state, 'blue'), 0);
  const down = position([
    [at('d4'), 'red', 'farmer'],
    [at('a1'), 'blue', 'golem'],
    [at('h8'), 'blue', 'farmer'],
  ]);
  assert.ok(evaluate(down, 'red') < 0, 'being a golem down is bad');
});

test('the computer only ever plays legal moves', () => {
  let state = createGame();
  for (let ply = 0; ply < 40 && !state.over; ply += 1) {
    const move = chooseMove(state, ply % 3 === 0 ? 'easy' : 'normal', () => 0.5);
    assert.ok(move, 'it found a move');
    const legal = legalMoves(state, state.turn);
    assert.ok(
      legal.some((option) => option.from === move.from && option.to === move.to),
      `ply ${ply}: ${describeMove({ ...move, piece: state.board[move.from].type })} is legal`
    );
    state = applyMove(state, move);
  }
});

test('the computer takes a free golem', () => {
  const state = position([
    [at('d4'), 'red', 'golem'],
    [at('f6'), 'blue', 'golem'],
    [at('a1'), 'blue', 'farmer'],
    [at('h1'), 'red', 'farmer'],
  ]);
  const move = chooseMove(state, 'normal', () => 0.5);
  assert.equal(squareName(move.from), 'd4');
  assert.equal(squareName(move.to), 'f6');
});

test('a game between two computers always finishes', () => {
  let state = createGame();
  let plies = 0;
  while (!state.over && plies < 400) {
    state = applyMove(state, chooseMove(state, 'easy', () => 0.5));
    plies += 1;
  }
  assert.equal(state.over, true, `finished in ${plies} plies`);
  assert.ok(state.reason, 'and says why');
});
