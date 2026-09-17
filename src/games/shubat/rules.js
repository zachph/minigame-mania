import { DECK_SIZE, buildDeck, getCard, otherFaction } from './cards.js';

/**
 * Shubat rules. Pure logic - no canvas, no DOM, and every shuffle comes from
 * the injected random source, so a match can be replayed exactly.
 *
 * Both halves of the game live here. The card half: a twenty-card deck, a hand,
 * energy that grows by one a turn, supports, instants and face-down traps. The
 * strategy half: three lanes. A fighter only fights whatever stands opposite
 * it, and an empty lane is a straight road to the core - so where a fighter
 * goes matters as much as which fighter it is.
 */

export const LANES = 3;
// Tuned by simulation, and the single most important number in the game: it is
// the clock the aggressive deck races. At 1200 Iron Warrior wins 76% of
// matches; at 2000 it wins 44%. At 1850 the two decks are level and a match
// runs a little over twenty turns.
export const CORE_HP = 1850;
export const START_HAND = 5;
export const MAX_ENERGY = 10;
export const MAX_TRAPS = 3;
export const HAND_LIMIT = 8;
export const TURN_LIMIT = 40;

export const SIDES = ['you', 'rival'];
export const opponentOf = (side) => (side === 'you' ? 'rival' : 'you');

let uid = 0;
const nextUid = () => (uid += 1);

export function shuffle(cards, random = Math.random) {
  const deck = cards.slice();
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function createPlayer(side, faction, recipe, random, second, coreHp, handicap = 0) {
  const deck = shuffle(buildDeck(faction, recipe), random);
  const handSize = START_HAND + (second ? 1 : 0);
  return {
    side,
    faction,
    recipe,
    deck: deck.slice(handSize),
    hand: deck.slice(0, handSize),
    board: new Array(LANES).fill(null),
    traps: [],
    fallen: [],
    core: coreHp,
    maxCore: coreHp,
    coreShield: 0,
    energy: 0,
    // A handicap shifts where the energy curve starts, so a harder rival is
    // simply a turn ahead of you all game.
    maxEnergy: handicap,
    haste: false,
    cancel: { support: false, instant: false },
    // Moving second is a real disadvantage in a game with a clock, so the
    // second player opens with an extra card and one extra energy.
    bonusEnergy: second ? 1 : 0,
  };
}

/**
 * `recipes` lets the rival run a different build of its deck per difficulty -
 * a Trainee, Standard or Prototype twenty.
 */
export function createMatch({
  playerFaction = 'iron',
  recipes = { you: 'core', rival: 'core' },
  random = Math.random,
  first = 'you',
  coreHp = CORE_HP,
  handicaps = { you: 0, rival: 0 },
} = {}) {
  const rivalFaction = otherFaction(playerFaction);
  const state = {
    players: {
      you: createPlayer('you', playerFaction, recipes.you, random, first !== 'you', coreHp, handicaps.you || 0),
      rival: createPlayer('rival', rivalFaction, recipes.rival, random, first !== 'rival', coreHp, handicaps.rival || 0),
    },
    random,
    turn: first,
    turnNumber: 1,
    log: [],
    pendingTrigger: null,
    over: false,
    winner: null,
    reason: null,
  };
  return beginTurn(state, first);
}

/* --------------------------------------------------------------- helpers */

const me = (state, side) => state.players[side];
export const boardOf = (state, side) => me(state, side).board;
export const fightersOf = (state, side) => boardOf(state, side).filter(Boolean);
export const emptyLanes = (state, side) => boardOf(state, side)
  .map((slot, lane) => (slot ? -1 : lane))
  .filter((lane) => lane >= 0);

function log(state, text) {
  state.log = [...state.log, text];
  return state;
}

function makeFighter(card) {
  return {
    uid: nextUid(),
    card,
    name: card.name,
    hp: card.hp,
    maxHp: card.hp,
    damage: card.damage,
    baseDamage: card.damage,
    turnDamage: 0,
    shield: 0,
    silenced: 0,
    arrivedOn: null,
  };
}

/** Can this fighter swing this turn? */
export function canAttack(state, side, fighter) {
  if (!fighter) return false;
  if (fighter.silenced > 0) return false;
  const player = me(state, side);
  if (fighter.arrivedOn === state.turnNumber && !player.haste) return false;
  return true;
}

export function cardCost(card) {
  return card.cost;
}

/** Everything the side to move could legally do right now. */
export function legalPlays(state, side) {
  if (state.over || state.turn !== side) return [];
  const player = me(state, side);
  const plays = [];
  player.hand.forEach((card, index) => {
    if (card.cost > player.energy) return;
    if (card.kind === 'fighter') {
      for (const lane of emptyLanes(state, side)) plays.push({ index, card, lane });
      return;
    }
    if (card.kind === 'trap') {
      if (player.traps.length < MAX_TRAPS) plays.push({ index, card });
      return;
    }
    if (card.target === 'ally') {
      boardOf(state, side).forEach((slot, lane) => { if (slot) plays.push({ index, card, lane, targetSide: side }); });
      return;
    }
    if (card.target === 'enemy') {
      boardOf(state, opponentOf(side)).forEach((slot, lane) => {
        if (slot) plays.push({ index, card, lane, targetSide: opponentOf(side) });
      });
      return;
    }
    plays.push({ index, card });
  });
  return plays;
}

export const canPlay = (state, side, play) =>
  legalPlays(state, side).some(
    (option) => option.index === play.index && option.lane === play.lane
  );

/* ------------------------------------------------------------ turn cycle */

export function beginTurn(state, side) {
  const player = me(state, side);
  player.maxEnergy = Math.max(1, Math.min(MAX_ENERGY, player.maxEnergy + 1));
  player.energy = player.maxEnergy + player.bonusEnergy;
  player.bonusEnergy = 0;
  player.haste = false;
  player.coreShield = 0;

  for (const fighter of fightersOf(state, side)) fighter.turnDamage = 0;
  drawCards(state, side, 1);
  return state;
}

export function drawCards(state, side, count) {
  const player = me(state, side);
  for (let i = 0; i < count; i += 1) {
    if (player.deck.length === 0) break;
    const card = player.deck.shift();
    if (player.hand.length >= HAND_LIMIT) {
      log(state, `${label(side)} has no room for ${card.name}.`);
      continue;
    }
    player.hand.push(card);
  }
  return state;
}

const label = (side) => (side === 'you' ? 'You' : 'The rival');

/** Plays a card from hand. `play` is `{ index, lane?, targetSide? }`. */
export function playCard(state, side, play) {
  if (state.over) throw new Error('The match is over');
  if (state.turn !== side) throw new Error(`It is ${state.turn}'s turn`);
  const player = me(state, side);
  const card = player.hand[play.index];
  if (!card) throw new Error('No such card in hand');
  if (card.cost > player.energy) throw new Error(`${card.name} costs ${card.cost}`);

  player.hand = player.hand.filter((_, index) => index !== play.index);
  player.energy -= card.cost;

  if (card.kind === 'fighter') return deployFighter(state, side, card, play.lane);
  if (card.kind === 'trap') {
    player.traps.push({ card, id: nextUid() });
    log(state, `${label(side)} set a trap.`);
    return state;
  }

  // Supports and instants can be shut down by a waiting trap.
  const kind = card.kind === 'instant' ? 'instant' : 'support';
  if (player.cancel[kind]) {
    player.cancel[kind] = false;
    log(state, `${card.name} fizzled.`);
    return state;
  }
  log(state, `${label(side)} played ${card.name}.`);
  applyEffect(state, side, card.effect, play);
  fireTraps(state, opponentOf(side), kind === 'instant' ? 'enemy-instant' : 'enemy-support', {});
  return state;
}

function deployFighter(state, side, card, lane) {
  const player = me(state, side);
  if (lane == null || player.board[lane]) throw new Error('That lane is taken');
  const fighter = makeFighter(card);
  fighter.arrivedOn = state.turnNumber;
  player.board[lane] = fighter;
  log(state, `${label(side)} sent ${card.name} to lane ${lane + 1}.`);

  fireTraps(state, opponentOf(side), 'enemy-deploy', { fighter, side, lane });
  if (fightersOf(state, side).length === LANES) {
    fireTraps(state, opponentOf(side), 'enemy-full-board', { side });
  }
  clearDead(state);
  return state;
}

/** Runs the attack step, then hands over to the other side. */
export function endTurn(state, side) {
  if (state.over) return state;
  if (state.turn !== side) throw new Error(`It is ${state.turn}'s turn`);

  resolveAttacks(state, side);
  if (state.over) return state;

  // Silence wears off at the end of the turn it cost you, not the start of it -
  // otherwise a fighter tangled on your turn is free again before it misses one.
  for (const fighter of fightersOf(state, side)) {
    if (fighter.silenced > 0) fighter.silenced -= 1;
  }

  if (state.turnNumber >= TURN_LIMIT) return callTheMatch(state);

  state.turn = opponentOf(side);
  state.turnNumber += 1;
  return beginTurn(state, state.turn);
}

function resolveAttacks(state, side) {
  const attackerBoard = boardOf(state, side);
  const defenderSide = opponentOf(side);

  for (let lane = 0; lane < LANES; lane += 1) {
    const fighter = attackerBoard[lane];
    if (!canAttack(state, side, fighter)) continue;
    const power = Math.max(0, fighter.damage + fighter.turnDamage);
    if (power <= 0) continue;

    const blocker = boardOf(state, defenderSide)[lane];
    if (blocker) {
      const before = blocker.hp;
      damageFighter(state, defenderSide, blocker, power, { source: fighter, lane });
      log(state, `${fighter.name} hit ${blocker.name} for ${power}.`);
      // Iron Warrior's Breakthrough: whatever is left over goes to the core.
      if (me(state, side).faction === 'iron' && blocker.hp <= 0) {
        const spill = Math.max(0, power - Math.max(0, before));
        if (spill > 0) {
          log(state, `${fighter.name} smashed straight through for ${spill}.`);
          damageCore(state, defenderSide, spill, { source: fighter, lane, side });
        }
      }
    } else {
      damageCore(state, defenderSide, power, { source: fighter, lane, side });
    }
    clearDead(state);
    if (state.over) return;
  }
}

function damageFighter(state, side, fighter, amount, context = {}) {
  const absorbed = Math.min(fighter.shield, amount);
  fighter.shield -= absorbed;
  fighter.hp -= amount - absorbed;
  void context;
  return amount - absorbed;
}

function damageCore(state, side, amount, context = {}) {
  const player = me(state, side);
  const absorbed = Math.min(player.coreShield, amount);
  player.coreShield -= absorbed;
  const dealt = amount - absorbed;
  player.core = Math.max(0, player.core - dealt);
  log(state, `${context.source ? context.source.name : 'A card'} hit ${side === 'you' ? 'your' : 'the rival'} core for ${dealt}.`);

  fireTraps(state, side, 'core-hit', { amount: dealt, attacker: context.source, attackerSide: context.side });
  if (player.core <= 0) finish(state, opponentOf(side), 'the core is down');
  return dealt;
}

function clearDead(state) {
  for (const side of SIDES) {
    const player = me(state, side);
    player.board.forEach((fighter, lane) => {
      if (!fighter || fighter.hp > 0) return;
      const saved = fireTraps(state, side, 'ally-death', { fighter });
      if (saved && fighter.hp > 0) return;
      player.board[lane] = null;
      player.fallen.push(fighter.card);
      log(state, `${fighter.name} is scrap.`);
    });
  }
}

function callTheMatch(state) {
  const you = me(state, 'you').core;
  const rival = me(state, 'rival').core;
  state.over = true;
  state.winner = you === rival ? null : you > rival ? 'you' : 'rival';
  state.reason = 'time - the healthier core takes it';
  return state;
}

function finish(state, winner, reason) {
  state.over = true;
  state.winner = winner;
  state.reason = reason;
  return state;
}

/* ---------------------------------------------------------------- effects */

export function applyEffect(state, side, effect, play = {}, context = {}) {
  if (!effect) return state;
  const enemy = opponentOf(side);
  const targetSide = play.targetSide || (effect.scope === 'core' ? enemy : side);
  const targetFighter = play.lane != null && play.targetSide
    ? boardOf(state, play.targetSide)[play.lane]
    : context.fighter || null;

  if (effect.buff) {
    const { stat, amount, duration, scope } = effect.buff;
    const targets = scope === 'all' ? fightersOf(state, side) : [targetFighter].filter(Boolean);
    for (const fighter of targets) {
      if (stat === 'hp') {
        fighter.maxHp += amount;
        fighter.hp += amount;
      } else if (duration === 'turn') fighter.turnDamage += amount;
      else fighter.damage += amount;
    }
  }

  if (effect.drain) {
    const { stat, amount, duration } = effect.drain;
    const fighter = targetFighter;
    if (fighter && stat === 'damage') {
      if (duration === 'turn') fighter.turnDamage -= amount;
      else fighter.damage = Math.max(0, fighter.damage - amount);
    }
  }

  if (effect.heal) {
    const targets = effect.heal.scope === 'all' ? fightersOf(state, side) : [targetFighter].filter(Boolean);
    for (const fighter of targets) fighter.hp = Math.min(fighter.maxHp, fighter.hp + effect.heal.amount);
  }

  if (effect.shield) {
    const fighter = targetFighter;
    if (fighter) fighter.shield += effect.shield.amount;
  }

  if (effect.damage) {
    const { amount, scope } = effect.damage;
    if (scope === 'core') damageCore(state, enemy, amount, {});
    else if (scope === 'all') {
      for (const fighter of fightersOf(state, enemy)) damageFighter(state, enemy, fighter, amount);
    } else if (scope === 'attacker') {
      if (context.attacker) damageFighter(state, context.attackerSide || enemy, context.attacker, amount);
    } else if (targetFighter) {
      damageFighter(state, play.targetSide || enemy, targetFighter, amount);
    }
    clearDead(state);
  }

  if (effect.reflect && context.attacker) {
    damageFighter(state, context.attackerSide || enemy, context.attacker, context.amount || 0);
    clearDead(state);
  }

  if (effect.silence && targetFighter) targetFighter.silenced = effect.silence.turns;
  if (effect.draw) drawCards(state, side, effect.draw.count);
  if (effect.energy) me(state, side).energy += effect.energy.amount;
  if (effect.haste) me(state, side).haste = true;
  if (effect.coreward) me(state, side).coreShield += effect.coreward.amount;

  if (effect.discard) {
    const victim = me(state, enemy);
    for (let i = 0; i < effect.discard.count && victim.hand.length > 0; i += 1) {
      const index = Math.floor(state.random() * victim.hand.length);
      const [card] = victim.hand.splice(index, 1);
      log(state, `${label(enemy)} lost ${card.name} from hand.`);
    }
  }

  if (effect.revive) {
    const player = me(state, side);
    const card = player.fallen.pop();
    if (card && player.hand.length < HAND_LIMIT) player.hand.push(card);
  }

  if (effect.cancel) {
    const victim = me(state, enemy);
    victim.cancel[context.cancelKind || 'support'] = true;
  }

  return state;
}

/**
 * Fires any of `side`'s face-down traps that match `trigger`. Returns true if
 * one of them actually did something.
 */
function fireTraps(state, side, trigger, context) {
  const player = me(state, side);
  const ready = player.traps.filter((entry) => entry.card.effect.trigger === trigger);
  if (ready.length === 0) return false;

  for (const entry of ready) {
    player.traps = player.traps.filter((other) => other.id !== entry.id);
    log(state, `${label(side)} sprang ${entry.card.name}!`);
    const effect = entry.card.effect;
    const kind = trigger === 'enemy-instant' ? 'instant' : 'support';
    applyEffect(state, side, effect, { targetSide: opponentOf(side), lane: context.lane }, {
      ...context,
      fighter: context.fighter,
      cancelKind: kind,
    });
  }
  return true;
}

/* ------------------------------------------------------------- reporting */

export const coreOf = (state, side) => me(state, side).core;
export const handOf = (state, side) => me(state, side).hand;
export const energyOf = (state, side) => ({ energy: me(state, side).energy, max: me(state, side).maxEnergy });
export const trapsOf = (state, side) => me(state, side).traps;

export function describeState(state) {
  return SIDES.map((side) => {
    const player = me(state, side);
    return `${side}: core ${player.core}, board [${player.board.map((f) => (f ? `${f.name} ${f.hp}` : '-')).join(', ')}]`;
  }).join(' | ');
}

export { DECK_SIZE, buildDeck };
