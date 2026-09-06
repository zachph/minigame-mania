import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, ROSTER, TEAM_SIZE, charactersOfType, getCharacter } from '../src/games/catchmon/roster.js';
import { MOVES, getMove } from '../src/games/catchmon/moves.js';
import { TYPE_IDS } from '../src/games/catchmon/types.js';

test('the roster is thirty fighters, five of each type', () => {
  assert.equal(ROSTER.length, 30);
  for (const type of TYPE_IDS) {
    assert.equal(charactersOfType(type).length, 5, `${type} has five fighters`);
  }
});

test('ids and names are unique', () => {
  assert.equal(new Set(ROSTER.map((c) => c.id)).size, 30);
  assert.equal(new Set(ROSTER.map((c) => c.name)).size, 30);
});

test('every fighter is a final evolution and names what it evolved from', () => {
  for (const character of ROSTER) {
    assert.equal(character.stage, 'final', `${character.name} is a final evolution`);
    assert.ok(character.evolvesFrom?.length > 2, `${character.name} names its earlier form`);
    assert.notEqual(character.evolvesFrom, character.name);
    assert.ok(character.blurb.length > 20, `${character.name} has flavour text`);
  }
});

test('each type fields one of every role', () => {
  const roleIds = Object.keys(ROLES);
  for (const type of TYPE_IDS) {
    const roles = charactersOfType(type).map((c) => c.role).sort();
    assert.deepEqual(roles, [...roleIds].sort(), `${type} covers every role`);
  }
});

test('everyone knows four usable moves, and typed moves match their own type', () => {
  for (const character of ROSTER) {
    assert.equal(character.moves.length, 4, `${character.name} knows four moves`);
    assert.equal(new Set(character.moves).size, 4, `${character.name} has no duplicates`);
    const moves = character.moves.map(getMove);
    for (const move of moves) {
      if (move.type) assert.equal(move.type, character.type, `${character.name} only uses its own type`);
    }
    assert.ok(moves.some((move) => move.power > 0 && move.cooldown === 0),
      `${character.name} always has an attack available`);
  }
});

test('no move in the pool goes unused', () => {
  const used = new Set(ROSTER.flatMap((character) => character.moves));
  const unused = MOVES.filter((move) => !used.has(move.id)).map((move) => move.id);
  assert.deepEqual(unused, [], 'every move is on someone');
});

test('every fighter spends the same stat budget, so none is strictly better', () => {
  const totals = new Set(ROSTER.map((c) => c.power));
  assert.equal(totals.size, 1, `stat totals: ${[...totals].join(', ')}`);
  for (const character of ROSTER) {
    for (const [stat, value] of Object.entries(character.stats)) {
      assert.ok(value > 30 && value < 170, `${character.name} ${stat} = ${value}`);
    }
  }
});

test('roles keep their identity', () => {
  for (const character of ROSTER) {
    const base = ROLES[character.role].base;
    for (const stat of ['hp', 'atk', 'def', 'spd']) {
      assert.ok(Math.abs(character.stats[stat] - base[stat]) <= 10,
        `${character.name} ${stat} is close to its ${character.role} template`);
    }
  }
});

test('getCharacter throws on nonsense and a team is three strong', () => {
  assert.equal(getCharacter('pyrothane').name, 'Pyrothane');
  assert.throws(() => getCharacter('nope'), /Unknown character/);
  assert.equal(TEAM_SIZE, 3);
});
