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
import { TYPE_ABILITIES, TYPE_IDS } from '../src/games/catchmon/types.js';

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

/**
 * Plays a battle to its end with both sides on the AI, handing `onEvents` every
 * turn's events. Sending in a replacement when someone faints is not optional:
 * skip it and the fallen fighter stays out, never acts again, and the battle
 * runs quietly to the turn limit.
 */
function autoBattle(battle, rng = makeRng(3), onEvents = null) {
  let guard = 0;
  while (!battle.over && guard < 500) {
    battle.setAction('player', chooseAction(battle, 'player', rng));
    battle.setAction('enemy', chooseAction(battle, 'enemy', rng));
    const events = battle.resolveTurn();
    if (onEvents) onEvents(events);
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
  const attacker = createFighter(getCharacter('pyrothane'), 'player', 0); // Fire
  const move = getMove('fire-standard');
  const versus = (id) => {
    const defender = createFighter(getCharacter(id), 'enemy', 0);
    defender.character = { ...defender.character, stats: { ...attacker.character.stats } };
    return computeDamage(attacker, defender, move).damage;
  };
  const superEffective = versus('thornmaw'); // Grass
  const neutral = versus('nyxmaw');          // Dark
  const resisted = versus('tidalon');        // Water
  assert.ok(superEffective > neutral, 'super effective beats neutral');
  assert.ok(neutral > resisted, 'neutral beats resisted');
});

test('same-type moves get the attack bonus', () => {
  const fire = createFighter(getCharacter('pyrothane'), 'player', 0);
  const wind = createFighter(getCharacter('galehart'), 'player', 0);
  const target = createFighter(getCharacter('galehart'), 'enemy', 0);
  wind.character = { ...wind.character, stats: fire.character.stats };
  const withStab = computeDamage(fire, target, getMove('fire-standard')).damage;
  const noStab = computeDamage(wind, target, getMove('fire-standard')).damage;
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
  battle.setAction('player', { kind: 'move', moveId: 'wind-standard' });
  battle.setAction('enemy', { kind: 'move', moveId: 'fire-standard' });
  const events = battle.resolveTurn();
  const movers = events.filter((event) => event.kind === 'move').map((event) => event.side);
  assert.deepEqual(movers, ['player', 'enemy']);

  const slowFirst = newBattle(['magmoth'], ['galevane']);
  slowFirst.setAction('player', { kind: 'move', moveId: 'fire-standard' });
  slowFirst.setAction('enemy', { kind: 'move', moveId: 'wind-quick' }); // priority 1
  const order = slowFirst.resolveTurn().filter((e) => e.kind === 'move').map((e) => e.side);
  assert.deepEqual(order, ['enemy', 'player']);
});

test('switching happens before any move', () => {
  const battle = newBattle(['magmoth', 'galevane'], ['galehart']);
  battle.setAction('player', { kind: 'switch', index: 1 });
  battle.setAction('enemy', { kind: 'move', moveId: 'wind-standard' });
  const events = battle.resolveTurn();
  assert.equal(events[0].kind, 'switch');
  assert.equal(battle.activeOf('player').character.name, 'Galevane');
});

test('cooldowns lock a move out and then tick back', () => {
  const battle = newBattle(['pyrothane'], ['thornmaw']);
  makeTanky(battle);
  const heavy = 'fire-heavy'; // cooldown 2
  battle.setAction('player', { kind: 'move', moveId: heavy });
  battle.setAction('enemy', { kind: 'move', moveId: 'grass-standard' });
  battle.resolveTurn();
  const readiness = () => battle.moveOptions('player').find((o) => o.move.id === heavy);
  assert.equal(readiness().ready, false);
  assert.equal(readiness().cooldown, 2);

  for (let turn = 0; turn < 2; turn += 1) {
    battle.setAction('player', { kind: 'move', moveId: 'fire-standard' });
    battle.setAction('enemy', { kind: 'move', moveId: 'grass-standard' });
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
  battle.setAction('enemy', { kind: 'move', moveId: 'grass-standard' });
  battle.resolveTurn();
  assert.equal(fighter.usesLeft.mend, 0);
  assert.equal(battle.moveOptions('player').find((o) => o.move.id === 'mend').ready, false);
  assert.ok(!battle.availableActions('player').some((a) => a.moveId === 'mend'));
});

test('burn chips away each turn and wears off', () => {
  const battle = newBattle(['cindralisk'], ['craghide']);
  makeTanky(battle);
  battle.setAction('player', { kind: 'move', moveId: 'fire-status' }); // Scorch Mark
  battle.setAction('enemy', { kind: 'move', moveId: 'rock-standard' });
  battle.resolveTurn();
  const burned = battle.activeOf('enemy');
  assert.equal(burned.status?.id, 'burn');
  const afterApply = burned.hp;

  battle.setAction('player', { kind: 'move', moveId: 'snare' });
  battle.setAction('enemy', { kind: 'move', moveId: 'rock-standard' });
  battle.resolveTurn();
  assert.ok(burned.hp < afterApply, 'the burn ticked');

  for (let turn = 0; turn < 3 && burned.status; turn += 1) {
    battle.setAction('player', { kind: 'move', moveId: 'snare' });
    battle.setAction('enemy', { kind: 'move', moveId: 'rock-standard' });
    battle.resolveTurn();
  }
  assert.equal(burned.status, null, 'the burn expires');
});

test('rooting a fighter stops it switching out', () => {
  const battle = newBattle(['thornmaw'], ['galevane', 'magmoth']);
  makeTanky(battle);
  battle.setAction('player', { kind: 'move', moveId: 'grass-status' }); // Snare Roots
  battle.setAction('enemy', { kind: 'move', moveId: 'wind-standard' });
  battle.resolveTurn();
  assert.equal(battle.activeOf('enemy').status?.id, 'root');
  assert.equal(battle.canSwitch('enemy'), false);
  assert.ok(!battle.availableActions('enemy').some((action) => action.kind === 'switch'));
});

test('a shielded fighter takes no damage that turn', () => {
  const battle = newBattle(['geodon'], ['pyrothane']);
  battle.setAction('player', { kind: 'move', moveId: 'shield' });
  battle.setAction('enemy', { kind: 'move', moveId: 'fire-heavy' });
  const events = battle.resolveTurn();
  assert.ok(events.some((event) => event.kind === 'blocked'));
  assert.equal(battle.activeOf('player').hp, battle.activeOf('player').maxHp);
  assert.equal(battle.activeOf('player').shielded, false, 'the shield lapses at end of turn');
});

test('a knockout forces a replacement and can end the battle', () => {
  const battle = newBattle(['pyrothane', 'galevane'], ['thornmaw']);
  battle.activeOf('player').hp = 1;
  battle.setAction('player', { kind: 'move', moveId: 'ram' });
  battle.setAction('enemy', { kind: 'move', moveId: 'grass-heavy' });
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
  battle.setAction('enemy', { kind: 'move', moveId: 'grass-heavy' });
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
  const attacker = createFighter(getCharacter('zephyris'), 'player', 0);
  const defender = createFighter(getCharacter('tidalon'), 'enemy', 0);
  const strong = previewDamage(attacker, defender, getMove('wind-standard'));
  const weak = previewDamage(attacker, defender, getMove('ram'));
  assert.ok(strong > weak);
  assert.equal(previewDamage(attacker, defender, getMove('mend')), 0);
});

/* --------------------------------------------------------- type abilities */

/** The fighter a side has out, with room to take and heal damage. */
function roomy(battle, side, hp = 900) {
  const fighter = battle.activeOf(side);
  fighter.maxHp = hp;
  fighter.hp = hp;
  return fighter;
}

test('every type ability is either a filled-in shape or explicitly empty', () => {
  for (const id of TYPE_IDS) {
    assert.ok(id in TYPE_ABILITIES, `${id} has an entry, even if it is null`);
    const ability = TYPE_ABILITIES[id];
    if (ability === null) continue;
    assert.ok(ability.name && ability.blurb, `${id}'s ability says what it is`);
    assert.ok(ability.chance > 0 && ability.chance <= 100, `${id}'s chance is a percentage`);
    assert.ok(['burn', 'lifesteal', 'dodge'].includes(ability.kind));
  }
  assert.equal(TYPE_ABILITIES.fire.chance, 30);
  assert.equal(TYPE_ABILITIES.grass.chance, 30);
  assert.equal(TYPE_ABILITIES.grass.share, 0.5);
  assert.equal(TYPE_ABILITIES.wind.chance, 10);
  assert.equal(TYPE_ABILITIES.wind.everyTurns, 2);
});

test("Fire's Kindle burns on a roll inside 30%, and not outside it", () => {
  const battle = newBattle(['pyrothane'], ['craghide']);
  const fire = roomy(battle, 'player');
  const rock = roomy(battle, 'enemy');
  assert.equal(fire.character.type, 'fire');

  battle.rng = () => 0.99;                  // 99 is outside 30
  battle._typeAbilityOnHit(fire, rock, 100, []);
  assert.equal(rock.status, null, 'nothing happens on a high roll');

  battle.rng = () => 0.05;                  // 5 is inside 30
  const events = [];
  battle._typeAbilityOnHit(fire, rock, 100, events);
  assert.equal(rock.status?.id, 'burn', 'a low roll sets it burning');
  assert.ok(events.some((e) => e.kind === 'ability' && e.ability === 'Kindle'), 'and it is announced');

  // It does not overwrite something the target is already suffering.
  const already = newBattle(['pyrothane'], ['craghide']);
  const fire2 = roomy(already, 'player');
  const rock2 = roomy(already, 'enemy');
  already._applyStatus(rock2, 'root', []);
  already.rng = () => 0.05;
  already._typeAbilityOnHit(fire2, rock2, 100, []);
  assert.equal(rock2.status?.id, 'root', 'the status it already had is left alone');
});

test("Grass's Rootfeed gives back half of what it dealt", () => {
  const battle = newBattle(['thornmaw'], ['craghide']);
  const grass = roomy(battle, 'player');
  const rock = roomy(battle, 'enemy');
  assert.equal(grass.character.type, 'grass');
  grass.hp = 400;

  battle.rng = () => 0.99;
  battle._typeAbilityOnHit(grass, rock, 120, []);
  assert.equal(grass.hp, 400, 'a high roll heals nothing');

  battle.rng = () => 0.05;
  battle._typeAbilityOnHit(grass, rock, 120, []);
  assert.equal(grass.hp, 460, 'half of 120, back onto its health');

  // It cannot take a fighter above full.
  grass.hp = grass.maxHp - 10;
  battle._typeAbilityOnHit(grass, rock, 400, []);
  assert.equal(grass.hp, grass.maxHp);
});

test("Wind's Slipstream only comes round every second turn", () => {
  const battle = newBattle(['craghide'], ['galehart']);
  roomy(battle, 'player');
  const wind = roomy(battle, 'enemy');
  assert.equal(wind.character.type, 'wind');

  battle.rng = () => 0.02;                  // 2 is well inside 10
  battle.turn = 1;
  assert.equal(battle._dodges(wind), false, 'turn 1 is not its turn');
  battle.turn = 3;
  assert.equal(battle._dodges(wind), false, 'nor turn 3');
  battle.turn = 2;
  assert.equal(battle._dodges(wind), true, 'turn 2 is');
  battle.turn = 4;
  assert.equal(battle._dodges(wind), true, 'and turn 4');

  battle.rng = () => 0.5;                   // 50 is outside 10
  assert.equal(battle._dodges(wind), false, 'even on its turn it usually does not');

  // Only Wind does this.
  const other = newBattle(['galehart'], ['craghide']);
  const rock = roomy(other, 'enemy');
  other.rng = () => 0.02;
  other.turn = 2;
  assert.equal(other._dodges(rock), false, 'a Rock fighter never slips anything');
});

test('the abilities actually fire in a real battle', () => {
  let kindles = 0;
  let rootfeeds = 0;
  let slips = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    const battle = newBattle(['pyrothane', 'thornmaw', 'galehart'], ['craghide', 'tidalon', 'nyxmaw'], seed);
    autoBattle(battle, makeRng(seed * 31), (events) => {
      for (const event of events) {
        if (event.ability === 'Kindle') kindles += 1;
        if (event.ability === 'Rootfeed') rootfeeds += 1;
        if (/slipped out of the way/.test(event.text || '')) slips += 1;
      }
    });
  }
  assert.ok(kindles > 0, `Kindle fired (${kindles} times over 40 battles)`);
  assert.ok(rootfeeds > 0, `Rootfeed fired (${rootfeeds})`);
  assert.ok(slips > 0, `Slipstream dodged something (${slips})`);
});

test('a type with no ability yet simply has none', () => {
  for (const id of ['water', 'dark', 'rock']) {
    assert.equal(TYPE_ABILITIES[id], null, `${id} is still waiting on one`);
  }
  // Two of them fight exactly as they always did.
  const battle = newBattle(['craghide', 'tidalon', 'nyxmaw'], ['boulderox', 'frostfin', 'umbrathis']);
  let abilityEvents = 0;
  autoBattle(battle, makeRng(11), (events) => {
    for (const event of events) if (event.kind === 'ability') abilityEvents += 1;
  });
  assert.equal(battle.over, true, 'the battle still finishes');
  assert.equal(abilityEvents, 0, 'and nothing ever triggered');
});
