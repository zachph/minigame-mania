import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COST_CURVE,
  DECK_SHAPE,
  DECK_SIZE,
  FACTIONS,
  FIGHTERS,
  RECIPES,
  buildDeck,
  fighterCost,
  getCard,
} from '../src/games/shubat/cards.js';
import {
  CORE_HP,
  LANES,
  START_HAND,
  boardOf,
  canAttack,
  createMatch,
  endTurn,
  legalPlays,
  playCard,
} from '../src/games/shubat/rules.js';
import { DIFFICULTIES, takeTurn } from '../src/games/shubat/ai.js';

function seeded(seed = 1) {
  let state = seed;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

/** A match with both boards cleared, for testing one rule at a time. */
function bench({ playerFaction = 'iron', first = 'you', seed = 1 } = {}) {
  return createMatch({ playerFaction, random: seeded(seed), first });
}

const handOf = (state, side) => state.players[side].hand;
const put = (state, side, lane, cardId) => {
  const card = getCard(cardId);
  state.players[side].board[lane] = {
    uid: Math.random(), card, name: card.name, hp: card.hp, maxHp: card.hp,
    damage: card.damage, baseDamage: card.damage, turnDamage: 0, shield: 0, silenced: 0, arrivedOn: 0,
  };
  return state.players[side].board[lane];
};

/* ------------------------------------------------------------ the cards */

test('the fighters carry exactly the stats they were given', () => {
  const expected = {
    'iron-scrapper': [120, 180], 'iron-magnet-bot': [290, 70], 'iron-overdrive': [160, 210],
    'iron-iron-forge': [135, 177], 'iron-criptmetal': [401, 101],
    'string-brainer': [380, 20], 'string-calculator': [314, 790], 'string-coden': [1010, 7],
    'string-puppeteer': [248, 157], 'string-grand': [560, 129],
  };
  assert.equal(FIGHTERS.length, 10);
  for (const [id, [hp, damage]] of Object.entries(expected)) {
    const fighter = getCard(id);
    assert.equal(fighter.hp, hp, `${fighter.name} HP`);
    assert.equal(fighter.damage, damage, `${fighter.name} damage`);
  }
  // Calculator's stats are written as sums on purpose.
  assert.equal(getCard('string-calculator').hp, 297 + 17);
  assert.equal(getCard('string-calculator').damage, 1000 - 210);
});

test('cost follows the curve, so the monsters land late', () => {
  for (const fighter of FIGHTERS) {
    assert.equal(fighter.cost, fighterCost(fighter.hp, fighter.damage));
    assert.ok(fighter.cost >= 1);
  }
  assert.ok(COST_CURVE > 1, 'the curve bends, or String Brain simply wins');
  const iron = FIGHTERS.filter((f) => f.faction === 'iron');
  const string = FIGHTERS.filter((f) => f.faction === 'string');
  assert.ok(Math.max(...iron.map((f) => f.cost)) < Math.max(...string.map((f) => f.cost)),
    'the biggest String fighter costs more than anything Iron fields');
  assert.equal(getCard('string-coden').cost, fighterCost(1010, 7));
});

test('every deck is twenty cards in the right shape', () => {
  for (const faction of Object.keys(FACTIONS)) {
    for (const recipe of Object.keys(RECIPES)) {
      const deck = buildDeck(faction, recipe);
      assert.equal(deck.length, DECK_SIZE, `${faction}/${recipe} is twenty cards`);
      const counts = {};
      for (const card of deck) {
        counts[card.kind] = (counts[card.kind] || 0) + 1;
        assert.equal(card.faction, faction, 'no cards from the other deck');
      }
      assert.deepEqual(counts, DECK_SHAPE, `${faction}/${recipe}: 5 fighters, 10 supports, 2 instants, 3 traps`);
      assert.equal(deck.filter((card) => card.kind === 'fighter').length, 5);
      assert.equal(new Set(deck.filter((c) => c.kind === 'fighter').map((c) => c.id)).size, 5, 'all five fighters, once each');
    }
  }
});

test('the three difficulty decks are genuinely different builds', () => {
  const names = (recipe) => new Set(buildDeck('iron', recipe).map((card) => card.id));
  const trainee = names('basic');
  const prototype = names('elite');
  const shared = [...trainee].filter((id) => prototype.has(id));
  assert.ok(shared.length < trainee.size, 'Trainee and Prototype are not the same deck');
  assert.ok(prototype.size > trainee.size, 'the Prototype deck runs more different cards');
});

/* ------------------------------------------------------------ the match */

test('a match opens with two cores, empty lanes and one energy', () => {
  const state = bench();
  assert.equal(state.players.you.core, CORE_HP);
  assert.equal(state.players.rival.core, CORE_HP);
  assert.equal(state.players.you.faction, 'iron');
  assert.equal(state.players.rival.faction, 'string', 'the rival takes the other deck');
  assert.deepEqual(boardOf(state, 'you'), new Array(LANES).fill(null));
  assert.equal(state.players.you.energy, 1, 'one energy on turn one');
  assert.equal(handOf(state, 'you').length, START_HAND + 1, 'five dealt, one drawn');
  assert.equal(handOf(state, 'rival').length, START_HAND + 1, 'six dealt, and it draws when its turn opens');
  assert.equal(state.players.rival.bonusEnergy, 1, 'moving second is worth an extra card and an extra energy');
});

test('energy grows by one a turn', () => {
  let state = bench();
  const seen = [state.players.you.energy];
  for (let i = 0; i < 3; i += 1) {
    state = endTurn(state, 'you');
    state = endTurn(state, 'rival');
    seen.push(state.players.you.energy);
  }
  assert.deepEqual(seen, [1, 2, 3, 4]);
});

test('a fighter costs energy, takes a lane, and cannot swing the turn it lands', () => {
  const state = bench();
  state.players.you.energy = 9;
  const index = handOf(state, 'you').findIndex((card) => card.kind === 'fighter');
  const card = handOf(state, 'you')[index];
  playCard(state, 'you', { index, lane: 1 });

  assert.equal(state.players.you.energy, 9 - card.cost, 'energy was spent');
  assert.equal(boardOf(state, 'you')[1].name, card.name);
  assert.equal(canAttack(state, 'you', boardOf(state, 'you')[1]), false, 'it is still landing');
  assert.ok(!legalPlays(state, 'you').some((play) => play.lane === 1 && play.card.kind === 'fighter'),
    'and the lane is taken');
});

test('a fighter hits whatever is opposite it, and nothing hits back', () => {
  const state = bench();
  const attacker = put(state, 'you', 0, 'iron-overdrive');   // 210 damage
  const blocker = put(state, 'rival', 0, 'string-grand');    // 560 HP, 129 damage
  endTurn(state, 'you');
  assert.equal(blocker.hp, 560 - 210, 'the blocker took the hit');
  assert.equal(attacker.hp, 160, 'and did not hit back on its own turn');
  assert.equal(state.players.rival.core, CORE_HP, 'a blocked lane never reaches the core');
});

test('an empty lane is a straight road to the core', () => {
  const state = bench();
  put(state, 'you', 2, 'iron-scrapper'); // 180 damage
  endTurn(state, 'you');
  assert.equal(state.players.rival.core, CORE_HP - 180);
});

test("Iron Warrior's Breakthrough carries the overkill into the core", () => {
  const state = bench({ playerFaction: 'iron' });
  put(state, 'you', 0, 'iron-overdrive');      // 210 damage
  const blocker = put(state, 'rival', 0, 'string-puppeteer'); // 248 HP
  blocker.hp = 60;                             // 150 of the hit is spare
  endTurn(state, 'you');
  assert.equal(boardOf(state, 'rival')[0], null, 'the blocker fell');
  assert.equal(state.players.rival.core, CORE_HP - 150, 'and the rest went through');
});

test('String Brain does not get Breakthrough', () => {
  const state = bench({ playerFaction: 'string' });
  put(state, 'you', 0, 'string-calculator');   // 790 damage
  const blocker = put(state, 'rival', 0, 'iron-scrapper'); // 120 HP
  endTurn(state, 'you');
  assert.equal(boardOf(state, 'rival')[0], null);
  assert.equal(state.players.rival.core, CORE_HP, 'the overkill is simply wasted');
});

/* ----------------------------------------------------------- card effects */

test('a support buffs the fighter you point it at', () => {
  const state = bench();
  const fighter = put(state, 'you', 0, 'iron-scrapper');
  state.players.you.hand = [getCard('iron-plating')];
  state.players.you.energy = 5;
  playCard(state, 'you', { index: 0, lane: 0, targetSide: 'you' });
  assert.equal(fighter.hp, 120 + 120);
  assert.equal(fighter.maxHp, 240);
});

test('a shield eats the next hit', () => {
  const state = bench();
  const fighter = put(state, 'you', 0, 'iron-magnet-bot');
  state.players.you.hand = [getCard('iron-riveted')];
  state.players.you.energy = 5;
  playCard(state, 'you', { index: 0, lane: 0, targetSide: 'you' });
  assert.equal(fighter.shield, 250);

  put(state, 'rival', 0, 'string-calculator'); // 790 damage
  endTurn(state, 'you');
  endTurn(state, 'rival');
  assert.equal(fighter.shield, 0, 'the shield was spent');
  assert.equal(fighter.hp, 290 - (790 - 250), 'and it only ate 250 of it');
});

test('tangling a fighter stops it attacking', () => {
  const state = bench({ playerFaction: 'string' });
  const victim = put(state, 'rival', 1, 'iron-overdrive');
  state.players.you.hand = [getCard('string-tangle')];
  state.players.you.energy = 5;
  playCard(state, 'you', { index: 0, lane: 1, targetSide: 'rival' });
  assert.equal(victim.silenced, 1);
  endTurn(state, 'you');
  assert.equal(canAttack(state, 'rival', victim), false);
  endTurn(state, 'rival');
  assert.equal(state.players.you.core, CORE_HP, 'it never swung');
});

test('an instant hits a fighter, or the core', () => {
  const state = bench();
  const target = put(state, 'rival', 0, 'string-grand');
  state.players.you.hand = [getCard('iron-rocket-punch'), getCard('iron-rail-shot')];
  state.players.you.energy = 9;
  playCard(state, 'you', { index: 0, lane: 0, targetSide: 'rival' });
  assert.equal(target.hp, 560 - 300);
  playCard(state, 'you', { index: 0 });
  assert.equal(state.players.rival.core, CORE_HP - 250);
});

test('a trap sits face down and fires on its trigger', () => {
  const state = bench({ playerFaction: 'iron' });
  state.players.you.hand = [getCard('iron-bear-trap')];
  state.players.you.energy = 5;
  playCard(state, 'you', { index: 0 });
  assert.equal(state.players.you.traps.length, 1, 'set, not spent');
  endTurn(state, 'you');

  state.players.rival.energy = 9;
  state.players.rival.hand = [getCard('string-puppeteer')]; // 248 HP
  playCard(state, 'rival', { index: 0, lane: 0 });
  assert.equal(boardOf(state, 'rival')[0].hp, 248 - 200, 'the trap bit it on the way in');
  assert.equal(state.players.you.traps.length, 0, 'and is used up');
});

test('a trap can cancel the card that set it off', () => {
  const state = bench({ playerFaction: 'string' });
  state.players.you.hand = [getCard('string-blackout')];
  state.players.you.energy = 5;
  playCard(state, 'you', { index: 0 });
  endTurn(state, 'you');

  state.players.rival.energy = 9;
  state.players.rival.hand = [getCard('iron-rail-shot'), getCard('iron-rail-shot')];
  playCard(state, 'rival', { index: 0 });   // trips Blackout, still resolves
  const afterFirst = state.players.you.core;
  playCard(state, 'rival', { index: 0 });   // this one fizzles
  assert.equal(state.players.you.core, afterFirst, 'the next instant did nothing');
});

/* ------------------------------------------------------------- the match */

test('putting a core to zero ends it', () => {
  const state = bench();
  state.players.rival.core = 100;
  put(state, 'you', 0, 'iron-scrapper');
  endTurn(state, 'you');
  assert.equal(state.over, true);
  assert.equal(state.winner, 'you');
  assert.match(state.reason, /core/);
  assert.deepEqual(legalPlays(state, 'rival'), [], 'a finished match offers no plays');
});

test('the rival only ever makes legal plays, and every match finishes', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    for (const playerFaction of ['iron', 'string']) {
      const random = seeded(7);
      const level = DIFFICULTIES[difficulty];
      let state = createMatch({
        playerFaction,
        recipes: { you: 'core', rival: level.recipe },
        handicaps: { you: 0, rival: level.handicap },
        random,
      });
      let guard = 0;
      while (!state.over && guard < 120) {
        const before = state.turn;
        state = takeTurn(state, state.turn, difficulty, random);
        assert.ok(state.over || state.turn !== before, `${difficulty}: the turn passed`);
        guard += 1;
      }
      assert.equal(state.over, true, `${difficulty}/${playerFaction} finished in ${guard} turns`);
      assert.ok(state.reason, 'and says why');
    }
  }
});

test('the difficulty ladder actually climbs', () => {
  const play = (difficulty, seed) => {
    const random = seeded(seed);
    const level = DIFFICULTIES[difficulty];
    let state = createMatch({
      playerFaction: seed % 2 ? 'iron' : 'string',
      recipes: { you: 'core', rival: level.recipe },
      handicaps: { you: 0, rival: level.handicap },
      random,
      first: seed % 3 ? 'you' : 'rival',
    });
    let guard = 0;
    while (!state.over && guard < 120) {
      // The player seat always plays a straight Normal game.
      state = takeTurn(state, state.turn, state.turn === 'you' ? 'normal' : difficulty, random);
      guard += 1;
    }
    return state.winner;
  };

  const rate = (difficulty) => {
    let wins = 0;
    for (let seed = 1; seed <= 40; seed += 1) if (play(difficulty, seed * 13) === 'you') wins += 1;
    return wins / 40;
  };

  const easy = rate('easy');
  const hard = rate('hard');
  assert.ok(easy > 0.75, `Easy should roll over: player won ${(easy * 100).toFixed(0)}%`);
  assert.ok(hard < 0.5, `Hard should win more than it loses: player won ${(hard * 100).toFixed(0)}%`);
  assert.ok(easy - hard > 0.3, 'and the two ends of the ladder are far apart');
});
