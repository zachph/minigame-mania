import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPENING_HAND,
  TURN_LIMIT,
  checkOver,
  attack,
  createMatch,
  endTurn,
  instance,
  playCard,
  playGear,
  recallFromGraveyard,
} from '../src/games/strikecards/battle.js';
import { applySupport } from '../src/games/strikecards/battle.js';
import { SUPPORTS, getSupport, instantSupports } from '../src/games/strikecards/supports.js';
import { seededRandom } from '../src/core/utils.js';
import { drawBackdrop, drawCard, drawLog, drawSideBar, drawSlot } from '../src/games/strikecards/art.js';
import { createFakeContext } from './helpers.js';

const card = (name, { cost = 3, speed = 5, power = 4, hp = 6 } = {}) =>
  ({ id: name.toLowerCase(), name, rarity: 'common', cost, speed, power, hp });

/** A match where both sides hold the same plain deck. */
const match = (overrides = {}) => createMatch({
  decks: {
    a: Array.from({ length: 20 }, (_, i) => card(`A${i}`)),
    b: Array.from({ length: 20 }, (_, i) => card(`B${i}`)),
  },
  random: seededRandom(11),
  ...overrides,
});

/** Puts a card straight onto a side's board, past the cost and the turn limit. */
function place(state, which, spec) {
  const made = instance(spec);
  state.sides[which].board.push(made);
  return made;
}

test('a match opens with five in hand and five points', () => {
  const state = match();
  assert.equal(state.sides.a.hand.length, OPENING_HAND + 1, 'five dealt, then one drawn for turn one');
  assert.equal(state.sides.b.hand.length, OPENING_HAND);
  assert.equal(state.sides.a.points, 5);
  assert.equal(state.sides.b.points, 5);
  assert.equal(state.active, 'a');
  assert.equal(state.over, false);
});

test('putting a card down costs its points, and only one goes down a turn', () => {
  const state = match();
  state.sides.a.hand = [instance(card('Pebble', { cost: 2 })), instance(card('Boulder', { cost: 4 }))];

  const first = playCard(state, 0);
  assert.equal(first.card.name, 'Pebble');
  assert.equal(state.sides.a.points, 3, 'five less two');
  assert.equal(state.sides.a.board.length, 1);

  const second = playCard(state, 0);
  assert.match(second.error, /One card a turn/);
  assert.equal(state.sides.a.board.length, 1);
});

test('the faster card lands first, and a card killed first never hits back', () => {
  const state = match();
  const quick = place(state, 'a', card('Dart', { speed: 9, power: 7, hp: 5, cost: 3 }));
  const slow = place(state, 'b', card('Lump', { speed: 2, power: 6, hp: 6, cost: 4 }));

  attack(state, quick.uid, slow.uid);

  assert.equal(state.sides.b.board.length, 0, 'the Lump is gone');
  assert.equal(quick.hp, 5, 'and it never got its 6 damage in');
  assert.equal(state.sides.a.points, 5 + 4, 'the kill paid its 4-point cost');
  assert.ok(state.log.some((entry) => /never got its blow in/.test(entry.text)));
});

test('swinging at something faster than you is a real risk', () => {
  const state = match();
  const slow = place(state, 'a', card('Lump', { speed: 2, power: 9, hp: 4, cost: 4 }));
  const quick = place(state, 'b', card('Dart', { speed: 9, power: 5, hp: 8, cost: 3 }));

  attack(state, slow.uid, quick.uid);

  assert.equal(state.sides.a.board.length, 0, 'the attacker died on the counter-swing');
  assert.equal(quick.hp, 8, 'having landed nothing');
  assert.equal(state.sides.b.points, 5 + 4, 'and the defender was paid for the kill');
});

test('when neither dies they simply trade', () => {
  const state = match();
  const mine = place(state, 'a', card('Ox', { speed: 6, power: 3, hp: 10 }));
  const theirs = place(state, 'b', card('Yak', { speed: 4, power: 5, hp: 10 }));

  attack(state, mine.uid, theirs.uid);

  assert.equal(theirs.hp, 7, 'hit first for 3');
  assert.equal(mine.hp, 5, 'and hit back for 5');
  assert.equal(state.sides.a.board.length, 1);
  assert.equal(state.sides.b.board.length, 1);
});

test('each card swings once a turn, and both of them get to', () => {
  const state = match();
  const one = place(state, 'a', card('One', { speed: 7, power: 2, hp: 9 }));
  const two = place(state, 'a', card('Two', { speed: 7, power: 2, hp: 9 }));
  const wall = place(state, 'b', card('Wall', { speed: 1, power: 1, hp: 20 }));

  assert.ok(!attack(state, one.uid, wall.uid).error);
  assert.ok(!attack(state, two.uid, wall.uid).error, 'the second card swings too');
  assert.match(attack(state, one.uid, wall.uid).error, /already swung/);
  assert.equal(wall.hp, 16, 'two hits of 2 apiece');
});

test('a card cannot be hit once it is in the graveyard', () => {
  const state = match();
  const mine = place(state, 'a', card('Axe', { speed: 9, power: 20, hp: 9 }));
  const doomed = place(state, 'b', card('Doomed', { speed: 1, power: 1, hp: 3 }));

  attack(state, mine.uid, doomed.uid);
  assert.equal(state.sides.b.graveyard.length, 1);

  mine.attackedThisTurn = false;
  assert.match(attack(state, mine.uid, doomed.uid).error, /Nothing there to hit/);
});

test('a card pulled from the graveyard comes back to hand for nothing', () => {
  const state = match();
  state.sides.a.graveyard.push(instance(card('Titan', { cost: 9, hp: 14 })));

  const back = recallFromGraveyard(state, 'a', 0);
  assert.equal(back.card.cost, 0, 'free, which is the whole point');
  assert.equal(back.card.hp, 14, 'and at full health again');
  assert.equal(state.sides.a.graveyard.length, 0);
  assert.equal(state.sides.a.hand.at(-1).name, 'Titan');

  assert.match(recallFromGraveyard(state, 'a', 0).error, /Nothing there/);
});

test('income arrives from turn two and widens on schedule', () => {
  const state = match();
  const points = [state.sides.a.points];
  for (let i = 0; i < 10; i += 1) {
    endTurn(state);   // to b
    endTurn(state);   // back to a
    points.push(state.sides.a.points);
  }
  assert.deepEqual(points.slice(0, 5), [5, 6, 7, 8, 10], 'turn 1 is the five you start with');
  assert.deepEqual(points.slice(5, 9), [12, 14, 16, 19], 'then 2 a turn, then 3 from turn nine');
});

test('you lose when there is nothing left to knock out', () => {
  const state = match();
  state.sides.b.hand = [];
  state.sides.b.deck = [];
  state.sides.b.board = [];

  const mine = place(state, 'a', card('Last', { speed: 5, power: 9, hp: 9 }));
  const theirs = place(state, 'b', card('Final', { speed: 1, power: 1, hp: 4, cost: 2 }));

  assert.equal(state.over, false, 'they still have one standing');
  attack(state, mine.uid, theirs.uid);

  assert.equal(state.over, true);
  assert.equal(state.winner, 'a');
  assert.match(state.reason, /every card knocked out/);
});


/* ---------------------------------------------------------------- gear */

const boots = { id: 'iron-boots', name: 'Iron Boots', kind: 'gear', cost: 3, boost: { speed: 1 } };
const sword = { id: 'sword', name: 'Sword', kind: 'gear', cost: 5, boost: { power: 2 } };

test('gear is spent, and its boost stays on the card', () => {
  const state = match();
  state.sides.a.points = 20;
  const razor = place(state, 'a', card('Razor', { speed: 5, power: 8, hp: 2 }));
  state.sides.a.hand = [{ ...boots }];

  const played = playGear(state, 0, razor.uid);
  assert.equal(played.target.speed, 6, 'five and one');
  assert.equal(state.sides.a.points, 17, 'and it cost its three');
  assert.equal(state.sides.a.hand.length, 0, 'the gear is out of your hand');
  assert.equal(state.sides.a.graveyard.at(-1).name, 'Iron Boots', 'and into the graveyard');
  assert.equal(razor.speed, 6, 'the card itself keeps the boost');
});

test('a card can be boosted again, and they stack', () => {
  const state = match();
  state.sides.a.points = 30;
  const razor = place(state, 'a', card('Razor', { speed: 5, power: 8, hp: 2 }));
  state.sides.a.hand = [{ ...boots }, { ...sword }, { ...boots }];

  playGear(state, 0, razor.uid);
  playGear(state, 0, razor.uid);
  playGear(state, 0, razor.uid);

  assert.deepEqual([razor.speed, razor.power], [7, 10], 'two boots and a sword');
  assert.equal(razor.boosts, 3);
  assert.equal(state.sides.a.graveyard.length, 3);
});

test('gear goes on your own cards, and only onto something that is there', () => {
  const state = match();
  state.sides.a.points = 20;
  const mine = place(state, 'a', card('Mine'));
  const theirs = place(state, 'b', card('Theirs'));
  state.sides.a.hand = [{ ...sword }, instance(card('NotGear'))];

  assert.match(playGear(state, 0, theirs.uid).error, /your own cards/);
  assert.match(playGear(state, 1, mine.uid).error, /not gear/i);
  assert.ok(!playGear(state, 0, mine.uid).error);
});

test('gear you cannot pay for stays in your hand', () => {
  const state = match();
  state.sides.a.points = 2;
  const mine = place(state, 'a', card('Mine'));
  state.sides.a.hand = [{ ...boots }];

  assert.match(playGear(state, 0, mine.uid).error, /costs 3 - you have 2/);
  assert.equal(state.sides.a.hand.length, 1);
  assert.equal(mine.speed, 5, 'and nothing was boosted');
});

test('a boost can flip a fight that would otherwise be lost', () => {
  const state = match();
  state.sides.a.points = 20;
  // Armoren is slower than Razor and dies to it. One pair of Boots is not
  // enough to fix that - it takes two.
  const armoren = place(state, 'a', card('Armoren', { speed: 3, power: 3, hp: 7 }));
  const razor = place(state, 'b', card('Razor', { speed: 5, power: 8, hp: 2, cost: 5 }));
  state.sides.a.hand = [{ ...boots }, { ...boots }, { ...boots }];

  playGear(state, 0, armoren.uid);
  playGear(state, 0, armoren.uid);
  playGear(state, 0, armoren.uid);
  assert.equal(armoren.speed, 6, 'now the faster of the two');

  attack(state, armoren.uid, razor.uid);
  assert.equal(state.sides.b.board.length, 0, 'and it kills the Razor first');
  assert.equal(armoren.hp, 7, 'without taking the 8 back');
});

/* ------------------------------------------------------------- supports */

test('Patch Up heals, and never past full', () => {
  const state = match();
  const mine = place(state, 'a', card('Ox', { hp: 10 }));
  mine.hp = 3;

  applySupport(state, 'a', getSupport('patch-up'), mine.uid);
  assert.equal(mine.hp, 7, 'three and four');

  applySupport(state, 'a', getSupport('patch-up'), mine.uid);
  assert.equal(mine.hp, 10, 'and it stops at full');

  const theirs = place(state, 'b', card('Yak'));
  assert.match(applySupport(state, 'a', getSupport('patch-up'), theirs.uid).error, /your own cards/);
});

test('Hex Bolt kills without anything of yours going near it', () => {
  const state = match();
  const theirs = place(state, 'b', card('Frail', { hp: 3, cost: 4 }));
  const pointsBefore = state.sides.a.points;

  applySupport(state, 'a', getSupport('hex-bolt'), theirs.uid);

  assert.equal(state.sides.b.board.length, 0, 'three damage was enough');
  assert.equal(state.sides.b.graveyard.length, 1);
  assert.equal(state.sides.a.points, pointsBefore + 4, 'and a bolt pays the bounty just as a swing does');
});

test('Sidestep steals the first swing, and only for the turn', () => {
  const state = match();
  const slow = place(state, 'a', card('Armoren', { speed: 3, power: 3, hp: 7 }));
  place(state, 'b', card('Razor', { speed: 5, power: 8, hp: 2 }));

  applySupport(state, 'a', getSupport('sidestep'), slow.uid);
  assert.equal(slow.speed, 7, 'three and four, for now');

  endTurn(state);   // to b
  endTurn(state);   // back to a
  assert.equal(slow.speed, 3, 'and it wears off');
});

test('Iron Will lets a card live through what should have finished it', () => {
  const state = match();
  const mine = place(state, 'a', card('Hiver', { speed: 8, power: 6, hp: 4 }));
  const theirs = place(state, 'b', card('Gorewing', { speed: 7, power: 9, hp: 5 }));

  applySupport(state, 'a', getSupport('iron-will'), mine.uid);
  assert.deepEqual([mine.hp, mine.maxHp], [7, 7], 'and it stays - this one is not just for the turn');

  attack(state, mine.uid, theirs.uid);
  assert.equal(state.sides.b.board.length, 0, 'the Hiver is faster and 6 kills a 5hp Gorewing');
  assert.equal(mine.hp, 7, 'and it never had to survive anything');
});

test('the five commons are five real supports, two of them instants', () => {
  assert.equal(SUPPORTS.length, 5);
  for (const support of SUPPORTS) {
    assert.ok(support.name && support.blurb, `${support.id} says what it is`);
    assert.ok(['turn', 'instant'].includes(support.timing));
    assert.ok(support.effect?.kind, `${support.id} does something`);
  }
  assert.deepEqual(instantSupports().map((s) => s.id), ['sidestep', 'iron-will']);
});

test('a hand of nothing but gear is a loss, not a stalemate', () => {
  const state = match();
  // Everything gone except gear, which cannot take the field on its own.
  state.sides.b.board = [];
  state.sides.b.deck = [];
  state.sides.b.hand = [{ ...sword }, { ...boots }];
  state.sides.a.board = [place(state, 'a', card('Last'))];

  checkOver(state);
  assert.equal(state.over, true, 'there is nothing left to knock out');
  assert.equal(state.winner, 'a');
});

test('a match that nobody will finish gets called', () => {
  const state = match();
  // Two full boards and neither side willing to swing: without a backstop this
  // runs forever.
  place(state, 'a', card('Standoff1', { hp: 99 }));
  place(state, 'b', card('Standoff2', { hp: 99 }));
  state.sides.a.kills = 4;
  state.sides.b.kills = 1;
  state.sides.a.turn = TURN_LIMIT + 1;

  checkOver(state);
  assert.equal(state.over, true);
  assert.equal(state.winner, 'a', 'most kills takes it');
  assert.match(state.reason, /nobody would commit/);
});

/* -------------------------------------------------------------- drawing */

test('a board draws without handing the canvas nonsense', () => {
  const ctx = createFakeContext();
  const state = match();
  const mine = place(state, 'a', card('Zaplin', { hp: 8, power: 8, speed: 8 }));
  mine.evolvesTo = 'bolter';
  mine.evolvesAfter = 1;
  mine.hp = 5;
  place(state, 'b', card('Tank', { hp: 12, power: 7, speed: 2 }));

  drawBackdrop(ctx, 960, 540, 1.5);
  drawSideBar(ctx, state.sides.a, 18, 10, 420, { name: 'You', active: true, align: 'right' });
  drawCard(ctx, mine, 367, 252, { hp: mine.hp, maxHp: mine.maxHp, picked: true, evolvesIn: 1 });
  drawCard(ctx, state.sides.b.board[0], 367, 44, { hp: 12, maxHp: 12, targetable: true });
  drawCard(ctx, { id: 'sword', name: 'Sword', kind: 'gear', rarity: 'common', cost: 5, boost: { power: 2 } }, 489, 44, {});
  drawSlot(ctx, 489, 252, 'your side');
  drawLog(ctx, state.log, 18, 190, 316, 68);

  assert.ok(ctx.calls > 40, 'it actually drew something');
});
