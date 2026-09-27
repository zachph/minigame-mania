import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, endTurn, evolveIfReady, instance, playGear } from '../src/games/strikecards/battle.js';
import { getCard } from '../src/games/strikecards/cards.js';
import { seededRandom } from '../src/core/utils.js';

const match = () => createMatch({
  decks: { a: [getCard('nipper')], b: [getCard('nipper')] },
  random: seededRandom(3),
});

/** Puts a card on a board past the cost and the turn limit. */
function place(state, which, id) {
  const made = instance(getCard(id));
  state.sides[which].board.push(made);
  return made;
}

test('Zaplin becomes a Bolter after one turn, and a Stormbeat after three more', () => {
  const state = match();
  const zaplin = place(state, 'a', 'zaplin');
  assert.deepEqual([zaplin.hp, zaplin.power, zaplin.speed], [8, 8, 8]);

  zaplin.turnsOnBoard = 1;
  assert.equal(evolveIfReady(state, zaplin), true);
  assert.equal(zaplin.name, 'Bolter');
  assert.deepEqual([zaplin.hp, zaplin.power, zaplin.speed], [10, 8, 10]);

  zaplin.turnsOnBoard = 2;
  assert.equal(evolveIfReady(state, zaplin), false, 'three turns means three');
  zaplin.turnsOnBoard = 3;
  assert.equal(evolveIfReady(state, zaplin), true);
  assert.equal(zaplin.name, 'Stormbeat');
  assert.deepEqual([zaplin.hp, zaplin.power, zaplin.speed], [12, 12, 12]);

  zaplin.turnsOnBoard = 99;
  assert.equal(evolveIfReady(state, zaplin), false, 'and that is the end of the chain');
});

test('damage carries across, so growing is not a free heal', () => {
  const state = match();
  const zaplin = place(state, 'a', 'zaplin');
  zaplin.hp = 5;                        // three of its eight gone

  zaplin.turnsOnBoard = 1;
  evolveIfReady(state, zaplin);
  assert.equal(zaplin.maxHp, 10);
  assert.equal(zaplin.hp, 7, 'it was 3 down as a Zaplin and it is 3 down as a Bolter');
});

test('gear rides along through the change', () => {
  const state = match();
  state.sides.a.points = 20;
  const zaplin = place(state, 'a', 'zaplin');
  state.sides.a.hand = [{ ...getCard('spurs') }, { ...getCard('greatshield') }];

  playGear(state, 0, zaplin.uid);       // +2 speed
  playGear(state, 0, zaplin.uid);       // +4 hp
  assert.deepEqual([zaplin.speed, zaplin.maxHp], [10, 12]);

  zaplin.turnsOnBoard = 1;
  evolveIfReady(state, zaplin);
  assert.equal(zaplin.name, 'Bolter');
  assert.equal(zaplin.speed, 12, "the Bolter's 10 plus the Spurs it was already wearing");
  assert.equal(zaplin.maxHp, 14, "and the Bolter's 10 plus the Greatshield");
});

test('it grows on its own, a turn at a time, without anyone asking', () => {
  const state = match();
  const zaplin = place(state, 'a', 'zaplin');

  endTurn(state);   // to b
  endTurn(state);   // back to a - one turn survived
  assert.equal(zaplin.name, 'Bolter');

  for (let i = 0; i < 3; i += 1) { endTurn(state); endTurn(state); }
  assert.equal(zaplin.name, 'Stormbeat');
});

test('the grown forms are not things a pack can give you', () => {
  assert.equal(getCard('bolter').form, true);
  assert.equal(getCard('stormbeat').form, true);
  assert.equal(getCard('zaplin').form, undefined, 'only the first one is a real card');
});
