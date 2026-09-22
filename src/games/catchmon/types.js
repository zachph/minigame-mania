/**
 * The six Catchmon types, arranged as a cycle.
 *
 * Every type is strong against the next two types in the cycle and resisted by
 * the previous two, which leaves exactly one neutral matchup (the type
 * opposite it). No type is strictly better than another.
 *
 *   Fire -> Grass -> Wind -> Dark -> Water -> Rock -> (Fire)
 *
 * So Fire beats Grass and Wind, is resisted by Water and Rock, and is neutral
 * against Dark. Reordering this array reshapes the whole chart, and nothing
 * else needs to change: move sets, art and the UI all read the type from here.
 */
export const TYPES = [
  { id: 'fire', name: 'Fire', color: '#ff8552', accent: '#a32d05', glyph: 'flame' },
  { id: 'grass', name: 'Grass', color: '#63d17f', accent: '#1f7a3a', glyph: 'leaf' },
  { id: 'wind', name: 'Wind', color: '#b9c6e8', accent: '#4f5f8c', glyph: 'swirl' },
  { id: 'dark', name: 'Dark', color: '#ab7ce6', accent: '#4b2a7a', glyph: 'moon' },
  { id: 'water', name: 'Water', color: '#4aa8f0', accent: '#12608f', glyph: 'drop' },
  { id: 'rock', name: 'Rock', color: '#d0a163', accent: '#7a5220', glyph: 'rock' },
];

/**
 * What every fighter of a type can do, on top of its four moves.
 *
 * One ability per type rather than one per character: thirty fighters would be
 * thirty things to learn, six is a thing you can hold in your head, and the
 * type you pick already means something because of the cycle above.
 *
 * `null` means that type has no ability yet. The battle simply skips it, so a
 * type can be filled in whenever without touching anything else.
 */
export const TYPE_ABILITIES = {
  fire: {
    name: 'Kindle',
    kind: 'burn',
    chance: 30,
    blurb: '30% chance to set the target burning when it lands a hit.',
  },
  grass: {
    name: 'Rootfeed',
    kind: 'lifesteal',
    chance: 30,
    share: 0.5,
    blurb: '30% chance to heal for half the damage it just dealt.',
  },
  wind: {
    name: 'Slipstream',
    kind: 'dodge',
    chance: 10,
    everyTurns: 2,
    blurb: 'On every second turn, a 10% chance to slip out of the way of anything.',
  },
  dark: {
    name: 'Ambush',
    kind: 'surge',
    chance: 30,
    multiplier: 1.5,
    blurb: '30% chance to strike for half again as much damage.',
  },
  water: {
    name: 'Undertow',
    kind: 'ramp',
    perLost: 0.2,      // for every fifth of its health gone...
    gain: 0.2,         // ...it hits this much harder
    blurb: 'Hits 0.2x harder for every 20% of its health it has lost.',
  },
  rock: {
    name: 'Backlash',
    kind: 'thorns',
    chance: 30,
    share: 0.2,
    blurb: '30% chance that whatever hits it takes 20% of that damage straight back.',
  },
};

export const abilityOf = (typeId) => TYPE_ABILITIES[typeId] || null;

export const TYPE_IDS = TYPES.map((type) => type.id);
export const TYPE_BY_ID = new Map(TYPES.map((type) => [type.id, type]));

export const SUPER_EFFECTIVE = 1.5;
export const RESISTED = 0.66;

/** Damage multiplier for `attackType` hitting `defendType`. */
export function effectiveness(attackType, defendType) {
  const attack = TYPE_IDS.indexOf(attackType);
  const defend = TYPE_IDS.indexOf(defendType);
  if (attack < 0 || defend < 0) return 1;
  const step = (defend - attack + TYPE_IDS.length) % TYPE_IDS.length;
  if (step === 1 || step === 2) return SUPER_EFFECTIVE;
  if (step === 4 || step === 5) return RESISTED;
  return 1;
}

/** The two types this type hits hard. */
export function strongAgainst(typeId) {
  const index = TYPE_IDS.indexOf(typeId);
  return [1, 2].map((step) => TYPE_IDS[(index + step) % TYPE_IDS.length]);
}

/** The two types that hit this type hard. */
export function weakTo(typeId) {
  const index = TYPE_IDS.indexOf(typeId);
  return [1, 2].map((step) => TYPE_IDS[(index - step + TYPE_IDS.length) % TYPE_IDS.length]);
}

export function effectivenessLabel(multiplier) {
  if (multiplier > 1) return 'Super effective!';
  if (multiplier < 1) return "It's resisted...";
  return '';
}
