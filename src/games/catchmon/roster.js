import { TYPE_BY_ID } from './types.js';
import { getMove } from './moves.js';

/**
 * Thirty fighters, five per type. Every one of them is a final evolution -
 * there are no baby forms in Catchmon, only the fully grown article. Each
 * entry names the form it evolved from purely as flavour.
 *
 * Stats come from a role template plus a per-fighter tweak that always nets to
 * zero, so every fighter spends the same 340 points - members of a role feel
 * related without being clones, and no fighter is strictly better than another.
 */
export const ROLES = {
  vanguard: {
    name: 'Vanguard',
    blurb: 'Heavy hitter with the bulk to trade blows.',
    base: { hp: 128, atk: 84, def: 68, spd: 60 },
    moves: ['standard', 'heavy', 'focus', 'ram'],
  },
  striker: {
    name: 'Striker',
    blurb: 'Glass cannon: hits hardest, folds fastest.',
    base: { hp: 100, atk: 98, def: 50, spd: 92 },
    moves: ['quick', 'heavy', 'status', 'snare'],
  },
  bulwark: {
    name: 'Bulwark',
    blurb: 'Slow wall that outlasts whatever it is fighting.',
    base: { hp: 144, atk: 58, def: 92, spd: 46 },
    moves: ['standard', 'status', 'mend', 'bulwark'],
  },
  runner: {
    name: 'Runner',
    blurb: 'Moves first, chips away, refuses to sit still.',
    base: { hp: 102, atk: 76, def: 56, spd: 106 },
    moves: ['quick', 'volley', 'snare', 'second-wind'],
  },
  keystone: {
    name: 'Keystone',
    blurb: 'No weak stat and an answer for most turns.',
    base: { hp: 118, atk: 74, def: 72, spd: 76 },
    moves: ['standard', 'drain', 'guard-break', 'shield'],
  },
};

const TYPED_ARCHETYPES = new Set(['quick', 'standard', 'heavy', 'status', 'drain', 'volley']);

const ENTRIES = [
  // --- Ember -------------------------------------------------------------
  ['pyrothane', 'Pyrothane', 'ember', 'vanguard', 'quad', 'Pyrocub', 'Molten plates grind as it walks; nothing about it is subtle.', { atk: 4, spd: -4 }],
  ['cindralisk', 'Cindralisk', 'ember', 'striker', 'serpent', 'Cinderling', 'Sheds a trail of live cinders and strikes through the smoke.', { atk: 6, hp: -6 }],
  ['magmoth', 'Magmoth', 'ember', 'bulwark', 'quad', 'Magmite', 'A slow furnace on legs. Sieges lose to it by attrition.', { hp: 8, spd: -8 }],
  ['ashenmane', 'Ashenmane', 'ember', 'runner', 'biped', 'Ashkit', 'Its mane scatters ash to cover the ground it just crossed.', { spd: 6, def: -6 }],
  ['kilnhorn', 'Kilnhorn', 'ember', 'keystone', 'quad', 'Forgecalf', 'Horns hot enough to work iron, temperament to match.', { atk: 3, def: 3, hp: -6 }],

  // --- Verdant -----------------------------------------------------------
  ['thornmaw', 'Thornmaw', 'verdant', 'vanguard', 'quad', 'Thornpup', 'Bites down with a jaw of hardwood spines and does not let go.', { atk: 5, def: 2, spd: -7 }],
  ['bloomquill', 'Bloomquill', 'verdant', 'striker', 'winged', 'Bloomlet', 'Fires seed-quills in volleys that bloom where they land.', { spd: 5, hp: -5 }],
  ['mosslok', 'Mosslok', 'verdant', 'bulwark', 'orb', 'Mossling', 'A boulder of packed moss that simply regrows the parts you break.', { hp: 10, atk: -10 }],
  ['saplynx', 'Saplynx', 'verdant', 'runner', 'biped', 'Sapkit', 'Runs the treeline so fast the branches barely move.', { spd: 5, atk: 2, def: -7 }],
  ['verdrake', 'Verdrake', 'verdant', 'keystone', 'winged', 'Verdling', 'A canopy drake that farms the forest it patrols.', { atk: 4, hp: 4, spd: -8 }],

  // --- Terra -------------------------------------------------------------
  ['craghide', 'Craghide', 'terra', 'vanguard', 'quad', 'Cragpup', 'Hide like shale. Charges downhill and lets gravity help.', { def: 5, spd: -5 }],
  ['quarrion', 'Quarrion', 'terra', 'striker', 'winged', 'Quarrlet', 'Drops quarry stone from altitude with unpleasant accuracy.', { atk: 5, def: -5 }],
  ['boulderox', 'Boulderox', 'terra', 'bulwark', 'quad', 'Bouldercalf', 'Plants four feet and becomes, for all practical purposes, terrain.', { hp: 6, def: 4, atk: -10 }],
  ['duneclaw', 'Duneclaw', 'terra', 'runner', 'biped', 'Dunekit', 'Swims through loose sand and surfaces claws-first.', { spd: 4, atk: 3, hp: -7 }],
  ['geodon', 'Geodon', 'terra', 'keystone', 'orb', 'Geodite', 'A hollow geode that rings before it strikes. The ring is a warning.', { def: 5, hp: 3, atk: -8 }],

  // --- Storm -------------------------------------------------------------
  ['arcstag', 'Arcstag', 'storm', 'vanguard', 'quad', 'Arcfawn', 'Antlers arc between tines; the air tastes of metal near it.', { atk: 4, spd: 3, def: -7 }],
  ['voltaris', 'Voltaris', 'storm', 'striker', 'serpent', 'Voltling', 'Coils into a live circuit and discharges the whole thing at once.', { atk: 7, def: -7 }],
  ['coilyx', 'Coilyx', 'storm', 'bulwark', 'orb', 'Coilite', 'A wound sphere of copper filament that shrugs off what it grounds.', { hp: 6, def: 4, spd: -10 }],
  ['galevane', 'Galevane', 'storm', 'runner', 'winged', 'Galewisp', 'Rides its own headwind. Catching it is mostly luck.', { spd: 8, hp: -8 }],
  ['thundrake', 'Thundrake', 'storm', 'keystone', 'winged', 'Thundling', 'Storm-drake that circles a battle before it commits to one.', { atk: 3, spd: 4, hp: -7 }],

  // --- Tide --------------------------------------------------------------
  ['tidalon', 'Tidalon', 'tide', 'vanguard', 'serpent', 'Tidalet', 'Breaks over a foe in one long, deliberate wave.', { hp: 6, atk: 3, spd: -9 }],
  ['maelstrix', 'Maelstrix', 'tide', 'striker', 'winged', 'Swirlet', 'Spins up a waterspout and rides it into contact.', { atk: 5, spd: 4, hp: -9 }],
  ['frostfin', 'Frostfin', 'tide', 'bulwark', 'quad', 'Frostling', 'Freezes the water around it into armour, then thickens it.', { def: 6, hp: 4, atk: -10 }],
  ['coralynx', 'Coralynx', 'tide', 'runner', 'biped', 'Coralkit', 'Reef-cat built for the sprint between one rock and the next.', { spd: 5, def: 2, atk: -7 }],
  ['abyssarch', 'Abyssarch', 'tide', 'keystone', 'serpent', 'Abysslet', 'Comes up from the dark with the pressure still on it.', { atk: 4, def: 3, spd: -7 }],

  // --- Shade -------------------------------------------------------------
  ['nyxmaw', 'Nyxmaw', 'shade', 'vanguard', 'quad', 'Nyxpup', 'Hunts by swallowing the light between itself and its target.', { atk: 5, hp: 3, spd: -8 }],
  ['hexaraven', 'Hexaraven', 'shade', 'striker', 'winged', 'Hexlet', 'Marks a foe on the first pass and collects on the second.', { atk: 6, spd: 3, def: -9 }],
  ['umbrathis', 'Umbrathis', 'shade', 'bulwark', 'orb', 'Umbrite', 'A sphere of settled night. Attacks reach it late, if at all.', { hp: 7, def: 3, atk: -10 }],
  ['duskgeist', 'Duskgeist', 'shade', 'runner', 'biped', 'Duskwisp', 'Half here at the best of times, and never for long.', { spd: 7, hp: -7 }],
  ['eclipsar', 'Eclipsar', 'shade', 'keystone', 'winged', 'Eclipling', 'Its wings hold an eclipse open for exactly as long as it needs.', { atk: 3, def: 4, hp: -7 }],
];

function buildCharacter([id, name, typeId, roleId, shape, evolvesFrom, blurb, tweak]) {
  const role = ROLES[roleId];
  const stats = {
    hp: role.base.hp + (tweak.hp || 0),
    atk: role.base.atk + (tweak.atk || 0),
    def: role.base.def + (tweak.def || 0),
    spd: role.base.spd + (tweak.spd || 0),
  };
  const moves = role.moves.map((entry) => (TYPED_ARCHETYPES.has(entry) ? `${typeId}-${entry}` : entry));
  moves.forEach(getMove); // fail loudly on a typo in the tables above
  return {
    id,
    name,
    type: typeId,
    typeName: TYPE_BY_ID.get(typeId).name,
    color: TYPE_BY_ID.get(typeId).color,
    accent: TYPE_BY_ID.get(typeId).accent,
    role: roleId,
    roleName: role.name,
    shape,
    stage: 'final',
    evolvesFrom,
    blurb,
    stats,
    moves,
    power: stats.hp + stats.atk + stats.def + stats.spd,
  };
}

export const ROSTER = ENTRIES.map(buildCharacter);
export const CHARACTER_BY_ID = new Map(ROSTER.map((character) => [character.id, character]));

export function getCharacter(id) {
  const character = CHARACTER_BY_ID.get(id);
  if (!character) throw new Error(`Unknown character: ${id}`);
  return character;
}

export function charactersOfType(typeId) {
  return ROSTER.filter((character) => character.type === typeId);
}

export const TEAM_SIZE = 3;
