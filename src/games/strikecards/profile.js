import { read, write } from '../../core/storage.js';
import { collectible, getCard } from './cards.js';
import { SUPPORTS, SUPPORT_BY_ID } from './supports.js';
import { COINS_PER_SALE, PACK_COST, sellableCopies } from './collection.js';

/**
 * What you own between matches: your cards, your coins, and the packs you have
 * not opened yet.
 *
 * Everything here takes a `store` so a test can hand it a plain object instead
 * of localStorage. The shape that comes back out of storage is never trusted -
 * it is whatever was in the browser last time, which could be anything at all -
 * so `normalise` rebuilds it from scratch and throws away what it does not
 * recognise, including cards that have since been renamed or deleted.
 */

export const KEY = 'strikecards:profile';
export const PACK_KINDS = ['strike', 'support'];

const realStore = { read, write };

export const emptyProfile = () => ({ cards: {}, coins: 0, packs: { strike: 0, support: 0 } });

/** Every card that can be owned, strike cards and supports together. */
export const everyCard = () => [...collectible(), ...SUPPORTS];

export const cardExists = (id) => SUPPORT_BY_ID.has(id) || collectible().some((card) => card.id === id);

/** Looks a card up whichever list it lives in. */
export function anyCard(id) {
  if (SUPPORT_BY_ID.has(id)) return SUPPORT_BY_ID.get(id);
  return getCard(id);
}

const countOf = (value) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Rebuilds a profile from whatever was in storage, dropping anything odd. */
export function normalise(raw) {
  const profile = emptyProfile();
  if (!raw || typeof raw !== 'object') return profile;

  if (raw.cards && typeof raw.cards === 'object') {
    for (const [id, value] of Object.entries(raw.cards)) {
      const count = countOf(value);
      // A card that no longer exists is dropped rather than carried forever.
      if (count > 0 && cardExists(id)) profile.cards[id] = count;
    }
  }
  profile.coins = countOf(raw.coins);
  if (raw.packs && typeof raw.packs === 'object') {
    for (const kind of PACK_KINDS) profile.packs[kind] = countOf(raw.packs[kind]);
  }
  return profile;
}

export function loadProfile(store = realStore) {
  return normalise(store.read(KEY));
}

export function saveProfile(profile, store = realStore) {
  store.write(KEY, profile);
  return profile;
}

/* ------------------------------------------------------------ the basics */

export const ownedCount = (profile, id) => profile.cards[id] || 0;
export const owns = (profile, id) => ownedCount(profile, id) > 0;

/** How much of the collection you have seen, for the line on the home screen. */
export function collectionProgress(profile) {
  const all = everyCard();
  const owned = all.filter((card) => owns(profile, card.id)).length;
  return { owned, total: all.length };
}

/** Total cards held, counting duplicates. */
export const cardsHeld = (profile) =>
  Object.values(profile.cards).reduce((sum, count) => sum + count, 0);

/**
 * Adds cards and says what each one meant: a card you had never seen before is
 * worth announcing, a sixth copy of a common is not.
 */
export function addCards(profile, ids) {
  return ids.map((id) => {
    const before = ownedCount(profile, id);
    profile.cards[id] = before + 1;
    return { id, isNew: before === 0, owned: before + 1 };
  });
}

/* ------------------------------------------------------------- the shop */

export function awardPack(profile, kind = 'strike', count = 1) {
  if (!PACK_KINDS.includes(kind)) throw new Error(`Unknown pack: ${kind}`);
  profile.packs[kind] += count;
  return profile.packs[kind];
}

/** Takes one unopened pack off the pile. Returns false if there were none. */
export function takePack(profile, kind) {
  if (!PACK_KINDS.includes(kind)) throw new Error(`Unknown pack: ${kind}`);
  if (profile.packs[kind] <= 0) return false;
  profile.packs[kind] -= 1;
  return true;
}

export const canBuy = (profile) => profile.coins >= PACK_COST;

export function buyPack(profile, kind = 'strike') {
  if (!canBuy(profile)) return false;
  profile.coins -= PACK_COST;
  awardPack(profile, kind);
  return true;
}

/**
 * Sells one spare. Never the last copy - see `sellableCopies`: a collection you
 * have torn a hole in is not a mistake worth letting someone make by accident.
 */
export function sellOne(profile, id) {
  if (sellableCopies(ownedCount(profile, id)) <= 0) return false;
  profile.cards[id] -= 1;
  profile.coins += COINS_PER_SALE;
  return true;
}

/* ------------------------------------------------------- the first run */

/**
 * What a new player starts with: enough for a legal deck, and no more.
 *
 * Deliberately not one of everything. A complete collection on the first day
 * would make every pack a pile of duplicates and nothing would ever come up
 * new, which is most of the point of opening one. So the commons come two at
 * a time, a few uncommons come along to make a thirty-card deck possible, and
 * the rest of the uncommons - and every support past the first three - are
 * left out there to be found.
 */
export const STARTER_UNCOMMONS = ['sparkfly', 'duskmoth', 'spurs', 'stonewall'];
export const STARTER_SUPPORTS = 3;

export function seedProfile(profile) {
  if (cardsHeld(profile) > 0) return profile;
  for (const card of collectible()) {
    if (card.rarity === 'common') profile.cards[card.id] = 2;
  }
  for (const id of STARTER_UNCOMMONS) {
    if (cardExists(id)) profile.cards[id] = 1;
  }
  for (const support of SUPPORTS.slice(0, STARTER_SUPPORTS)) profile.cards[support.id] = 3;
  profile.packs.strike = 2;
  profile.packs.support = 1;
  return profile;
}
