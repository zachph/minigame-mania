import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INCOME_BANDS,
  INSTANT_SUPPORT_COUNT,
  STARTING_POINTS,
  SUPPORT_COUNT,
  SUPPORT_TIMING,
  bountyFor,
  canAfford,
  canPlaySupport,
  firstToAct,
  BOARD_LIMIT,
  PLAYS_PER_TURN,
  canAttack,
  canPlayCard,
  playProblem,
  canUseSupport,
  incomeOnTurn,
  isBeaten,
  loser,
  pointsByTurn,
  recall,
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


/* ------------------------------------------------------------- the points */

test('income widens at turn 5 and again at turn 9', () => {
  assert.equal(STARTING_POINTS, 5);

  for (const turn of [1, 2, 3, 4]) assert.equal(incomeOnTurn(turn), 1, `turn ${turn} trickles 1`);
  for (const turn of [5, 6, 7, 8]) assert.equal(incomeOnTurn(turn), 2, `turn ${turn} trickles 2`);
  for (const turn of [9, 10, 20, 100]) assert.equal(incomeOnTurn(turn), 3, `turn ${turn} trickles 3`);

  // The bands meet exactly - no turn falls between two of them.
  assert.equal(INCOME_BANDS[0].to + 1, INCOME_BANDS[1].from);
  assert.equal(INCOME_BANDS[1].to + 1, INCOME_BANDS[2].from);
});

test('you open on exactly the five you were promised', () => {
  assert.equal(pointsByTurn(1), 5, 'turn one is the 5 you start with, no more');
  assert.equal(pointsByTurn(2), 6);
  assert.equal(pointsByTurn(4), 8);
  assert.equal(pointsByTurn(5), 10, 'the first turn of the second band');
  assert.equal(pointsByTurn(8), 16);
  assert.equal(pointsByTurn(9), 19, 'and of the third');
  assert.equal(pointsByTurn(12), 28);

  // It only ever climbs.
  for (let turn = 2; turn <= 30; turn += 1) {
    assert.ok(pointsByTurn(turn) > pointsByTurn(turn - 1), `turn ${turn} is richer than ${turn - 1}`);
  }
});

test('a kill pays exactly what the thing you killed cost', () => {
  assert.equal(bountyFor({ cost: 7 }), 7);
  assert.equal(bountyFor({ cost: 1 }), 1);
  assert.equal(bountyFor(null), 0);
});

test('you cannot put down what you cannot pay for', () => {
  const card = { id: 'brute', cost: 6 };
  assert.equal(canAfford(card, 5), false);
  assert.equal(canAfford(card, 6), true, 'exactly enough is enough');
  assert.equal(canAfford(card, 99), true);
  assert.equal(canAfford(null, 99), false);

  // On turn one a 6-cost card is out of reach; killing a 3-cost puts it in.
  assert.equal(canAfford(card, pointsByTurn(1)), false);
  assert.equal(canAfford(card, pointsByTurn(1) + bountyFor({ cost: 3 })), true);
});


/* ------------------------------------------- a turn, and the end of things */

test('one strike card and one support a turn, whatever you can afford', () => {
  assert.deepEqual(PLAYS_PER_TURN, { card: 1, support: 1 });

  const fresh = { points: 20, board: [], cardsPlayedThisTurn: 0, supportsPlayedThisTurn: 0 };
  const spent = { points: 20, board: [], cardsPlayedThisTurn: 1, supportsPlayedThisTurn: 1 };
  const cheap = { id: 'pebble', cost: 2 };

  assert.equal(canPlayCard(fresh, cheap), true);
  assert.equal(canPlayCard(spent, cheap), false, 'one a turn, even with points to burn');
  assert.equal(canPlayCard({ ...fresh, points: 1 }, cheap), false, 'and never one you cannot pay for');

  const instant = { id: 'guard', timing: 'instant' };
  assert.equal(canUseSupport(fresh, instant, { isYourTurn: false }), true);
  assert.equal(canUseSupport(spent, instant, { isYourTurn: false }), false, 'the one support is already gone');
});

test('a card pulled out of the graveyard comes back free', () => {
  const heavy = { id: 'titan', name: 'Titan', cost: 9, speed: 2, power: 12, hp: 14 };
  const back = recall(heavy);

  assert.equal(back.cost, 0, 'the whole point of the card that does this');
  assert.equal(back.recalled, true);
  assert.equal(back.power, 12, 'everything else about it is unchanged');
  assert.equal(back.hp, 14);
  assert.equal(heavy.cost, 9, 'and the original is not altered');
  assert.equal(recall(null), null);
});

test('you are beaten when there is nothing left to knock out', () => {
  const empty = { board: [], hand: [], deck: [] };
  const holding = { board: [], hand: [{ id: 'x' }], deck: [] };
  const drawing = { board: [], hand: [], deck: [{ id: 'y' }] };
  const fighting = { board: [{ id: 'z' }], hand: [], deck: [] };
  // A hand of gear is not a defence: nothing to field, nothing to knock out.
  const onlyGear = { board: [], hand: [{ id: 'sword', kind: 'gear' }], deck: [] };

  assert.equal(isBeaten(empty), true);
  assert.equal(isBeaten(onlyGear), true, 'gear cannot take the field by itself');
  assert.equal(isBeaten(holding), false, 'a card in hand is a card you can still field');
  assert.equal(isBeaten(drawing), false);
  assert.equal(isBeaten(fighting), false);

  assert.equal(loser({ a: empty, b: fighting }), 'a');
  assert.equal(loser({ a: fighting, b: empty }), 'b');
  assert.equal(loser({ a: fighting, b: holding }), null, 'nobody yet');
  assert.equal(loser({ a: empty, b: empty }), 'both');
});


test('two cards out at a time, and one a turn to get there', () => {
  assert.equal(BOARD_LIMIT, 2);
  const cheap = { id: 'pebble', name: 'Pebble', cost: 2 };
  const side = (board, played = 0) => ({ points: 20, board, cardsPlayedThisTurn: played });

  assert.equal(canPlayCard(side([]), cheap), true);
  assert.equal(canPlayCard(side([{ uid: 1 }]), cheap), true, 'one out, room for one more');
  assert.equal(canPlayCard(side([{ uid: 1 }, { uid: 2 }]), cheap), false, 'a full board takes nothing');

  assert.equal(playProblem(side([]), cheap), null);
  assert.match(playProblem(side([], 1), cheap), /One card a turn/);
  assert.match(playProblem(side([{ uid: 1 }, { uid: 2 }]), cheap), /2 cards out/);
  assert.match(playProblem({ points: 1, board: [], cardsPlayedThisTurn: 0 }, cheap), /costs 2 - you have 1/);
  assert.match(playProblem(side([]), null), /Nothing selected/);
});

test('you may only swing at something that is actually there', () => {
  const theirs = [{ uid: 'x', name: 'Ox' }, { uid: 'y', name: 'Yak' }];
  assert.equal(canAttack({ uid: 'x' }, theirs), true);
  assert.equal(canAttack({ uid: 'y' }, theirs), true);
  assert.equal(canAttack({ uid: 'gone' }, theirs), false, 'not one that already died');
  assert.equal(canAttack(null, theirs), false);
  assert.equal(canAttack({ uid: 'x' }, []), false, 'nor into an empty board');
});
