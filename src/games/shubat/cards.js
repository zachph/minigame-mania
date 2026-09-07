/**
 * The Shubat deck: four herds of eight, thirty-two cards.
 *
 * A card's rank is also its point value, so the strong cards are the ones worth
 * taking - an eight wins the trick and is worth eight when you collect it.
 */

export const SUITS = [
  { id: 'camel', name: 'Camels', color: '#e8b45c', dark: '#8a5b12', glyph: 'camel' },
  { id: 'horse', name: 'Horses', color: '#e2694a', dark: '#8f2f16', glyph: 'horse' },
  { id: 'falcon', name: 'Falcons', color: '#63a8e8', dark: '#15517f', glyph: 'falcon' },
  { id: 'yurt', name: 'Yurts', color: '#6fc48a', dark: '#1f7040', glyph: 'yurt' },
];

export const SUIT_BY_ID = new Map(SUITS.map((suit) => [suit.id, suit]));
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8];
export const DECK_SIZE = SUITS.length * RANKS.length;
export const TOTAL_POINTS = SUITS.length * RANKS.reduce((sum, rank) => sum + rank, 0);

export const cardId = (suit, rank) => `${suit}-${rank}`;
export const cardName = (card) => `${card.rank} of ${SUIT_BY_ID.get(card.suit).name}`;

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ id: cardId(suit.id, rank), suit: suit.id, rank, points: rank });
  }
  return deck;
}

/** Fisher-Yates with an injectable source, so a deal can be replayed exactly. */
export function shuffle(cards, random = Math.random) {
  const deck = cards.slice();
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Who takes the trick. The follower only wins by beating the led card in its
 * own suit, or by trumping a plain-suit lead.
 */
export function trickWinner(led, followed, trumpSuit) {
  if (followed.suit === led.suit) return followed.rank > led.rank ? 'follower' : 'leader';
  if (followed.suit === trumpSuit) return 'follower';
  return 'leader';
}

export const trickValue = (...cards) => cards.reduce((total, card) => total + (card?.points ?? 0), 0);
