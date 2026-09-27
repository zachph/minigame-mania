/**
 * The Strike Cards themselves.
 *
 * Two kinds go in the 30-card deck: strikers, which take the field and fight,
 * and gear, which has no body of its own and makes a striker better.
 *
 * Every number here is data. The battle reads it and does not care what any of
 * it is called, so re-costing a card is a one line edit.
 */

export const KINDS = {
  strike: { id: 'strike', name: 'Striker' },
  gear: { id: 'gear', name: 'Gear' },
};

/** `[ id, name, rarity, cost, speed, power, hp ]` for a striker. */
const striker = (id, name, rarity, cost, speed, power, hp, blurb = '') =>
  ({ id, name, kind: 'strike', rarity, cost, speed, power, hp, blurb });

/** `[ id, name, rarity, cost, boost ]` for gear - what it adds, to whatever wears it. */
const gear = (id, name, rarity, cost, boost, blurb = '') =>
  ({ id, name, kind: 'gear', rarity, cost, boost, blurb });

export const CARDS = [
  /* ------------------------------------------------------------- commons */
  striker('nipper', 'Nipper', 'common', 2, 6, 3, 3, 'Something to put down on turn one and not mind losing.'),
  striker('flicker', 'Flicker', 'common', 3, 9, 4, 2, 'The fastest thing at this rarity. Kills small, dies to anything that lives through it.'),
  striker('warden', 'Warden', 'common', 3, 2, 2, 6, 'Cheap, slow and annoying to get rid of.'),
  striker('hiver', 'Hiver', 'common', 4, 8, 6, 4, 'Quick and sharp, and it barely has to take a hit.'),
  striker('armoren', 'Armoren', 'common', 4, 3, 3, 7, 'Slow, blunt, and hard to shift.'),
  striker('razor', 'Razor', 'common', 5, 5, 8, 2, 'Hits harder than anything this cheap, and folds to a breath.'),
  striker('bulwark', 'Bulwark', 'common', 6, 2, 4, 12, 'Too big to kill in one swing, and it hits back every time.'),
  striker('gorewing', 'Gorewing', 'common', 6, 7, 9, 5, 'Fast and vicious. Only something faster puts it down.'),
  gear('iron-boots', 'Iron Boots', 'common', 3, { speed: 1 }, 'One more point of speed, which is sometimes the whole fight.'),
  gear('sword', 'Sword', 'common', 5, { power: 2 }, 'Two more damage on every swing it makes.'),
];

export const CARD_BY_ID = new Map(CARDS.map((card) => [card.id, card]));
export const getCard = (id) => {
  const card = CARD_BY_ID.get(id);
  if (!card) throw new Error(`Unknown card: ${id}`);
  return card;
};

export const strikersOf = (rarity) => CARDS.filter((c) => c.kind === 'strike' && c.rarity === rarity);
export const cardsOfRarity = (rarity) => CARDS.filter((card) => card.rarity === rarity);

/** A striker wearing its gear: the stats the battle should actually use. */
export function equipped(striker, gearList = []) {
  const out = { ...striker, gear: gearList.map((g) => g.id) };
  for (const piece of gearList) {
    for (const [stat, amount] of Object.entries(piece.boost || {})) {
      out[stat] = (out[stat] || 0) + amount;
      if (stat === 'hp') out.maxHp = (out.maxHp || striker.hp) + amount;
    }
  }
  return out;
}
