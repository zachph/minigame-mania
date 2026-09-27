import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseCard, chooseGear, chooseTarget, previewSwing, scoreSwing } from '../src/games/strikecards/ai.js';

const card = (name, { cost = 3, speed = 5, power = 4, hp = 6 } = {}) =>
  ({ uid: name, id: name.toLowerCase(), name, kind: 'strike', cost, speed, power, hp });

test('it can see how a swing would go before taking it', () => {
  const quick = card('Quick', { speed: 9, power: 7 });
  const frail = card('Frail', { speed: 2, power: 6, hp: 5 });

  const clean = previewSwing(quick, frail);
  assert.equal(clean.theyDie, true);
  assert.equal(clean.iDie, false, 'it dies before it swings back');

  // The other way round, Frail walks into a card that goes first and hits
  // harder than it has health - so it dies without landing anything.
  const backwards = previewSwing(frail, quick);
  assert.equal(backwards.iDie, true);
  assert.equal(backwards.theyDie, false, 'and Quick is untouched');
});

test('a tie on speed is assumed to go badly', () => {
  const mine = card('Mine', { speed: 5, power: 3, hp: 4 });
  const theirs = card('Theirs', { speed: 5, power: 9, hp: 9 });
  const swing = previewSwing(mine, theirs);
  assert.equal(swing.iDie, true, 'on a coin flip it plans for losing it');
});

test('it takes the kill, and prefers the expensive one', () => {
  const mine = card('Mine', { speed: 9, power: 6, hp: 8 });
  const cheap = card('Cheap', { speed: 1, power: 1, hp: 3, cost: 2 });
  const dear = card('Dear', { speed: 1, power: 1, hp: 3, cost: 8 });
  const tough = card('Tough', { speed: 1, power: 1, hp: 30, cost: 9 });

  const target = chooseTarget(mine, [cheap, dear, tough]);
  assert.equal(target.name, 'Dear', 'the costliest thing it can actually finish');
  assert.ok(scoreSwing(mine, dear) > scoreSwing(mine, cheap));
  assert.ok(scoreSwing(mine, dear) > scoreSwing(mine, tough), 'and not the one it cannot kill');
});

test('it will not throw a card into a swing that kills it for nothing', () => {
  const mine = card('Mine', { speed: 2, power: 2, hp: 4, cost: 6 });
  const killer = card('Killer', { speed: 9, power: 9, hp: 20, cost: 2 });

  assert.ok(scoreSwing(mine, killer) < 0, 'that trade is terrible');
  assert.equal(chooseTarget(mine, [killer]), null, 'so it holds the card back');
});

test('but it will trade a cheap card for an expensive kill', () => {
  const chaff = card('Chaff', { speed: 6, power: 9, hp: 2, cost: 2 });
  const prize = card('Prize', { speed: 5, power: 9, hp: 8, cost: 9 });
  // Chaff is faster: it lands 9 into 8hp and kills the Prize outright.
  assert.ok(scoreSwing(chaff, prize) > 0);
  assert.equal(chooseTarget(chaff, [prize]).name, 'Prize');
});

test('it spends its points on the biggest thing it can field', () => {
  const side = {
    points: 6,
    board: [],
    cardsPlayedThisTurn: 0,
    hand: [card('Small', { cost: 2 }), card('Big', { cost: 6 }), card('Huge', { cost: 9 })],
  };
  assert.equal(side.hand[chooseCard(side)].name, 'Big', 'the most it can afford, not the most it owns');

  side.points = 3;
  assert.equal(side.hand[chooseCard(side)].name, 'Small');

  side.points = 1;
  assert.equal(chooseCard(side), -1, 'and nothing at all when it cannot pay');
});

test('gear goes on the healthiest thing out, or nowhere', () => {
  const boots = { id: 'iron-boots', name: 'Iron Boots', kind: 'gear', cost: 3, boost: { speed: 1 } };
  const hurt = { ...card('Hurt'), hp: 1 };
  const hale = { ...card('Hale'), hp: 9 };

  const side = { points: 5, board: [hurt, hale], hand: [boots], cardsPlayedThisTurn: 0 };
  assert.equal(chooseGear(side).targetUid, 'Hale', 'the one most likely to still be there next turn');

  assert.equal(chooseGear({ ...side, board: [] }), null, 'nothing out, nowhere to put it');
  assert.equal(chooseGear({ ...side, points: 1 }), null, 'and it will not buy what it cannot pay for');
});
