import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/core/utils.js';
import {
  applySupport,
  attack,
  beginTurn,
  createMatch,
  endTurn,
  instance,
  needsNoTarget,
  needsTwoTargets,
} from '../src/games/strikecards/battle.js';
import { getCard } from '../src/games/strikecards/cards.js';
import { getSupport, instantSupports, SUPPORTS } from '../src/games/strikecards/supports.js';
import { canPlaySupport } from '../src/games/strikecards/rules.js';

const card = (name, { cost = 3, speed = 5, power = 4, hp = 6 } = {}) =>
  ({ id: name.toLowerCase(), name, rarity: 'common', cost, speed, power, hp });

const match = (overrides = {}) => createMatch({
  decks: {
    a: Array.from({ length: 20 }, (_, i) => card(`A${i}`)),
    b: Array.from({ length: 20 }, (_, i) => card(`B${i}`)),
  },
  random: seededRandom(11),
  ...overrides,
});

function place(state, which, spec) {
  const made = instance(spec);
  state.sides[which].board.push(made);
  return made;
}

/* ---------------------------------------------------------- Second Wind */

test('Second Wind puts two cards in your hand', () => {
  const state = match();
  const before = state.sides.a.hand.length;
  const result = applySupport(state, 'a', getSupport('second-wind'));
  assert.equal(result.drawn, 2);
  assert.equal(state.sides.a.hand.length, before + 2);
});

test('Second Wind on an empty deck comes up short rather than failing', () => {
  const state = match();
  state.sides.a.deck.length = 0;
  const result = applySupport(state, 'a', getSupport('second-wind'));
  assert.equal(result.drawn, 0);
  assert.ok(!result.error, 'the card was spent either way; an error helps nobody');
});

test('Second Wind takes a card off the top of your own deck, not theirs', () => {
  const state = match();
  const theirs = state.sides.b.deck.length;
  applySupport(state, 'a', getSupport('second-wind'));
  assert.equal(state.sides.b.deck.length, theirs);
});

/* ----------------------------------------------------------- Dead Weight */

test('Dead Weight takes speed off one of theirs', () => {
  const state = match();
  const target = place(state, 'b', card('Quick', { speed: 9 }));
  applySupport(state, 'a', getSupport('dead-weight'), target.uid);
  assert.equal(target.speed, 4);
});

test('Dead Weight wears off when the turn does', () => {
  const state = match();
  const target = place(state, 'b', card('Quick', { speed: 9 }));
  applySupport(state, 'a', getSupport('dead-weight'), target.uid);
  assert.equal(target.speed, 4);
  endTurn(state);
  assert.equal(target.speed, 9, 'it should not still be slowing them on the next turn');
});

test('Dead Weight is for theirs, and says so if you aim it at your own', () => {
  const state = match();
  const mine = place(state, 'a', card('Mine'));
  const result = applySupport(state, 'a', getSupport('dead-weight'), mine.uid);
  assert.match(result.error, /for theirs/);
  assert.equal(mine.speed, 5, 'and it did nothing');
});

test('a debuff is written with a minus, not a plus-minus', () => {
  const state = match();
  const target = place(state, 'b', card('Quick', { speed: 9 }));
  applySupport(state, 'a', getSupport('dead-weight'), target.uid);
  const line = state.log.at(-1).text;
  assert.ok(!line.includes('+-'), `the log read "${line}"`);
  assert.match(line, /-5 speed/);
});

test('Dead Weight decides who swings first, the same as Sidestep does', () => {
  const state = match();
  const mine = place(state, 'a', card('Mine', { speed: 5, power: 9, hp: 9 }));
  const theirs = place(state, 'b', card('Theirs', { speed: 7, power: 9, hp: 9 }));
  applySupport(state, 'a', getSupport('dead-weight'), theirs.uid);
  assert.ok(mine.speed > theirs.speed, 'yours is now the faster card');
  attack(state, mine.uid, theirs.uid);
  assert.equal(state.sides.b.board.length, 0, 'and it got its blow in first');
  assert.equal(mine.hp, 9, 'without taking one back');
});

/* --------------------------------------------------------------- Warcry */

test('Warcry lifts everything you have out', () => {
  const state = match();
  const one = place(state, 'a', card('One', { power: 4 }));
  const two = place(state, 'a', card('Two', { power: 6 }));
  const theirs = place(state, 'b', card('Theirs', { power: 4 }));
  const result = applySupport(state, 'a', getSupport('warcry'));
  assert.equal(result.count, 2);
  assert.equal(one.power, 6);
  assert.equal(two.power, 8);
  assert.equal(theirs.power, 4, 'and nothing of theirs');
});

test('Warcry on an empty board tells you so instead of being wasted silently', () => {
  const state = match();
  const result = applySupport(state, 'a', getSupport('warcry'));
  assert.match(result.error, /Nothing out/);
});

test('Warcry lasts the match, not the turn', () => {
  const state = match();
  const mine = place(state, 'a', card('Mine', { power: 4 }));
  applySupport(state, 'a', getSupport('warcry'));
  endTurn(state);
  endTurn(state);
  assert.equal(mine.power, 6, 'it should still be lifted two turns later');
});

test('Warcry needs nothing to aim at', () => {
  assert.equal(needsNoTarget(getSupport('warcry').effect), true);
  assert.equal(needsNoTarget(getSupport('second-wind').effect), true);
  assert.equal(needsNoTarget(getSupport('grave-call').effect), true);
  assert.equal(needsNoTarget(getSupport('patch-up').effect), false);
});

/* ----------------------------------------------------------- Last Stand */

test('Last Stand holds a card on 1 instead of letting it go down', () => {
  const state = match();
  const mine = place(state, 'a', card('Mine', { hp: 3, speed: 1, power: 4 }));
  const theirs = place(state, 'b', card('Theirs', { hp: 9, speed: 9, power: 9 }));
  applySupport(state, 'a', getSupport('last-stand'), mine.uid);
  attack(state, mine.uid, theirs.uid);
  assert.equal(mine.hp, 1, 'it held on');
  assert.ok(state.sides.a.board.includes(mine), 'and it is still on the board');
});

test('and because it held on, it swings back - which is the whole point', () => {
  const state = match();
  const mine = place(state, 'a', card('Mine', { hp: 3, speed: 1, power: 4 }));
  const theirs = place(state, 'b', card('Theirs', { hp: 9, speed: 9, power: 9 }));
  applySupport(state, 'a', getSupport('last-stand'), mine.uid);
  attack(state, mine.uid, theirs.uid);
  assert.equal(theirs.hp, 5, 'the kill they lined up became a trade');
});

test('Last Stand saves once, not twice', () => {
  const state = match();
  const mine = place(state, 'a', card('Mine', { hp: 2, speed: 1, power: 1 }));
  const first = place(state, 'b', card('First', { hp: 9, speed: 9, power: 9 }));
  applySupport(state, 'a', getSupport('last-stand'), mine.uid);
  attack(state, mine.uid, first.uid);
  assert.equal(mine.hp, 1);

  endTurn(state);
  endTurn(state);
  const second = place(state, 'b', card('Second', { hp: 9, speed: 9, power: 9 }));
  attack(state, mine.uid, second.uid);
  assert.equal(state.sides.a.board.includes(mine), false, 'the second one went through');
});

test('Last Stand runs out when the turn does', () => {
  const state = match();
  const mine = place(state, 'a', card('Mine', { hp: 3 }));
  applySupport(state, 'a', getSupport('last-stand'), mine.uid);
  assert.equal(mine.shielded, true);
  endTurn(state);
  assert.equal(mine.shielded, false);
});

test('a support bolt cannot sneak past Last Stand either', () => {
  const state = match();
  const mine = place(state, 'a', card('Mine', { hp: 2 }));
  applySupport(state, 'a', getSupport('last-stand'), mine.uid);
  applySupport(state, 'b', getSupport('hex-bolt'), mine.uid);
  assert.equal(mine.hp, 1, 'it held on against the bolt too');
  assert.ok(state.sides.a.board.includes(mine));
});

test('Last Stand is for your own cards', () => {
  const state = match();
  const theirs = place(state, 'b', card('Theirs'));
  assert.match(applySupport(state, 'a', getSupport('last-stand'), theirs.uid).error, /your own/);
});

/* ------------------------------------------------------------- the shape */

test('the two new instants can be played when it is not your turn', () => {
  for (const id of ['dead-weight', 'last-stand']) {
    const support = getSupport(id);
    assert.equal(support.timing, 'instant');
    assert.equal(canPlaySupport(support, { isYourTurn: false }), true, `${id} should be playable off-turn`);
  }
});

test('the two new turn cards cannot', () => {
  for (const id of ['second-wind', 'warcry']) {
    const support = getSupport(id);
    assert.equal(canPlaySupport(support, { isYourTurn: false }), false, `${id} should wait for your turn`);
    assert.equal(canPlaySupport(support, { isYourTurn: true }), true);
  }
});

test('supports now span more than one rarity, so a support pack can pay out', () => {
  const tiers = new Set(SUPPORTS.map((support) => support.rarity));
  assert.ok(tiers.size > 1, 'every support being common made support packs pointless');
});

test('aiming a support at nothing says so rather than throwing', () => {
  const state = match();
  for (const id of ['patch-up', 'hex-bolt', 'last-stand', 'dead-weight']) {
    const result = applySupport(state, 'a', getSupport(id), 'no-such-card');
    assert.match(result.error, /Nothing there to aim it at/, `${id} should have said so`);
  }
});

test('every instant still declares itself an instant', () => {
  for (const support of instantSupports()) assert.equal(support.timing, 'instant');
});

test('beginTurn clears a shield on either board, not just the active one', () => {
  const state = match();
  const mine = place(state, 'a', card('Mine'));
  const theirs = place(state, 'b', card('Theirs'));
  mine.shielded = true;
  theirs.shielded = true;
  beginTurn(state);
  assert.equal(mine.shielded, false);
  assert.equal(theirs.shielded, false);
});

/* ------------------------------------------------------------------ 1 Up */

test('1 Up hands back the first card of yours to go down', () => {
  const state = match();
  const mine = place(state, 'a', card('Mine', { hp: 3, speed: 1, power: 2 }));
  const theirs = place(state, 'b', card('Theirs', { hp: 9, speed: 9, power: 9 }));
  applySupport(state, 'a', getSupport('one-up'));
  attack(state, mine.uid, theirs.uid);
  assert.ok(state.sides.a.board.includes(mine), 'it is still out');
  assert.equal(mine.hp, mine.maxHp, 'and it came back whole');
});

test('1 Up costs them the kill and the bounty too', () => {
  const state = match();
  const mine = place(state, 'a', card('Mine', { hp: 3, speed: 1, power: 2, cost: 7 }));
  const theirs = place(state, 'b', card('Theirs', { hp: 9, speed: 9, power: 9 }));
  const points = state.sides.b.points;
  applySupport(state, 'a', getSupport('one-up'));
  attack(state, mine.uid, theirs.uid);
  assert.equal(state.sides.b.kills, 0, 'nothing was knocked out');
  assert.equal(state.sides.b.points, points, 'so nothing was paid for it');
  assert.equal(state.sides.a.graveyard.length, 0);
});

test('1 Up is the first card only, not every card', () => {
  const state = match();
  const one = place(state, 'a', card('One', { hp: 2, speed: 1, power: 1 }));
  const two = place(state, 'a', card('Two', { hp: 2, speed: 1, power: 1 }));
  const theirs = place(state, 'b', card('Theirs', { hp: 20, speed: 9, power: 9 }));
  applySupport(state, 'a', getSupport('one-up'));
  attack(state, one.uid, theirs.uid);
  attack(state, two.uid, theirs.uid);
  assert.ok(state.sides.a.board.includes(one), 'the first one came back');
  assert.ok(!state.sides.a.board.includes(two), 'the second one did not');
});

test('1 Up runs out when the turn does', () => {
  const state = match();
  applySupport(state, 'a', getSupport('one-up'));
  assert.equal(state.sides.a.oneUp, true);
  endTurn(state);
  assert.equal(state.sides.a.oneUp, false);
});

test('1 Up needs nothing to aim at, and is an instant', () => {
  assert.equal(needsNoTarget(getSupport('one-up').effect), true);
  assert.equal(getSupport('one-up').timing, 'instant');
});

/* ------------------------------------------------------------------ Turbo */

test('Turbo lets a card swing a second time', () => {
  const state = match();
  const mine = place(state, 'a', card('Mine', { speed: 9, power: 4, hp: 9 }));
  const theirs = place(state, 'b', card('Theirs', { speed: 1, power: 1, hp: 20 }));
  attack(state, mine.uid, theirs.uid);
  assert.equal(attack(state, mine.uid, theirs.uid).error, 'Mine has already swung this turn.');
  applySupport(state, 'a', getSupport('turbo'), mine.uid);
  const second = attack(state, mine.uid, theirs.uid);
  assert.ok(!second.error, 'it went again');
  assert.equal(theirs.hp, 12, 'two swings of 4 off twenty');
});

test('Turbo on a card that has not swung says so', () => {
  const state = match();
  const mine = place(state, 'a', card('Mine'));
  assert.match(applySupport(state, 'a', getSupport('turbo'), mine.uid).error, /has not swung/);
});

/* --------------------------------------------------------- Chronos Glitch */

test('Chronos Glitch grows a card up on the spot', () => {
  const state = match();
  const zaplin = place(state, 'a', getCard('zaplin'));
  assert.ok(zaplin.evolvesTo, 'it had somewhere to grow');
  assert.equal(zaplin.turnsOnBoard, 0, 'and had only just arrived');
  applySupport(state, 'a', getSupport('chronos-glitch'), zaplin.uid);
  assert.equal(zaplin.name, 'Bolter');
});

test('Chronos Glitch on something that cannot grow says so', () => {
  const state = match();
  const plain = place(state, 'a', card('Plain'));
  assert.match(applySupport(state, 'a', getSupport('chronos-glitch'), plain.uid).error, /nothing to grow into/);
});

test('Chronos Glitch keeps the damage a card has already taken', () => {
  const state = match();
  const zaplin = place(state, 'a', getCard('zaplin'));
  zaplin.hp = zaplin.maxHp - 3;
  applySupport(state, 'a', getSupport('chronos-glitch'), zaplin.uid);
  assert.equal(zaplin.hp, zaplin.maxHp - 3, 'growing up is not a heal');
});

/* ---------------------------------------------------------- Portal Switch */

test('Portal Switch trades a card of theirs for one of yours', () => {
  const state = match();
  const mine = place(state, 'a', card('Mine', { cost: 6 }));
  const theirs = place(state, 'b', card('Theirs', { cost: 5 }));
  const result = applySupport(state, 'a', getSupport('portal-switch'), theirs.uid, mine.uid);
  assert.ok(!result.error, result.error);
  assert.ok(state.sides.a.board.includes(theirs), 'theirs came over');
  assert.ok(state.sides.b.board.includes(mine), 'and yours went across');
  assert.equal(state.sides.a.board.length, 1);
  assert.equal(state.sides.b.board.length, 1);
});

test('Portal Switch cannot hand you something worth more than you gave', () => {
  const state = match();
  const mine = place(state, 'a', card('Cheap', { cost: 3 }));
  const theirs = place(state, 'b', card('Huge', { cost: 9 }));
  const result = applySupport(state, 'a', getSupport('portal-switch'), theirs.uid, mine.uid);
  assert.match(result.error, /cannot take it for a 3/);
  assert.ok(state.sides.a.board.includes(mine), 'nothing moved');
  assert.ok(state.sides.b.board.includes(theirs));
});

test('an even trade is allowed', () => {
  const state = match();
  const mine = place(state, 'a', card('Mine', { cost: 5 }));
  const theirs = place(state, 'b', card('Theirs', { cost: 5 }));
  assert.ok(!applySupport(state, 'a', getSupport('portal-switch'), theirs.uid, mine.uid).error);
});

test('Portal Switch needs one of each, the right way round', () => {
  const state = match();
  const one = place(state, 'a', card('One'));
  const two = place(state, 'a', card('Two'));
  assert.match(applySupport(state, 'a', getSupport('portal-switch'), one.uid, two.uid).error, /one of theirs/);

  const theirs = place(state, 'b', card('Theirs'));
  assert.match(applySupport(state, 'a', getSupport('portal-switch'), theirs.uid, theirs.uid).error, /one of yours/);
  assert.match(applySupport(state, 'a', getSupport('portal-switch'), theirs.uid).error, /Pick one of theirs/);
});

test('Portal Switch is the one support that wants two picks', () => {
  assert.equal(needsTwoTargets(getSupport('portal-switch').effect), true);
  for (const id of ['patch-up', 'turbo', 'one-up', 'golden-roll']) {
    assert.equal(needsTwoTargets(getSupport(id).effect), false, `${id} should want one pick or none`);
  }
});

/* ------------------------------------------------------------ Golden Roll */

test('Golden Roll pays you points without killing anything', () => {
  const state = match();
  const before = state.sides.a.points;
  const result = applySupport(state, 'a', getSupport('golden-roll'));
  assert.equal(result.points, 5);
  assert.equal(state.sides.a.points, before + 5);
  assert.equal(state.sides.b.points, state.sides.b.points, 'and pays them nothing');
});

/* ------------------------------------------------------------- the roster */

test('the roster is fifteen supports with five instants, as the rules say', () => {
  assert.equal(SUPPORTS.length <= 15, true);
  assert.equal(instantSupports().length, 5, 'the five off-turn cards are all accounted for');
});

test('every tier has a support in it, so a support pack can pay out anything', () => {
  const tiers = new Set(SUPPORTS.map((support) => support.rarity));
  for (const id of ['common', 'uncommon', 'rare', 'epic', 'legendary']) {
    assert.ok(tiers.has(id), `nothing in the ${id} tier`);
  }
});
