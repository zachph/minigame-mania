import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DECK_SIZE,
  RANKS,
  SUITS,
  TOTAL_POINTS,
  createDeck,
  shuffle,
  trickWinner,
} from '../src/games/shubat/cards.js';
import {
  DEALS_PER_MATCH,
  HAND_SIZE,
  createDeal,
  legalPlays,
  mustFollowSuit,
  playAndSettle,
  playCard,
  scoreOf,
  settleTrick,
  unseenCards,
} from '../src/games/shubat/rules.js';
import { chooseCard } from '../src/games/shubat/ai.js';

/** A repeatable shuffle, so a deal can be reasoned about. */
function seeded(seed = 1) {
  let state = seed;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

const deal = (seed = 1, leader = 'you') => createDeal({ random: seeded(seed), leader });

/** Plays a whole deal out with both sides on the AI. */
function playOut(state, level = 'normal', random = seeded(99)) {
  let guard = 0;
  while (!state.over && guard < 64) {
    const card = chooseCard(state, state.turn, level, random);
    state = playAndSettle(state, state.turn, card.id);
    guard += 1;
  }
  return state;
}

test('the deck is four herds of eight, every card distinct', () => {
  const deck = createDeck();
  assert.equal(deck.length, DECK_SIZE);
  assert.equal(deck.length, 32);
  assert.equal(new Set(deck.map((card) => card.id)).size, 32);
  for (const suit of SUITS) {
    const cards = deck.filter((card) => card.suit === suit.id);
    assert.deepEqual(cards.map((card) => card.rank).sort((a, b) => a - b), RANKS);
  }
});

test('a card is worth what it is strong', () => {
  for (const card of createDeck()) assert.equal(card.points, card.rank);
  assert.equal(TOTAL_POINTS, 144, 'thirty-six points a herd');
});

test('shuffling keeps every card, and the same seed deals the same hand', () => {
  const deck = createDeck();
  const once = shuffle(deck, seeded(5));
  const twice = shuffle(deck, seeded(5));
  assert.deepEqual(once.map((c) => c.id), twice.map((c) => c.id));
  assert.deepEqual([...once.map((c) => c.id)].sort(), [...deck.map((c) => c.id)].sort());
  assert.notDeepEqual(once.map((c) => c.id), deck.map((c) => c.id), 'and it actually shuffled');
});

test('the higher card of the led herd takes the trick', () => {
  const led = { suit: 'camel', rank: 5 };
  assert.equal(trickWinner(led, { suit: 'camel', rank: 6 }, 'yurt'), 'follower');
  assert.equal(trickWinner(led, { suit: 'camel', rank: 4 }, 'yurt'), 'leader');
});

test('a different herd loses, unless it is trumps', () => {
  const led = { suit: 'camel', rank: 8 };
  assert.equal(trickWinner(led, { suit: 'horse', rank: 8 }, 'yurt'), 'leader', 'off-herd never wins');
  assert.equal(trickWinner(led, { suit: 'yurt', rank: 1 }, 'yurt'), 'follower', 'a trump one beats an eight');
  assert.equal(trickWinner({ suit: 'yurt', rank: 5 }, { suit: 'yurt', rank: 6 }, 'yurt'), 'follower');
  assert.equal(trickWinner({ suit: 'yurt', rank: 5 }, { suit: 'camel', rank: 8 }, 'yurt'), 'leader');
});

test('a deal starts with five cards each, a trump turned up, and the rest in stock', () => {
  const state = deal();
  assert.equal(state.hands.you.length, HAND_SIZE);
  assert.equal(state.hands.rival.length, HAND_SIZE);
  assert.equal(state.stock.length, DECK_SIZE - HAND_SIZE * 2);
  assert.equal(state.trumpSuit, state.trumpCard.suit);
  assert.equal(state.stock[state.stock.length - 1].id, state.trumpCard.id, 'the trump is drawn last');
  assert.equal(state.turn, state.leader);
});

test('anything is playable while the stock lasts', () => {
  let state = deal();
  const led = state.hands.you[0];
  state = playCard(state, 'you', led.id);
  assert.equal(state.turn, 'rival');
  assert.equal(legalPlays(state, 'rival').length, HAND_SIZE, 'the rival may throw any card');
});

test('once the stock is empty you must follow the led herd', () => {
  let state = deal();
  state = { ...state, stock: [], leader: 'you', turn: 'you' };
  const led = state.hands.you[0];
  state = playCard(state, 'you', led.id);
  assert.equal(mustFollowSuit(state), true);

  const matching = state.hands.rival.filter((card) => card.suit === led.suit);
  const legal = legalPlays(state, 'rival');
  if (matching.length > 0) {
    assert.deepEqual(legal.map((c) => c.id).sort(), matching.map((c) => c.id).sort());
  } else {
    assert.equal(legal.length, state.hands.rival.length, 'void means anything goes');
  }
});

test('playing out of turn or an illegal card is refused', () => {
  const state = deal(1, 'you');
  assert.throws(() => playCard(state, 'rival', state.hands.rival[0].id), /turn/);
  assert.throws(() => playCard(state, 'you', 'camel-99'), /cannot play/);
});

test('the trick winner collects both cards, leads next and draws first', () => {
  let state = deal();
  const before = { you: state.hands.you.length, rival: state.hands.rival.length };
  const led = state.hands.you[0];
  state = playCard(state, 'you', led.id);
  const answer = state.hands.rival[0];
  const stockBefore = state.stock.length;
  state = playCard(state, 'rival', answer.id);

  assert.ok(state.pendingTrick, 'the trick waits on the table to be read');
  assert.equal(state.table.you.id, led.id, 'both cards are still showing');
  assert.equal(state.table.rival.id, answer.id);
  assert.deepEqual(legalPlays(state, 'you'), [], 'nobody plays until it is swept');
  state = settleTrick(state);

  const trick = state.tricks[0];
  assert.equal(state.tricks.length, 1);
  assert.equal(state.won[trick.winner].length, 2, 'both cards go to the winner');
  assert.equal(state.leader, trick.winner);
  assert.equal(state.turn, trick.winner, 'and leads the next trick');
  assert.equal(state.stock.length, stockBefore - 2, 'both players drew');
  assert.equal(state.hands.you.length, before.you);
  assert.equal(state.hands.rival.length, before.rival, 'back up to five');
  assert.equal(state.table.you, null);
  assert.equal(trick.value, trick.cards.you.points + trick.cards.rival.points);
});

test('a deal is sixteen tricks and every point is accounted for', () => {
  for (const seed of [3, 17, 42, 101]) {
    const state = playOut(deal(seed));
    assert.equal(state.over, true);
    assert.equal(state.tricks.length, 16, `seed ${seed}: sixteen tricks`);
    assert.equal(state.hands.you.length + state.hands.rival.length, 0, 'every card played');
    assert.equal(state.stock.length, 0, 'the stock is exhausted');
    assert.equal(
      scoreOf(state, 'you') + scoreOf(state, 'rival'),
      TOTAL_POINTS,
      `seed ${seed}: the points add up`
    );
    assert.equal(state.won.you.length + state.won.rival.length, DECK_SIZE);
  }
});

test('the winner is whoever holds more points', () => {
  const state = playOut(deal(7));
  const you = scoreOf(state, 'you');
  const rival = scoreOf(state, 'rival');
  assert.equal(state.winner, you === rival ? null : you > rival ? 'you' : 'rival');
  assert.match(state.reason, /\d/);
});

test('a match is two deals, one lead each', () => {
  assert.equal(DEALS_PER_MATCH, 2);
  assert.equal(deal(1, 'you').leader, 'you');
  assert.equal(deal(1, 'rival').leader, 'rival');
});

test('counting only ever sees what is public', () => {
  let state = deal(11);
  state = playCard(state, state.leader, state.hands[state.leader][0].id);
  const unseen = unseenCards(state, 'rival').map((card) => card.id);
  for (const card of state.hands.rival) {
    assert.ok(!unseen.includes(card.id), 'its own hand is not unseen');
  }
  for (const card of state.hands.you) {
    assert.ok(unseen.includes(card.id), "your hand is hidden, so it counts as unseen");
  }
  assert.ok(!unseen.includes(state.trumpCard.id), 'the face-up trump is public');
});

test('the rival only ever plays a legal card', () => {
  for (const level of ['easy', 'normal', 'hard']) {
    let state = deal(23, 'rival');
    const random = seeded(5);
    while (!state.over) {
      const card = chooseCard(state, state.turn, level, random);
      const legal = legalPlays(state, state.turn);
      assert.ok(legal.some((option) => option.id === card.id), `${level}: ${card.id} is legal`);
      state = playAndSettle(state, state.turn, card.id);
    }
  }
});

test('the rival trumps a fat trick rather than letting it go', () => {
  let state = deal(31, 'you');
  state = {
    ...state,
    leader: 'you',
    turn: 'rival',
    trumpSuit: 'yurt',
    table: { you: { id: 'camel-8', suit: 'camel', rank: 8, points: 8 }, rival: null },
    hands: {
      ...state.hands,
      rival: [
        { id: 'horse-1', suit: 'horse', rank: 1, points: 1 },
        { id: 'yurt-2', suit: 'yurt', rank: 2, points: 2 },
        { id: 'camel-3', suit: 'camel', rank: 3, points: 3 },
      ],
    },
  };
  const card = chooseCard(state, 'rival', 'normal', () => 0.9);
  assert.equal(card.id, 'yurt-2', 'the cheapest trump takes eight points');
});

test('the rival does not waste a big trump on a cheap trick', () => {
  let state = deal(37, 'you');
  state = {
    ...state,
    leader: 'you',
    turn: 'rival',
    trumpSuit: 'yurt',
    table: { you: { id: 'camel-1', suit: 'camel', rank: 1, points: 1 }, rival: null },
    hands: {
      ...state.hands,
      rival: [
        { id: 'horse-2', suit: 'horse', rank: 2, points: 2 },
        { id: 'yurt-8', suit: 'yurt', rank: 8, points: 8 },
      ],
    },
  };
  const card = chooseCard(state, 'rival', 'normal', () => 0.9);
  assert.equal(card.id, 'horse-2', 'one point is not worth an eight of trumps');
});

test('the harder rival wins more than it loses against the easier one', () => {
  let hardWins = 0;
  let easyWins = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    // The rival seat plays Hard, the other seat plays Easy; leads alternate.
    let state = deal(seed * 13, seed % 2 ? 'you' : 'rival');
    const random = seeded(seed * 7 + 1);
    while (!state.over) {
      const level = state.turn === 'rival' ? 'hard' : 'easy';
      state = playAndSettle(state, state.turn, chooseCard(state, state.turn, level, random).id);
    }
    if (scoreOf(state, 'rival') > scoreOf(state, 'you')) hardWins += 1;
    else if (scoreOf(state, 'you') > scoreOf(state, 'rival')) easyWins += 1;
  }
  assert.ok(hardWins > easyWins * 1.5, `hard ${hardWins} vs easy ${easyWins} over 40 deals`);
});
