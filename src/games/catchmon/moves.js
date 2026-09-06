import { TYPES } from './types.js';

/**
 * Every fighter knows four moves. Typed moves are built from six archetypes so
 * each type gets the same toolkit with its own flavour, and the neutral moves
 * below are shared by everyone.
 *
 * A move is:
 *   power      0 for support moves
 *   accuracy   percentage
 *   cooldown   turns before it can be used again (0 = every turn)
 *   priority   higher goes first regardless of speed
 *   hits       [min, max] strikes for multi-hit moves
 *   effect     see `battle.js` for how each field is applied
 */
const ARCHETYPES = [
  { key: 'quick', power: 42, accuracy: 100, cooldown: 0, priority: 1, blurb: 'A fast jab that always strikes first.' },
  { key: 'standard', power: 64, accuracy: 95, cooldown: 0, priority: 0, blurb: 'A reliable attack.' },
  { key: 'heavy', power: 108, accuracy: 82, cooldown: 2, priority: 0, blurb: 'A punishing hit that needs time to recharge.' },
  { key: 'status', power: 0, accuracy: 90, cooldown: 2, priority: 0, blurb: '' },
  { key: 'drain', power: 56, accuracy: 95, cooldown: 1, priority: 0, effect: { drain: 0.5 }, blurb: 'Heals for half the damage dealt.' },
  { key: 'volley', power: 26, accuracy: 90, cooldown: 1, priority: 0, hits: [2, 3], blurb: 'Strikes two or three times.' },
];

/** Per-type names, plus what that type's status move does. */
const TYPE_MOVES = {
  fire: {
    quick: 'Ember Jab',
    standard: 'Flame Lash',
    heavy: 'Inferno Core',
    status: 'Scorch Mark',
    drain: 'Cinder Siphon',
    volley: 'Ash Volley',
    statusEffect: { status: 'burn', chance: 100, target: 'foe' },
    statusBlurb: 'Burns the foe: chip damage each turn and weaker attacks.',
  },
  grass: {
    quick: 'Vine Flick',
    standard: 'Thorn Strike',
    heavy: 'Forest Judgment',
    status: 'Snare Roots',
    drain: 'Sap Drain',
    volley: 'Bramble Volley',
    statusEffect: { status: 'root', chance: 100, target: 'foe' },
    statusBlurb: 'Roots the foe in place so it cannot be switched out.',
  },
  rock: {
    quick: 'Pebble Toss',
    standard: 'Stone Fist',
    heavy: 'Tectonic Slam',
    status: 'Sandblast',
    drain: 'Strata Siphon',
    volley: 'Rubble Volley',
    statusEffect: { stat: 'def', stages: -2, chance: 100, target: 'foe' },
    statusBlurb: "Scours away the foe's defence.",
  },
  wind: {
    quick: 'Gust Jab',
    standard: 'Cyclone Claw',
    heavy: 'Tempest Nova',
    status: 'Vacuum Snare',
    drain: 'Updraft Siphon',
    volley: 'Gale Volley',
    statusEffect: { status: 'stun', chance: 100, target: 'foe' },
    statusBlurb: 'Leaves the foe reeling, which may cost it a turn.',
  },
  water: {
    quick: 'Bubble Snap',
    standard: 'Tidal Slash',
    heavy: 'Abyssal Surge',
    status: 'Frost Veil',
    drain: 'Undertow',
    volley: 'Spray Volley',
    statusEffect: { status: 'chill', chance: 100, target: 'foe' },
    statusBlurb: 'Chills the foe, halving its speed.',
  },
  dark: {
    quick: 'Shadow Nip',
    standard: 'Umbral Claw',
    heavy: 'Void Collapse',
    status: 'Hex Mark',
    drain: 'Soul Drain',
    volley: 'Phantom Volley',
    statusEffect: { stat: 'atk', stages: -2, chance: 100, target: 'foe' },
    statusBlurb: "Hexes the foe, sapping its attack.",
  },
};

const NEUTRAL_MOVES = [
  {
    id: 'ram', name: 'Ram', type: null, power: 48, accuracy: 100, cooldown: 0, priority: 0,
    description: 'A plain body slam. Never resisted, never boosted.',
  },
  {
    id: 'bulwark', name: 'Bulwark', type: null, power: 0, accuracy: 100, cooldown: 2, priority: 0,
    effect: { stat: 'def', stages: 2, chance: 100, target: 'self' },
    description: 'Sharply raises your defence.',
  },
  {
    id: 'focus', name: 'Focus', type: null, power: 0, accuracy: 100, cooldown: 2, priority: 0,
    effect: { stat: 'atk', stages: 2, chance: 100, target: 'self' },
    description: 'Sharply raises your attack.',
  },
  {
    id: 'mend', name: 'Mend', type: null, power: 0, accuracy: 100, cooldown: 3, priority: 0, uses: 2,
    effect: { heal: 0.35 },
    description: 'Restores 35% of max HP. Twice per battle.',
  },
  {
    id: 'snare', name: 'Snare', type: null, power: 0, accuracy: 95, cooldown: 1, priority: 0,
    effect: { stat: 'spd', stages: -2, chance: 100, target: 'foe' },
    description: "Sharply lowers the foe's speed.",
  },
  {
    id: 'guard-break', name: 'Guard Break', type: null, power: 34, accuracy: 95, cooldown: 1, priority: 0,
    effect: { stat: 'def', stages: -1, chance: 100, target: 'foe' },
    description: "A light hit that lowers the foe's defence.",
  },
  {
    id: 'shield', name: 'Shield', type: null, power: 0, accuracy: 100, cooldown: 3, priority: 4, uses: 3,
    effect: { shield: true },
    description: 'Blocks all damage for one turn. Three times per battle.',
  },
  {
    id: 'second-wind', name: 'Second Wind', type: null, power: 0, accuracy: 100, cooldown: 4, priority: 0, uses: 2,
    effect: { heal: 0.2, cure: true },
    description: 'Restores 20% of max HP and clears status. Twice per battle.',
  },
];

function buildTypedMoves() {
  const moves = [];
  for (const type of TYPES) {
    const flavour = TYPE_MOVES[type.id];
    for (const archetype of ARCHETYPES) {
      const isStatus = archetype.key === 'status';
      moves.push({
        id: `${type.id}-${archetype.key}`,
        name: flavour[archetype.key],
        type: type.id,
        power: archetype.power,
        accuracy: archetype.accuracy,
        cooldown: archetype.cooldown,
        priority: archetype.priority,
        hits: archetype.hits || null,
        effect: isStatus ? flavour.statusEffect : archetype.effect || null,
        description: isStatus ? flavour.statusBlurb : archetype.blurb,
      });
    }
  }
  return moves;
}

export const MOVES = [...buildTypedMoves(), ...NEUTRAL_MOVES].map((move) => ({
  hits: null,
  effect: null,
  uses: null,
  ...move,
  category: move.power > 0 ? 'attack' : 'support',
}));

export const MOVE_BY_ID = new Map(MOVES.map((move) => [move.id, move]));

export function getMove(id) {
  const move = MOVE_BY_ID.get(id);
  if (!move) throw new Error(`Unknown move: ${id}`);
  return move;
}

/** `${type}-${archetype}` helper so the roster reads clearly. */
export function typeMove(typeId, archetype) {
  return `${typeId}-${archetype}`;
}
