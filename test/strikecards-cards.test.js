import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, KINDS, equipped, getCard, strikersOf } from '../src/games/strikecards/cards.js';
import { RARITY_IDS } from '../src/games/strikecards/collection.js';
import { CARD_FIELDS } from '../src/games/strikecards/rules.js';

test('every card is one of the two kinds and a real rarity', () => {
  for (const card of CARDS) {
    assert.ok(card.id && card.name, 'it has a name');
    assert.ok(card.kind in KINDS, `${card.name} is a striker or gear`);
    assert.ok(RARITY_IDS.includes(card.rarity), `${card.name} has a real rarity`);
    assert.ok(card.cost > 0, `${card.name} costs something`);
  }
  // No two cards share an id.
  assert.equal(new Set(CARDS.map((c) => c.id)).size, CARDS.length);
});

test('a striker carries everything the battle asks a card for', () => {
  for (const card of CARDS.filter((c) => c.kind === 'strike')) {
    for (const field of CARD_FIELDS) {
      assert.ok(card[field] !== undefined, `${card.name} has a ${field}`);
    }
    assert.ok(card.speed > 0 && card.power > 0 && card.hp > 0, `${card.name}'s numbers are real`);
  }
});

test('the three commons are the numbers you gave', () => {
  const hiver = getCard('hiver');
  assert.deepEqual([hiver.cost, hiver.hp, hiver.power, hiver.speed], [4, 4, 6, 8]);

  const armoren = getCard('armoren');
  assert.deepEqual([armoren.cost, armoren.hp, armoren.power, armoren.speed], [4, 7, 3, 3]);

  const razor = getCard('razor');
  assert.deepEqual([razor.cost, razor.hp, razor.power, razor.speed], [5, 2, 8, 5]);

  assert.equal(strikersOf('common').length, 3);
});

test('gear has no body of its own, only a boost', () => {
  const boots = getCard('iron-boots');
  assert.equal(boots.kind, 'gear');
  assert.equal(boots.cost, 3);
  assert.deepEqual(boots.boost, { speed: 1 });
  assert.equal(boots.hp, undefined, 'gear does not take the field by itself');

  const sword = getCard('sword');
  assert.equal(sword.cost, 5);
  assert.deepEqual(sword.boost, { power: 2 });
});

test('a striker wearing gear fights with the better numbers', () => {
  const razor = getCard('razor');
  const boots = getCard('iron-boots');
  const sword = getCard('sword');

  const booted = equipped(razor, [boots]);
  assert.equal(booted.speed, 6, 'five and one');
  assert.equal(booted.power, 8, 'and nothing else moved');

  const armed = equipped(razor, [sword]);
  assert.equal(armed.power, 10);

  const both = equipped(razor, [boots, sword]);
  assert.deepEqual([both.speed, both.power, both.hp], [6, 10, 2]);
  assert.deepEqual(both.gear, ['iron-boots', 'sword']);

  assert.equal(razor.speed, 5, 'and the printed card is untouched');
  assert.equal(equipped(razor).speed, 5, 'as is one wearing nothing');
});
