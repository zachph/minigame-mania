/**
 * The six Catchmon types, arranged as a cycle.
 *
 * Every type is strong against the next two types in the cycle and resisted by
 * the previous two, which leaves exactly one neutral matchup (the type
 * opposite it). No type is strictly better than another.
 *
 *   Ember -> Verdant -> Terra -> Storm -> Tide -> Shade -> (Ember)
 */
export const TYPES = [
  { id: 'ember', name: 'Ember', color: '#ff8552', accent: '#a32d05', glyph: 'flame' },
  { id: 'verdant', name: 'Verdant', color: '#63d17f', accent: '#1f7a3a', glyph: 'leaf' },
  { id: 'terra', name: 'Terra', color: '#d0a163', accent: '#7a5220', glyph: 'rock' },
  { id: 'storm', name: 'Storm', color: '#ffd84d', accent: '#a67c00', glyph: 'bolt' },
  { id: 'tide', name: 'Tide', color: '#57bdf7', accent: '#12608f', glyph: 'drop' },
  { id: 'shade', name: 'Shade', color: '#ab7ce6', accent: '#4b2a7a', glyph: 'moon' },
];

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
