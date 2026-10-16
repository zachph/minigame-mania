import { collectible } from './cards.js';
import { SUPPORTS } from './supports.js';
import { PACK_SIZE, RARITY_IDS, rarityRank, rollRarity } from './collection.js';

/**
 * What actually comes out of a pack.
 *
 * `collection.js` rolls the tier; this turns a tier into a card you can hold.
 * They are apart because the odds were settled long before the cards were, and
 * they still are: rare, epic and legendary have nothing in them yet.
 */

export const PACK_KINDS = [
  {
    id: 'strike',
    name: 'Strike pack',
    blurb: 'Five cards for the deck you fight with.',
    color: '#59aef0',
    dark: '#15375c',
  },
  {
    id: 'support',
    name: 'Support pack',
    blurb: 'Five cards for the loadout you play off-turn.',
    color: '#b98cff',
    dark: '#3c2170',
  },
];

export const PACK_BY_ID = new Map(PACK_KINDS.map((pack) => [pack.id, pack]));
export const getPackKind = (id) => {
  const found = PACK_BY_ID.get(id);
  if (!found) throw new Error(`Unknown pack: ${id}`);
  return found;
};

/** Everything a pack of this kind could ever hand you. */
export const poolFor = (kind) => (kind === 'support' ? [...SUPPORTS] : collectible());

/** The pool split up by tier, as `{ common: [...], rare: [...] }`. */
export function byRarity(pool) {
  const groups = Object.fromEntries(RARITY_IDS.map((id) => [id, []]));
  for (const card of pool) {
    if (groups[card.rarity]) groups[card.rarity].push(card);
  }
  return groups;
}

/** The tiers this kind of pack has nothing in, rarest last. */
export const emptyTiers = (kind) => {
  const groups = byRarity(poolFor(kind));
  return RARITY_IDS.filter((id) => groups[id].length === 0);
};

/**
 * One card of this tier.
 *
 * A tier with no cards in it falls to the next one down that has some. That is
 * a bridge, not a rule: rare, epic and legendary are empty today, so very
 * nearly a third of every pack lands in a tier that cannot pay out. Rather than
 * hand back nothing, or quietly reshuffle the odds, the roll keeps its proper
 * weight and the prize drops a tier. The moment a rare exists it is handed out
 * at its real 15%, and nothing here has to change.
 *
 * Returns `{ card, rolled, fellFrom }` - `fellFrom` is the tier it should have
 * been, and null when it got what it rolled.
 */
export function pickOfRarity(pool, rarityId, random = Math.random) {
  const groups = byRarity(pool);
  const rank = rarityRank(rarityId);
  if (rank < 0) throw new Error(`Unknown rarity: ${rarityId}`);

  // Down towards common first, then back up, so there is always something.
  const order = [
    ...RARITY_IDS.slice(0, rank + 1).reverse(),
    ...RARITY_IDS.slice(rank + 1),
  ];
  for (const id of order) {
    const tier = groups[id];
    if (!tier.length) continue;
    const card = tier[Math.floor(random() * tier.length)] || tier[0];
    return { card, rolled: rarityId, fellFrom: id === rarityId ? null : rarityId };
  }
  throw new Error('There are no cards at all to put in a pack');
}

/**
 * Opens one pack: five independent rolls, each turned into a card. Nothing is
 * guaranteed and duplicates are expected - that is what the coins are for.
 */
export function openPackOf(kind = 'strike', random = Math.random, size = PACK_SIZE) {
  const pool = poolFor(kind);
  return Array.from({ length: size }, () => {
    const rarity = rollRarity(random);
    return pickOfRarity(pool, rarity.id, random);
  });
}
