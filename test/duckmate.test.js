import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIECES, applyMove, canTake, createGame, legalMoves, movesFrom, piecesOf, squareFrom, squareName,
} from '../src/games/duckmate/rules.js';
import { chooseMove } from '../src/games/duckmate/ai.js';

const at = (state, name) => state.board[squareFrom(name)];
const empty = () => ({ ...createGame(), board: new Array(64).fill(null) });
const put = (state, name, side, type) => { state.board[squareFrom(name)] = { id: `${side}-${type}`, side, type }; };
const move = (state, from, to) => applyMove(state, { from: squareFrom(from), to: squareFrom(to) });

test('the pieces start where they should', () => {
  const s = createGame();
  const expect = {
    h8: ['red', 'duck'], h7: ['red', 'dog'], g8: ['red', 'fish'], g7: ['red', 'bird'],
    a1: ['blue', 'duck'], a2: ['blue', 'dog'], b1: ['blue', 'fish'], b2: ['blue', 'bird'],
  };
  for (const [square, [side, type]] of Object.entries(expect)) {
    assert.deepEqual([at(s, square).side, at(s, square).type], [side, type], square);
  }
  assert.equal(piecesOf(s, 'red').length + piecesOf(s, 'blue').length, 8);
  assert.equal(squareName(squareFrom('c5')), 'c5');
  assert.equal(s.turn, 'red');
});

test('fish take dogs, dogs take birds, birds take fish, and that is all', () => {
  assert.ok(canTake('fish', 'dog') && canTake('dog', 'bird') && canTake('bird', 'fish'));
  for (const [a, b] of [['fish', 'bird'], ['fish', 'fish'], ['dog', 'fish'], ['dog', 'dog'], ['bird', 'dog'], ['bird', 'bird']]) {
    assert.equal(canTake(a, b), false, `${a} must not take ${b}`);
  }
});

test('ducks take anything, and only a duck takes a duck', () => {
  for (const type of Object.keys(PIECES)) assert.ok(canTake('duck', type));
  for (const type of ['fish', 'dog', 'bird']) assert.equal(canTake(type, 'duck'), false);
});

test('every piece steps one square any way, but never onto something it cannot take', () => {
  const s = empty();
  put(s, 'd4', 'red', 'fish');
  assert.equal(movesFrom(s, squareFrom('d4')).length, 8);
  put(s, 'e5', 'blue', 'bird');   // fish cannot take a bird
  put(s, 'c3', 'blue', 'dog');    // but it can take a dog
  put(s, 'd5', 'red', 'duck');    // and never its own side
  const targets = movesFrom(s, squareFrom('d4')).map((m) => squareName(m.to));
  assert.ok(!targets.includes('e5') && !targets.includes('d5'));
  assert.ok(targets.includes('c3'));
  assert.equal(movesFrom(s, squareFrom('d4')).find((m) => squareName(m.to) === 'c3').captured, 'dog');
});

test('taking the enemy duck wins', () => {
  const s = empty();
  put(s, 'd4', 'red', 'duck');
  put(s, 'e5', 'blue', 'duck');
  put(s, 'a1', 'blue', 'fish');
  const after = move(s, 'd4', 'e5');
  assert.equal(after.over, true);
  assert.equal(after.winner, 'red');
});

test('taking every piece that is not a duck wins too', () => {
  const s = empty();
  put(s, 'd4', 'red', 'duck');
  put(s, 'e5', 'blue', 'bird');
  put(s, 'a1', 'blue', 'duck');
  put(s, 'h8', 'red', 'fish');
  const after = move(s, 'd4', 'e5');
  assert.equal(after.over, true);
  assert.equal(after.winner, 'red');
  assert.match(after.reason, /every Blue animal/);
});

test('nothing but a duck can touch a duck', () => {
  const s = empty();
  put(s, 'd4', 'blue', 'duck');
  put(s, 'h8', 'red', 'duck');
  for (const [square, type] of [['c4', 'fish'], ['e4', 'dog'], ['d5', 'bird']]) put(s, square, 'red', type);
  assert.ok(!legalMoves(s, 'red').some((m) => m.to === squareFrom('d4')));
});

test('the computer takes the duck when it can, and always plays a legal move', () => {
  const s = empty();
  put(s, 'd4', 'red', 'duck');
  put(s, 'e5', 'blue', 'duck');
  put(s, 'a8', 'blue', 'dog');
  put(s, 'h1', 'red', 'bird');
  const pick = chooseMove(s, 'hard', () => 0.5);
  assert.equal(squareName(pick.to), 'e5');

  let game = createGame();
  for (let i = 0; i < 40 && !game.over; i += 1) {
    const choice = chooseMove(game, 'easy', () => 0.3);
    assert.ok(legalMoves(game).some((m) => m.from === choice.from && m.to === choice.to));
    game = applyMove(game, choice);
  }
});
