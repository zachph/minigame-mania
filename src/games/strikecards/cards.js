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

/**
 * Two colours per card, because every one of them is drawn from code and a
 * roster where everything is the same grey wedge is not a roster.
 */
const TINTS = {
  nipper: ['#c9d46a', '#5e6a1f'],
  flicker: ['#ffe9a8', '#8a6a10'],
  warden: ['#9fb4c8', '#3b4a5c'],
  hiver: ['#ffc247', '#7a4a06'],
  armoren: ['#b98a5e', '#4d3117'],
  razor: ['#e4eaf2', '#5a6675'],
  bulwark: ['#a8a29a', '#494440'],
  gorewing: ['#e2707a', '#5e1c26'],
  zaplin: ['#9be8ff', '#1a5b80'],
  bolter: ['#7fd4ff', '#144a70'],
  stormbeat: ['#c8a4ff', '#3a2070'],
  sparkfly: ['#8ef0a8', '#1d6b3c'],
  duskmoth: ['#b99ae0', '#432a66'],
  stonewall: ['#9c9488', '#403b33'],
  windkin: ['#cfe6ff', '#4a6a8c'],
  ravener: ['#ff8b6b', '#6b1f10'],
  warpike: ['#d0b483', '#5c4520'],
  tank: ['#8fa07e', '#313b28'],
  'iron-boots': ['#8fa3b8', '#333f4d'],
  sword: ['#dfe6ef', '#4a5563'],
  greatshield: ['#c2a663', '#5c4a1c'],
  spurs: ['#e0c98f', '#6b5320'],
};

const tintOf = (id) => TINTS[id] || ['#b7c0cf', '#3c4452'];

/** `[ id, name, rarity, cost, speed, power, hp ]` for a striker. */
const striker = (id, name, rarity, cost, speed, power, hp, blurb = '') =>
  ({ id, name, kind: 'strike', rarity, cost, speed, power, hp, blurb,
    tint: tintOf(id)[0], shade: tintOf(id)[1] });

/**
 * A striker that grows on the board. `into` is the form it becomes and `after`
 * is how many of its owner's turns it has to survive first.
 *
 * The later forms are not cards you can own or pull - they are what the first
 * one turns into - so they carry `form: true` and never appear in a pack.
 */
const evolving = (base, into, after) => ({ ...base, evolvesTo: into, evolvesAfter: after });
const form = (id, name, cost, speed, power, hp, blurb = '') =>
  ({ id, name, kind: 'strike', rarity: 'uncommon', form: true, cost, speed, power, hp, blurb,
    tint: tintOf(id)[0], shade: tintOf(id)[1] });

/** `[ id, name, rarity, cost, boost ]` for gear - what it adds, to whatever wears it. */
const gear = (id, name, rarity, cost, boost, blurb = '') =>
  ({ id, name, kind: 'gear', rarity, cost, boost, blurb,
    tint: tintOf(id)[0], shade: tintOf(id)[1] });

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

  /* ----------------------------------------------------------- uncommons */
  evolving(
    striker('zaplin', 'Zaplin', 'uncommon', 8, 8, 8, 8, 'Strong at everything, and it does not stay merely strong.'),
    'bolter', 1,
  ),
  striker('sparkfly', 'Sparkfly', 'uncommon', 4, 9, 5, 3, 'Fast enough to pick its fights and cheap enough to lose.'),
  striker('duskmoth', 'Duskmoth', 'uncommon', 5, 6, 6, 4, 'No weakness worth naming and no trick either.'),
  striker('stonewall', 'Stonewall', 'uncommon', 5, 1, 2, 10, 'It will not kill anything. It will not move either.'),
  striker('windkin', 'Windkin', 'uncommon', 6, 8, 8, 2, 'Kills almost anything it goes first against, and dies to a stiff breeze.'),
  striker('ravener', 'Ravener', 'uncommon', 7, 6, 12, 6, 'Twelve damage: enough to take the biggest thing off the board in one swing.'),
  striker('warpike', 'Warpike', 'uncommon', 7, 4, 7, 9, 'Big, heavy, and it does not fold to the first thing it meets.'),
  striker('tank', 'Tank', 'uncommon', 8, 2, 7, 12, 'Slowest thing in the game and the hardest to shift.'),
  gear('greatshield', 'Greatshield', 'uncommon', 4, { hp: 4 }, 'Four more health, for good.'),
  gear('spurs', 'Spurs', 'uncommon', 4, { speed: 2 }, 'Two more speed. Often the difference between swinging first and not.'),

  /* --- what Zaplin grows into. Not pulled from packs; only grown into. --- */
  evolving(form('bolter', 'Bolter', 8, 10, 8, 10, 'What a Zaplin becomes after a turn.'), 'stormbeat', 3),
  form('stormbeat', 'Stormbeat', 8, 12, 12, 12, 'What a Bolter becomes after three more. Nothing else comes close.'),
];

export const CARD_BY_ID = new Map(CARDS.map((card) => [card.id, card]));
export const getCard = (id) => {
  const card = CARD_BY_ID.get(id);
  if (!card) throw new Error(`Unknown card: ${id}`);
  return card;
};

export const strikersOf = (rarity) => CARDS.filter((c) => c.kind === 'strike' && c.rarity === rarity && !c.form);

/** What a pack may contain: everything except the grown-into forms. */
export const collectible = () => CARDS.filter((card) => !card.form);
export const cardsOfRarity = (rarity) => collectible().filter((card) => card.rarity === rarity);

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
