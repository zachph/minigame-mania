import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Battle,
  MAX_STAGE,
  computeDamage,
  createFighter,
  effectiveStat,
  makeRng,
  previewDamage,
} from '../src/games/catchmon/battle.js';
import { getCharacter } from '../src/games/catchmon/roster.js';
import { getMove } from '../src/games/catchmon/moves.js';
import { chooseAction, chooseReplacement } from '../src/games/catchmon/ai.js';

const team = (...ids) => ids.map(getCharacter);

function newBattle(playerIds, enemyIds, seed = 7) {
  return new Battle({
    playerTeam: team(...playerIds),
    enemyTeam: team(...enemyIds),
    rng: makeRng(seed),
  });
}

/** Gives both active fighters a deep health pool so a test turn cannot end the battle. */
function makeTanky(battle, hp = 900) {
  for (const side of ['player', 'enemy']) {
    const fighter = battle.activeOf(side);
    fighter.maxHp = hp;
    fighter.hp = hp;
  }
}

/** Plays a battle to its end with both sides on the AI. */
function autoBattle(battle, rng = makeRng(3)) {
  let guard = 0;
  while (!battle.over && guard < 500) {
    battle.setAction('player', chooseAction(battle, 'player', rng));
    battle.setAction('enemy', chooseAction(battle, 'enemy', rng));
    battle.resolveTurn();
    for (const side of ['player', 'enemy']) {
      if (!battle.over && battle.pendingSwitch[side]) {
        battle.applyForcedSwitch(side, chooseReplacement(battle, side));
      }
    }
    guard += 1;
  }
  return guard;
}

test('type effectiveness moves damage in the right direction', () => {
  const attacker = createFighter(getCharacter('pyrothane'), 'player', 0); // Ember
  const move = getMove('ember-standard');
  const versus = (id) => {
    const defender = createFighter(getCharacter(id), 'enemy', 0);
    defender.character = { ...defender.character, stats: { ...attacker.character.stats } };
    return computeDamage(attacker, defender, move).damage;
  };
  const superEffective = versus('thornmaw'); // Verdant
  const neutral = versus('galevane');        // Storm
  const resisted = versus('tidalon');        // Tide
  assert.ok(superEffective > neutral, 'super effective beats neutral');
  assert.ok(neutral > resisted, 'neutral beats resisted');
});

test('same-type moves get the attack bonus', () => {
  const ember = createFighter(getCharacter('pyrothane'), 'player', 0);
  const storm = createFighter(getCharacter('arcstag'), 'player', 0);
  const target = createFighter(getCharacter('arcstag'), 'enemy', 0);
  storm.character = { ...storm.character, stats: ember.character.stats };
  const withStab = computeDamage(ember, target, getMove('ember-standard')).damage;
  const noStab = computeDamage(storm, target, getMove('ember-standard')).damage;
  assert.ok(withStab > noStab);
});

test('stat stages scale a stat and clamp at three', () => {
  const fighter = createFighter(getCharacter('pyrothane'), 'player', 0);
  const base = effectiveStat(fighter, 'atk');
  fighter.stages.atk = 2;
  assert.ok(effectiveStat(fighter, 'atk') > base);
  fighter.stages.atk = 99;
  const capped = effectiveStat(fighter, 'atk');
  fighter.stages.atk = MAX_STAGE;
  assert.equal(effectiveStat(fighter, 'atk'), capped);
});

test('the faster fighter moves first, and priority beats speed', () => {
  const battle = newBattle(['galevane'], ['magmoth']); // 100 spd vs 38 spd
  battle.setAction('player', { kind: 'move', moveId: 'storm-standard' });
  battle.setAction('enemy', { kind: 'move', moveId: 'ember-standard' });
  const events = battle.resolveTurn();
  const movers = events.filter((event) => event.kind === 'move').map((event) => event.side);
  assert.deepEqual(movers, ['player', 'enemy']);

  const slowFirst = newBattle(['magmoth'], ['galevane']);
  slowFirst.setAction('player', { kind: 'move', moveId: 'ember-standard' });
  slowFirst.setAction('enemy', { kind: 'move', moveId: 'storm-quick' }); // priority 1
  const order = slowFirst.resolveTurn().filter((e) => e.kind === 'move').map((e) => e.side);
  assert.deepEqual(order, ['enemy', 'player']);
});

test('switching happens before any move', () => {
  const battle = newBattle(['magmoth', 'galevane'], ['arcstag']);
  battle.setAction('player', { kind: 'switch', index: 1 });
  battle.setAction('enemy', { kind: 'move', moveId: 'storm-standard' });
  const events = battle.resolveTurn();
  assert.equal(events[0].kind, 'switch');
  assert.equal(battle.activeOf('player').character.name, 'Galevane');
});

test('cooldowns lock a move out and then tick back', () => {
  const battle = newBattle(['pyrothane'], ['thornmaw']);
  makeTanky(battle);
  const heavy = 'ember-heavy'; // cooldown 2
  battle.setAction('player', { kind: 'move', moveId: heavy });
  battle.setAction('enemy', { kind: 'move', moveId: 'verdant-standard' });
  battle.resolveTurn();
  const readiness = () => battle.moveOptions('player').find((o) => o.move.id === heavy);
  assert.equal(readiness().ready, false);
  assert.equal(readiness().cooldown, 2);

  for (let turn = 0; turn < 2; turn += 1) {
    battle.setAction('player', { kind: 'move', moveId: 'ember-standard' });
    battle.setAction('enemy', { kind: 'move', moveId: 'verdant-standard' });
    battle.resolveTurn();
  }
  assert.equal(readiness().ready, true, 'the heavy hitter comes back');
});

test('limited moves run out for good', () => {
  const battle = newBattle(['magmoth'], ['mosslok']);
  makeTanky(battle);
  const fighter = battle.activeOf('player');
  fighter.usesLeft.mend = 1;
  fighter.hp = 40;
  battle.setAction('player', { kind: 'move', moveId: 'mend' });
  battle.setAction('enemy', { kind: 'move', moveId: 'verdant-standard' });
  battle.resolveTurn();
  assert.equal(fighter.usesLeft.mend, 0);
  assert.equal(battle.moveOptions('player').find((o) => o.move.id === 'mend').ready, false);
  assert.ok(!battle.availableActions('player').some((a) => a.moveId === 'mend'));
});

test('burn chips away each turn and wears off', () => {
  const battle = newBattle(['cindralisk'], ['craghide']);
  makeTanky(battle);
  battle.setAction('player', { kind: 'move', moveId: 'ember-status' }); // Scorch Mark
  battle.setAction('enemy', { kind: 'move', moveId: 'terra-standard' });
  battle.resolveTurn();
  const burned = battle.activeOf('enemy');
  assert.equal(burned.status?.id, 'burn');
  const afterApply = burned.hp;

  battle.setAction('player', { kind: 'move', moveId: 'snare' });
  battle.setAction('enemy', { kind: 'move', moveId: 'terra-standard' });
  battle.resolveTurn();
  assert.ok(burned.hp < afterApply, 'the burn ticked');

  for (let turn = 0; turn < 3 && burned.status; turn += 1) {
    battle.setAction('player', { kind: 'move', moveId: 'snare' });
    battle.setAction('enemy', { kind: 'move', moveId: 'terra-standard' });
    battle.resolveTurn();
  }
  assert.equal(burned.status, null, 'the burn expires');
});

test('rooting a fighter stops it switching out', () => {
  const battle = newBattle(['thornmaw'], ['galevane', 'magmoth']);
  makeTanky(battle);
  battle.setAction('player', { kind: 'move', moveId: 'verdant-status' }); // Snare Roots
  battle.setAction('enemy', { kind: 'move', moveId: 'storm-standard' });
  battle.resolveTurn();
  assert.equal(battle.activeOf('enemy').status?.id, 'root');
  assert.equal(battle.canSwitch('enemy'), false);
  assert.ok(!battle.availableActions('enemy').some((action) => action.kind === 'switch'));
});

test('a shielded fighter takes no damage that turn', () => {
  const battle = newBattle(['geodon'], ['pyrothane']);
  battle.setAction('player', { kind: 'move', moveId: 'shield' });
  battle.setAction('enemy', { kind: 'move', moveId: 'ember-heavy' });
  const events = battle.resolveTurn();
  assert.ok(events.some((event) => event.kind === 'blocked'));
  assert.equal(battle.activeOf('player').hp, battle.activeOf('player').maxHp);
  assert.equal(battle.activeOf('player').shielded, false, 'the shield lapses at end of turn');
});

test('a knockout forces a replacement and can end the battle', () => {
  const battle = newBattle(['pyrothane', 'galevane'], ['thornmaw']);
  battle.activeOf('player').hp = 1;
  battle.setAction('player', { kind: 'move', moveId: 'ram' });
  battle.setAction('enemy', { kind: 'move', moveId: 'verdant-heavy' });
  const events = battle.resolveTurn();
  assert.ok(events.some((event) => event.kind === 'faint' && event.side === 'player'));
  assert.equal(battle.pendingSwitch.player, true);
  assert.equal(battle.over, false);
  assert.equal(battle.activeOf('enemy').kos, 1);

  battle.applyForcedSwitch('player', 1);
  assert.equal(battle.activeOf('player').character.name, 'Galevane');
  assert.equal(battle.pendingSwitch.player, false);

  battle.activeOf('player').hp = 1;
  battle.setAction('player', { kind: 'move', moveId: 'ram' });
  battle.setAction('enemy', { kind: 'move', moveId: 'verdant-heavy' });
  battle.resolveTurn();
  assert.equal(battle.over, true);
  assert.equal(battle.winner, 'enemy');
});

test('the turn limit stops a stall and awards it on health', () => {
  const battle = new Battle({
    playerTeam: team('mosslok'),
    enemyTeam: team('umbrathis'),
    rng: makeRng(11),
    turnLimit: 3,
  });
  battle.activeOf('enemy').hp = 10;
  for (let turn = 0; turn < 3 && !battle.over; turn += 1) {
    battle.setAction('player', { kind: 'move', moveId: 'bulwark' });
    battle.setAction('enemy', { kind: 'move', moveId: 'bulwark' });
    battle.resolveTurn();
  }
  assert.equal(battle.over, true);
  assert.equal(battle.winner, 'player', 'the healthier team takes it');
});

test('a full battle always terminates and leaves one team standing', () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    const battle = newBattle(
      ['pyrothane', 'galevane', 'abyssarch'],
      ['thornmaw', 'frostfin', 'hexaraven'],
      seed
    );
    const turns = autoBattle(battle, makeRng(seed * 13));
    assert.ok(battle.over, `seed ${seed} finished`);
    assert.ok(turns <= battle.turnLimit + 1, `seed ${seed} took ${turns} turns`);
    if (battle.winner) {
      assert.ok(battle.teams[battle.winner].some((f) => !f.fainted), 'the winner has someone left');
    }
  }
});

test('the same seed replays the same battle', () => {
  const play = () => {
    const battle = newBattle(['kilnhorn', 'coralynx', 'geodon'], ['duskgeist', 'boulderox', 'verdrake'], 42);
    autoBattle(battle, makeRng(99));
    return {
      winner: battle.winner,
      turn: battle.turn,
      hp: [...battle.teams.player, ...battle.teams.enemy].map((f) => f.hp),
    };
  };
  assert.deepEqual(play(), play());
});

test('previewDamage tracks real damage without rolling dice', () => {
  const attacker = createFighter(getCharacter('voltaris'), 'player', 0);
  const defender = createFighter(getCharacter('tidalon'), 'enemy', 0);
  const strong = previewDamage(attacker, defender, getMove('storm-standard'));
  const weak = previewDamage(attacker, defender, getMove('ram'));
  assert.ok(strong > weak);
  assert.equal(previewDamage(attacker, defender, getMove('mend')), 0);
});
