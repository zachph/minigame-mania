import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INSTANT_SUPPORT_COUNT,
  SUPPORT_COUNT,
  SUPPORT_TIMING,
  canPlaySupport,
  firstToAct,
  instantsIn,
  turnOrder,
} from '../src/games/strikecards/rules.js';

const card = (speed, extra = {}) => ({ id: `s${speed}`, name: `Card ${speed}`, speed, power: 10, hp: 10, ...extra });

test('the faster card acts first', () => {
  assert.equal(firstToAct(card(7), card(3)), 'a');
  assert.equal(firstToAct(card(3), card(7)), 'b');
  assert.equal(firstToAct(card(1), card(2)), 'b', 'one point of speed is enough');

  assert.deepEqual(turnOrder({ a: card(9), b: card(4) }), ['a', 'b']);
  assert.deepEqual(turnOrder({ a: card(4), b: card(9) }), ['b', 'a']);
});

test('a tie on speed is a coin flip, not a seat advantage', () => {
  assert.equal(firstToAct(card(5), card(5), () => 0.2), 'a');
  assert.equal(firstToAct(card(5), card(5), () => 0.8), 'b');

  // Over many ties neither side is favoured.
  let aFirst = 0;
  const random = (() => { let n = 0; return () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648); })();
  for (let i = 0; i < 10000; i += 1) if (firstToAct(card(5), card(5), random) === 'a') aFirst += 1;
  assert.ok(Math.abs(aFirst - 5000) < 200, `a went first ${aFirst} times in 10000`);
});

test('a side with no card left standing does not act', () => {
  assert.equal(firstToAct(null, card(1)), 'b');
  assert.equal(firstToAct(card(1), null), 'a');
});

test('five of the fifteen supports can be played off-turn', () => {
  assert.equal(SUPPORT_COUNT, 15);
  assert.equal(INSTANT_SUPPORT_COUNT, 5);
  assert.ok(INSTANT_SUPPORT_COUNT < SUPPORT_COUNT, 'the rest wait their turn');
  assert.deepEqual(Object.keys(SUPPORT_TIMING), ['turn', 'instant']);

  const supports = [
    { id: 'guard', timing: 'instant' },
    { id: 'rally', timing: 'turn' },
    { id: 'counter', timing: 'instant' },
  ];
  assert.deepEqual(instantsIn(supports).map((s) => s.id), ['guard', 'counter']);
});

test('an ordinary support waits for your turn; an instant does not', () => {
  const ordinary = { id: 'rally', timing: 'turn' };
  const instant = { id: 'guard', timing: 'instant' };

  assert.equal(canPlaySupport(ordinary, { isYourTurn: true }), true);
  assert.equal(canPlaySupport(ordinary, { isYourTurn: false }), false, 'not while the other side is acting');
  assert.equal(canPlaySupport(instant, { isYourTurn: true }), true);
  assert.equal(canPlaySupport(instant, { isYourTurn: false }), true, 'that is what the five are for');
  assert.equal(canPlaySupport(null, { isYourTurn: true }), false);
});

test('whoever has the faster card gets their support in first', () => {
  // The rule is the same comparison: speed decides the whole turn's order.
  const quick = card(8);
  const slow = card(2);
  assert.deepEqual(turnOrder({ a: quick, b: slow }), ['a', 'b']);
  assert.deepEqual(turnOrder({ a: slow, b: quick }), ['b', 'a']);
});
