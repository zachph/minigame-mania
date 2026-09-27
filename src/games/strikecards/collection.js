/**
 * Strike Cards: the collection rules.
 *
 * What a card *does* is not decided yet, so nothing here knows. This is the
 * layer around the cards - how rare each one is, what comes out of a pack, and
 * what counts as a legal deck - and all of it is settled, so it is worth
 * pinning down and testing before the battle exists to use it.
 */

/** The five tiers, rarest last. `chance` is a percentage and they total 100. */
export const RARITIES = [
  { id: 'common', name: 'Common', chance: 40, color: '#b7c0cf', dark: '#3c4452' },
  { id: 'uncommon', name: 'Uncommon', chance: 30, color: '#6fd48a', dark: '#256b3b' },
  { id: 'rare', name: 'Rare', chance: 15, color: '#59aef0', dark: '#1a5a8c' },
  { id: 'epic', name: 'Epic', chance: 12, color: '#b98cff', dark: '#4d2a86' },
  { id: 'legendary', name: 'Legendary', chance: 3, color: '#ffd166', dark: '#8a6410' },
];

export const RARITY_BY_ID = new Map(RARITIES.map((rarity) => [rarity.id, rarity]));
export const RARITY_IDS = RARITIES.map((rarity) => rarity.id);

/** How rare one tier is against another, for sorting a collection. */
export const rarityRank = (id) => RARITY_IDS.indexOf(id);

export const PACK_SIZE = 5;
export const DECK_MIN = 20;
export const DECK_MAX = 30;

/**
 * One roll on the table. Walking the tiers and subtracting keeps the boundaries
 * exact: a roll of 0.40 is the first uncommon, not the last common.
 */
export function rollRarity(random = Math.random) {
  let roll = random() * 100;
  for (const rarity of RARITIES) {
    if (roll < rarity.chance) return rarity;
    roll -= rarity.chance;
  }
  // Only reachable if a random source hands back exactly 1.
  return RARITIES[0];
}

/** Five independent rolls. Nothing in a pack is guaranteed. */
export function openPack(random = Math.random, size = PACK_SIZE) {
  return Array.from({ length: size }, () => rollRarity(random));
}

/**
 * What is wrong with this deck, or null if nothing is. Returns the reason
 * rather than a bare false so the deck builder can say why the button is off.
 */
export function deckProblem(cardIds) {
  if (!Array.isArray(cardIds)) return 'That is not a deck.';
  if (cardIds.length < DECK_MIN) return `A deck needs at least ${DECK_MIN} cards - this one has ${cardIds.length}.`;
  if (cardIds.length > DECK_MAX) return `A deck holds at most ${DECK_MAX} cards - this one has ${cardIds.length}.`;
  return null;
}

export const isLegalDeck = (cardIds) => deckProblem(cardIds) === null;
