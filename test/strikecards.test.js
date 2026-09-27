import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARDS_PER_PACK,
  COINS_PER_SALE,
  DECK_MAX,
  DECK_MIN,
  MAX_COPIES,
  PACK_COST,
  PACK_SIZE,
  RARITIES,
  RARITY_IDS,
  SUPPORT_DECK_MAX,
  SUPPORT_MAX_COPIES,
  SUPPORT_MAX_DIFFERENT,
  canAddCopy,
  canAddSupport,
  canBuyPack,
  countCopies,
  deckProblem,
  distinctCardsNeeded,
  isLegalDeck,
  openPack,
  rarityRank,
  rollRarity,
  sellValue,
  sellableCopies,
  spareCopies,
  supportDeckProblem,
} from '../src/games/strikecards/collection.js';
import { seededRandom } from '../src/core/utils.js';

test('the five tiers total exactly 100%', () => {
  assert.equal(RARITIES.length, 5);
  assert.equal(RARITIES.reduce((total, rarity) => total + rarity.chance, 0), 100);
  assert.deepEqual(RARITY_IDS, ['common', 'uncommon', 'rare', 'epic', 'legendary']);
  for (const rarity of RARITIES) {
    assert.ok(rarity.name && rarity.color && rarity.dark, `${rarity.id} is drawable`);
    assert.ok(rarity.chance > 0);
  }
  // Rarer tiers sort later, which is what a collection screen orders by.
  assert.ok(rarityRank('legendary') > rarityRank('epic'));
  assert.ok(rarityRank('common') < rarityRank('uncommon'));
});

test('a roll lands in the right band, right down to the boundaries', () => {
  const at = (percent) => rollRarity(() => percent / 100).id;

  assert.equal(at(0), 'common');
  assert.equal(at(39.999), 'common');
  assert.equal(at(40), 'uncommon', '40 is the first uncommon, not the last common');
  assert.equal(at(69.999), 'uncommon');
  assert.equal(at(70), 'rare');
  assert.equal(at(84.999), 'rare');
  assert.equal(at(85), 'epic');
  assert.equal(at(96.999), 'epic');
  assert.equal(at(97), 'legendary');
  assert.equal(at(99.999), 'legendary');
});

test('a pack is five cards, and none of them is promised', () => {
  const pack = openPack(seededRandom(7));
  assert.equal(pack.length, PACK_SIZE);
  assert.equal(PACK_SIZE, 5);
  for (const rarity of pack) assert.ok(RARITY_IDS.includes(rarity.id));

  // Every roll is independent: a pack of five commons is legal, just unlikely.
  const allCommon = openPack(() => 0.1);
  assert.deepEqual(allCommon.map((r) => r.id), Array(5).fill('common'));
});

test('rolls come out close to the advertised rates', () => {
  const random = seededRandom(20260927);
  const counts = Object.fromEntries(RARITY_IDS.map((id) => [id, 0]));
  const rolls = 200000;
  for (let i = 0; i < rolls; i += 1) counts[rollRarity(random).id] += 1;

  for (const rarity of RARITIES) {
    const actual = (counts[rarity.id] / rolls) * 100;
    assert.ok(
      Math.abs(actual - rarity.chance) < 0.5,
      `${rarity.id} came out at ${actual.toFixed(2)}%, not ${rarity.chance}%`
    );
  }
});

test('a deck is 20 to 30 cards, and says so when it is not', () => {
  const deck = (size) => Array.from({ length: size }, (_, i) => `card-${i}`);

  assert.equal(deckProblem(deck(20)), null, '20 is the floor');
  assert.equal(deckProblem(deck(25)), null);
  assert.equal(deckProblem(deck(30)), null, '30 is the ceiling');
  assert.equal(DECK_MIN, 20);
  assert.equal(DECK_MAX, 30);

  assert.match(deckProblem(deck(19)), /at least 20/);
  assert.match(deckProblem(deck(0)), /at least 20/);
  assert.match(deckProblem(deck(31)), /at most 30/);
  assert.match(deckProblem('not a deck'), /not a deck/i);

  assert.equal(isLegalDeck(deck(24)), true);
  assert.equal(isLegalDeck(deck(19)), false);
});

test('a deck holds at most two copies of a card', () => {
  assert.equal(MAX_COPIES, 2);

  // Twenty cards, ten different ones, two of each: the tightest legal deck.
  const pairs = [];
  for (let i = 0; i < 10; i += 1) pairs.push(`card-${i}`, `card-${i}`);
  assert.equal(pairs.length, 20);
  assert.equal(deckProblem(pairs), null);
  assert.equal(distinctCardsNeeded(20), 10, 'which is as few different cards as 20 can be built from');
  assert.equal(distinctCardsNeeded(30), 15);

  const triple = [...pairs.slice(0, 19), 'card-0'];
  assert.match(deckProblem(triple), /at most 2 copies/);
  assert.match(deckProblem(triple, (id) => id.toUpperCase()), /CARD-0/, 'and it names the card');

  const counts = countCopies(['a', 'b', 'a', 'a']);
  assert.equal(counts.get('a'), 3);
  assert.equal(counts.get('b'), 1);
});

test('five cards sold buys one pack, which holds five cards', () => {
  assert.equal(COINS_PER_SALE, 20);
  assert.equal(PACK_COST, 100);
  assert.equal(CARDS_PER_PACK, 5);
  assert.equal(CARDS_PER_PACK, PACK_SIZE, 'so the shop neither prints cards nor eats them');

  assert.equal(sellValue(1), 20);
  assert.equal(sellValue(5), 100, 'five spares is exactly a pack');
  assert.equal(sellValue(0), 0);

  assert.equal(canBuyPack(99), false);
  assert.equal(canBuyPack(100), true);
  assert.equal(canBuyPack(240), true);
});

test('you can sell spares but never your last copy', () => {
  assert.equal(sellableCopies(0), 0);
  assert.equal(sellableCopies(1), 0, 'one copy is not a spare');
  assert.equal(sellableCopies(2), 1);
  assert.equal(sellableCopies(5), 4);

  // The ones no deck could hold even if you wanted them to.
  assert.equal(spareCopies(1), 0);
  assert.equal(spareCopies(2), 0, 'two is exactly what a deck may hold');
  assert.equal(spareCopies(3), 1, 'the third is dead weight');
  assert.equal(spareCopies(6), 4);
});

test('the + button knows when to stop', () => {
  const deck = ['ember', 'ember', 'shard'];

  assert.equal(canAddCopy(deck, 'shard'), true, 'a second Shard is fine');
  assert.equal(canAddCopy(deck, 'ember'), false, 'a third Ember is not');
  assert.equal(canAddCopy(deck, 'newcard'), true);

  // You cannot put in more copies than you own.
  assert.equal(canAddCopy(deck, 'shard', 1), false, 'you only pulled one Shard');
  assert.equal(canAddCopy(deck, 'shard', 2), true);

  const full = Array.from({ length: DECK_MAX }, (_, i) => `card-${Math.floor(i / 2)}`);
  assert.equal(full.length, 30);
  assert.equal(deckProblem(full), null, 'fifteen pairs is a full legal deck');
  assert.equal(canAddCopy(full, 'anything'), false, 'and nothing else fits');
});


/* ---------------------------------------------------------- the supports */

test('a support loadout is five different cards, three copies each', () => {
  assert.equal(SUPPORT_MAX_DIFFERENT, 5);
  assert.equal(SUPPORT_MAX_COPIES, 3);
  assert.equal(SUPPORT_DECK_MAX, 15);

  const full = [];
  for (const id of ['guard', 'rally', 'counter', 'mend', 'recall']) full.push(id, id, id);
  assert.equal(full.length, 15);
  assert.equal(supportDeckProblem(full), null, 'fifteen cards, five kinds - the biggest legal loadout');

  // A sixth kind is one too many. (The first twelve cards are only four kinds,
  // so a fifth would still be fine there - it takes all five before it bites.)
  assert.equal(supportDeckProblem([...full.slice(0, 12), 'fifth']), null);
  assert.match(supportDeckProblem([...full, 'sixth']), /5 different supports/);
  assert.match(supportDeckProblem(["guard", "guard", "guard", "guard"]), /At most 3 copies/);
  assert.match(supportDeckProblem(['a', 'a', 'a', 'a'], (id) => id.toUpperCase()), /A/);

  // Nothing says a loadout has to be full.
  assert.equal(supportDeckProblem(['guard']), null);
  assert.equal(supportDeckProblem([]), null);
});

test('the support + button knows about both limits', () => {
  const four = ['guard', 'rally', 'counter', 'mend'];
  assert.equal(canAddSupport(four, 'recall'), true, 'a fifth kind fits');
  assert.equal(canAddSupport([...four, 'recall'], 'sixth'), false, 'a sixth does not');
  assert.equal(canAddSupport([...four, 'recall'], 'guard'), true, 'but more of one you already take does');

  const maxed = ['guard', 'guard', 'guard'];
  assert.equal(canAddSupport(maxed, 'guard'), false, 'three is the ceiling');
  assert.equal(canAddSupport(maxed, 'guard', 5), false, 'even owning five of them');
  assert.equal(canAddSupport(['guard'], 'guard', 1), false, 'and you cannot take one you do not own');
});
