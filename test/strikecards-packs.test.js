import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/core/utils.js';
import { PACK_COST, PACK_SIZE, COINS_PER_SALE, RARITY_IDS } from '../src/games/strikecards/collection.js';
import { collectible } from '../src/games/strikecards/cards.js';
import { SUPPORTS } from '../src/games/strikecards/supports.js';
import {
  PACK_KINDS,
  byRarity,
  emptyTiers,
  getPackKind,
  openPackOf,
  pickOfRarity,
  poolFor,
} from '../src/games/strikecards/packs.js';
import {
  KEY,
  addCards,
  anyCard,
  awardPack,
  buyPack,
  canBuy,
  cardsHeld,
  collectionProgress,
  emptyProfile,
  everyCard,
  loadProfile,
  normalise,
  ownedCount,
  saveProfile,
  seedProfile,
  sellOne,
  takePack,
} from '../src/games/strikecards/profile.js';
import { createPackOpening } from '../src/games/strikecards/packopen.js';
import {
  drawCardBack,
  drawCardFlip,
  drawRarityGlow,
  drawSealedPack,
} from '../src/games/strikecards/art.js';
import { createFakeContext } from './helpers.js';

/** A store that lives in a plain object, so no test touches localStorage. */
const fakeStore = (initial = {}) => {
  const data = { ...initial };
  return { read: (key) => (key in data ? data[key] : null), write: (key, value) => { data[key] = value; }, data };
};

/* -------------------------------------------------------------- the pool */

test('a strike pack and a support pack draw from different piles', () => {
  const strike = poolFor('strike');
  const support = poolFor('support');
  assert.ok(strike.length > 0 && support.length > 0);
  assert.equal(support.length, SUPPORTS.length);
  assert.ok(support.every((card) => card.kind === 'support'));
  assert.ok(strike.every((card) => card.kind !== 'support'));
});

test('no card that only exists as an evolution can be pulled', () => {
  assert.ok(poolFor('strike').every((card) => !card.form), 'an evolved form leaked into the pool');
});

test('a pack kind nobody defined is a loud failure', () => {
  assert.throws(() => getPackKind('mystery'), /Unknown pack/);
});

/* --------------------------------------------------------- the fallback */

const fakeCard = (id, rarity) => ({ id, name: id, rarity, kind: 'strike' });

test('a tier with cards in it hands one over and says nothing fell', () => {
  const pool = [fakeCard('c', 'common'), fakeCard('r', 'rare')];
  const result = pickOfRarity(pool, 'rare', () => 0);
  assert.equal(result.card.id, 'r');
  assert.equal(result.fellFrom, null);
});

test('an empty tier drops to the next one down, and says so', () => {
  const pool = [fakeCard('c', 'common'), fakeCard('u', 'uncommon')];
  const result = pickOfRarity(pool, 'legendary', () => 0);
  assert.equal(result.card.id, 'u', 'it fell to uncommon, not all the way to common');
  assert.equal(result.fellFrom, 'legendary', 'and it owns up to what it should have been');
  assert.equal(result.rolled, 'legendary');
});

test('the moment a tier has a card, nothing falls into it any more', () => {
  const before = [fakeCard('c', 'common')];
  assert.equal(pickOfRarity(before, 'rare', () => 0).fellFrom, 'rare');

  // Exactly what happens when the first rare is written into cards.js.
  const after = [...before, fakeCard('r', 'rare')];
  const result = pickOfRarity(after, 'rare', () => 0);
  assert.equal(result.card.id, 'r');
  assert.equal(result.fellFrom, null, 'the bridge took itself away');
});

test('a tier below the roll is preferred over one above it', () => {
  const pool = [fakeCard('c', 'common'), fakeCard('l', 'legendary')];
  assert.equal(pickOfRarity(pool, 'epic', () => 0).card.id, 'c', 'it should drop, never promote');
});

test('but it will reach upwards rather than hand back nothing', () => {
  const pool = [fakeCard('l', 'legendary')];
  const result = pickOfRarity(pool, 'common', () => 0);
  assert.equal(result.card.id, 'l');
  assert.equal(result.fellFrom, 'common');
});

test('an unknown rarity is a loud failure', () => {
  assert.throws(() => pickOfRarity([fakeCard('c', 'common')], 'mythic', () => 0), /Unknown rarity/);
});

test('a pack with nothing to put in it says so rather than returning undefined', () => {
  assert.throws(() => pickOfRarity([], 'common', () => 0), /no cards at all/);
});

test('every tier the real packs cannot fill is reported, so the UI can say it', () => {
  const missing = emptyTiers('strike');
  const groups = byRarity(poolFor('strike'));
  for (const id of RARITY_IDS) {
    assert.equal(missing.includes(id), groups[id].length === 0, `${id} reported wrongly`);
  }
});

/* ------------------------------------------------------------ opening it */

test('a pack is always five cards, whatever the dice do', () => {
  for (const kind of PACK_KINDS) {
    for (let seed = 1; seed <= 25; seed += 1) {
      const pulled = openPackOf(kind.id, seededRandom(seed));
      assert.equal(pulled.length, PACK_SIZE);
      for (const entry of pulled) {
        assert.ok(entry.card && entry.card.id, 'every slot holds a real card');
        assert.ok(RARITY_IDS.includes(entry.rolled));
      }
    }
  }
});

test('a support pack only ever contains supports', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    for (const entry of openPackOf('support', seededRandom(seed))) {
      assert.equal(entry.card.kind, 'support', `${entry.card.name} is not a support`);
    }
  }
});

test('the same seed opens the same pack twice', () => {
  const names = (seed) => openPackOf('strike', seededRandom(seed)).map((e) => e.card.id).join(',');
  assert.equal(names(7), names(7));
});

/* --------------------------------------------------------- what you own */

test('a profile read back out of a broken store is still a usable profile', () => {
  for (const junk of [null, undefined, 42, 'nonsense', [], { cards: 'no' }]) {
    const profile = normalise(junk);
    assert.deepEqual(profile.cards, {});
    assert.equal(profile.coins, 0);
    assert.deepEqual(profile.packs, { strike: 0, support: 0 });
  }
});

test('counts that make no sense are thrown away, not carried about', () => {
  const profile = normalise({
    cards: { hiver: 3, armoren: -2, razor: 'lots', sword: 0, 'a-card-that-was-deleted': 4 },
    coins: -50,
    packs: { strike: 2.7, support: -1 },
  });
  assert.deepEqual(profile.cards, { hiver: 3 });
  assert.equal(profile.coins, 0);
  assert.deepEqual(profile.packs, { strike: 2, support: 0 });
});

test('what you own survives a save and a load', () => {
  const store = fakeStore();
  const profile = seedProfile(emptyProfile());
  saveProfile(profile, store);
  const back = loadProfile(store);
  assert.deepEqual(back, profile);
  assert.ok(store.data[KEY], 'it went in under its own key');
});

test('a new player gets a deck but not the whole collection', () => {
  const profile = seedProfile(emptyProfile());
  const progress = collectionProgress(profile);
  assert.ok(progress.owned > 0, 'they got something');
  assert.ok(
    progress.owned < progress.total,
    'a complete collection on day one makes every pack a pile of duplicates',
  );
  assert.ok(cardsHeld(profile) >= 20, 'enough for a legal deck');
});

test('seeding a second time changes nothing', () => {
  const profile = seedProfile(emptyProfile());
  const copy = JSON.parse(JSON.stringify(profile));
  seedProfile(profile);
  assert.deepEqual(profile, copy);
});

test('every card that can be owned can be looked up again', () => {
  for (const card of everyCard()) {
    assert.equal(anyCard(card.id).id, card.id);
  }
});

test('adding cards says which ones you had never seen', () => {
  const profile = emptyProfile();
  const added = addCards(profile, ['hiver', 'hiver', 'razor']);
  assert.deepEqual(added.map((entry) => entry.isNew), [true, false, true]);
  assert.deepEqual(added.map((entry) => entry.owned), [1, 2, 1]);
  assert.equal(ownedCount(profile, 'hiver'), 2);
});

/* -------------------------------------------------------------- the shop */

test('selling a spare pays, and the last copy is never for sale', () => {
  const profile = emptyProfile();
  addCards(profile, ['hiver', 'hiver']);
  assert.equal(sellOne(profile, 'hiver'), true);
  assert.equal(profile.coins, COINS_PER_SALE);
  assert.equal(ownedCount(profile, 'hiver'), 1);

  assert.equal(sellOne(profile, 'hiver'), false, 'it sold the last one');
  assert.equal(ownedCount(profile, 'hiver'), 1);
  assert.equal(profile.coins, COINS_PER_SALE, 'and it paid for the privilege');
});

test('selling something you do not own does nothing at all', () => {
  const profile = emptyProfile();
  assert.equal(sellOne(profile, 'hiver'), false);
  assert.equal(profile.coins, 0);
});

test('five spares buys exactly one pack', () => {
  const profile = emptyProfile();
  addCards(profile, Array(6).fill('hiver'));
  for (let i = 0; i < 5; i += 1) sellOne(profile, 'hiver');
  assert.equal(profile.coins, PACK_COST);
  assert.equal(canBuy(profile), true);
  assert.equal(buyPack(profile, 'strike'), true);
  assert.equal(profile.coins, 0);
  assert.equal(profile.packs.strike, 1);
});

test('you cannot buy a pack you cannot afford', () => {
  const profile = emptyProfile();
  profile.coins = PACK_COST - 1;
  assert.equal(buyPack(profile), false);
  assert.equal(profile.coins, PACK_COST - 1);
  assert.equal(profile.packs.strike, 0);
});

test('taking a pack off the pile needs there to be one', () => {
  const profile = emptyProfile();
  assert.equal(takePack(profile, 'strike'), false);
  awardPack(profile, 'strike');
  assert.equal(takePack(profile, 'strike'), true);
  assert.equal(profile.packs.strike, 0);
  assert.equal(takePack(profile, 'strike'), false);
});

test('a pack kind nobody defined cannot be awarded or taken', () => {
  const profile = emptyProfile();
  assert.throws(() => awardPack(profile, 'mystery'), /Unknown pack/);
  assert.throws(() => takePack(profile, 'mystery'), /Unknown pack/);
});

/* ----------------------------------------------------------- the opening */

const sceneWith = (results, onDone = () => {}) =>
  createPackOpening({ kind: 'strike', results, width: 960, height: 540, onDone });

const fakeResults = (n = 5) =>
  collectible().slice(0, n).map((card, i) => ({ card, rolled: card.rarity, fellFrom: null, isNew: i < 2, owned: i + 1 }));

test('one click does the next thing, all the way through', () => {
  let done = 0;
  const scene = sceneWith(fakeResults(), () => { done += 1; });
  assert.equal(scene.phase, 'sealed');

  scene.advance();
  assert.equal(scene.phase, 'dealing');

  scene.advance();                       // impatience skips the deal
  scene.update(0.01, null);
  assert.equal(scene.phase, 'revealing');

  for (let i = 0; i < 5; i += 1) {
    scene.advance();
    assert.equal(scene.revealed, i + 1);
    for (let t = 0; t < 40 && scene.flip < 1; t += 1) scene.update(1 / 60, null);
  }
  assert.equal(scene.phase, 'done');
  assert.equal(done, 0, 'it did not finish on its own');
  scene.advance();
  assert.equal(done, 1);
});

test('clicking mid-turn snaps that card over instead of skipping it', () => {
  const scene = sceneWith(fakeResults());
  scene.advance();
  scene.phaseTime = 99;
  scene.update(0.01, null);
  scene.advance();
  assert.equal(scene.revealed, 1);
  scene.update(1 / 120, null);
  assert.ok(scene.flip > 0 && scene.flip < 1, 'it is part way over');
  scene.advance();
  assert.equal(scene.revealed, 1, 'the click finished this card rather than starting the next');
  assert.equal(scene.flip, 1);
});

test('the summary counts what was actually new, and names the best tier', () => {
  const results = fakeResults();
  const scene = sceneWith(results);
  scene.revealAll();
  const best = results.reduce((top, r) => (RARITY_IDS.indexOf(r.card.rarity) > RARITY_IDS.indexOf(top) ? r.card.rarity : top), 'common');
  assert.match(scene.summary(), /2 you had never seen/);
  assert.ok(scene.summary().toLowerCase().includes(best), `should name ${best}`);
});

test('a pack of nothing but duplicates says so plainly', () => {
  const results = fakeResults().map((r) => ({ ...r, isNew: false }));
  assert.match(sceneWith(results).summary(), /nothing you did not already have/);
});

test('the whole opening draws, at every phase, without producing NaN', () => {
  const ctx = createFakeContext();
  for (const kind of PACK_KINDS) {
    const scene = createPackOpening({
      kind: kind.id, results: fakeResults(), width: 960, height: 540, onDone: () => {},
    });
    scene.render(ctx);                       // sealed
    scene.advance();
    scene.update(0.1, null);
    scene.render(ctx);                       // mid-deal
    scene.phaseTime = 99;
    scene.update(0.01, null);
    scene.advance();
    scene.update(1 / 120, null);
    scene.render(ctx);                       // mid-flip
    scene.revealAll();
    scene.render(ctx);                       // done
  }
  assert.ok(ctx.calls > 100);
});

test('the pack art draws on its own too', () => {
  const ctx = createFakeContext();
  drawCardBack(ctx, 10, 10);
  drawSealedPack(ctx, 480, 270, PACK_KINDS[0], { shake: 1, scale: 1.1 });
  for (const turn of [0, 0.25, 0.5, 0.75, 1]) {
    drawCardFlip(ctx, collectible()[0], 10, 10, turn, {});
  }
  for (const id of RARITY_IDS) drawRarityGlow(ctx, 10, 10, id, 1);
  assert.ok(ctx.calls > 40);
});
