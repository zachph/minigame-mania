import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, makeRng } from '../src/games/catchmon/battle.js';
import { chooseAction, chooseReplacement, draftTeam, randomTeam } from '../src/games/catchmon/ai.js';
import { ROSTER, TEAM_SIZE, getCharacter } from '../src/games/catchmon/roster.js';

const team = (...ids) => ids.map(getCharacter);

test('the rival drafts three distinct fighters with no repeated type or role', () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const drafted = draftTeam(makeRng(seed));
    assert.equal(drafted.length, TEAM_SIZE);
    assert.equal(new Set(drafted.map((c) => c.id)).size, TEAM_SIZE);
    assert.equal(new Set(drafted.map((c) => c.type)).size, TEAM_SIZE, 'three different types');
    assert.equal(new Set(drafted.map((c) => c.role)).size, TEAM_SIZE, 'three different roles');
    for (const character of drafted) assert.ok(ROSTER.includes(character));
  }
});

test('randomTeam honours exclusions', () => {
  const picked = randomTeam(makeRng(5), ['pyrothane', 'galevane']);
  assert.equal(picked.length, TEAM_SIZE);
  assert.ok(!picked.some((c) => ['pyrothane', 'galevane'].includes(c.id)));
});

test('every action the AI picks is one the battle offers', () => {
  const rng = makeRng(17);
  const battle = new Battle({
    playerTeam: team('pyrothane', 'coralynx', 'geodon'),
    enemyTeam: team('thornmaw', 'frostfin', 'hexaraven'),
    rng,
  });
  for (let turn = 0; turn < 30 && !battle.over; turn += 1) {
    for (const side of ['player', 'enemy']) {
      const action = chooseAction(battle, side, rng);
      const legal = battle.availableActions(side);
      assert.ok(
        legal.some((option) => option.kind === action.kind &&
          (action.kind === 'move' ? option.moveId === action.moveId : option.index === action.index)),
        `${side} picked a legal action on turn ${turn}`
      );
      battle.setAction(side, action);
    }
    battle.resolveTurn();
    for (const side of ['player', 'enemy']) {
      if (!battle.over && battle.pendingSwitch[side]) {
        battle.applyForcedSwitch(side, chooseReplacement(battle, side));
      }
    }
  }
});

test('the AI takes an available knockout instead of setting up', () => {
  const battle = new Battle({
    playerTeam: team('mosslok'),
    enemyTeam: team('cindralisk'),
    rng: makeRng(2),
  });
  battle.activeOf('player').hp = 6;
  const action = chooseAction(battle, 'enemy', makeRng(4));
  assert.equal(action.kind, 'move');
  const move = battle.moveOptions('enemy').find((option) => option.move.id === action.moveId).move;
  assert.ok(move.power > 0, `expected an attack, got ${move.name}`);
});

test('the replacement is alive and favours a good matchup', () => {
  const battle = new Battle({
    playerTeam: team('pyrothane'),           // Fire
    enemyTeam: team('thornmaw', 'tidalon', 'mosslok'),
    rng: makeRng(9),
  });
  battle.teams.enemy[0].fainted = true;
  battle.teams.enemy[0].hp = 0;
  const index = chooseReplacement(battle, 'enemy');
  assert.ok(!battle.teams.enemy[index].fainted);
  assert.equal(battle.teams.enemy[index].character.name, 'Tidalon', 'Water answers Fire');
});
