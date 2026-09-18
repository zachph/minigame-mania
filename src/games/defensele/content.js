/**
 * Defensele's roster: ten defenders, seven things that come down the road at
 * you, and the fifteen waves they arrive in.
 *
 * Every number here is data. The simulation in `rules.js` reads it and does not
 * care what any of it is called, so renaming or re-costing a defender is a one
 * line edit.
 */

/* ----------------------------------------------------------- the defenders */

export const TOWERS = [
  {
    id: 'pylon',
    name: 'Pylon',
    cost: 50,
    damage: 12,
    range: 112,
    rate: 2.0,             // shots a second
    color: '#7fd4ff',
    dark: '#1a5b80',
    shape: 'pylon',
    blurb: 'Cheap and quick. Two shots a second, and it never stops.',
    role: 'The one you open with.',
  },
  {
    id: 'frostpin',
    name: 'Frostpin',
    cost: 65,
    damage: 4,
    range: 104,
    rate: 1.5,
    slow: { factor: 0.55, duration: 1.4 },
    color: '#9be8ff',
    dark: '#186a86',
    shape: 'spire',
    blurb: 'Barely scratches, but everything it touches walks at half speed.',
    role: 'Buys every other tower more time.',
  },
  {
    id: 'lancer',
    name: 'Lancer',
    cost: 125,
    damage: 72,
    range: 226,
    rate: 0.55,
    color: '#ffd166',
    dark: '#8a6410',
    shape: 'lance',
    blurb: 'One heavy shot from a long way off.',
    role: 'Answers armour and picks off the big ones.',
  },
  {
    id: 'mortar',
    name: 'Mortar',
    cost: 140,
    damage: 42,
    range: 196,
    rate: 0.5,
    splash: 58,
    shell: true,           // a shell that flies, rather than an instant shot
    color: '#ff9f6b',
    dark: '#8a3a12',
    shape: 'mortar',
    blurb: 'A slow shell that catches everything standing near the landing.',
    role: 'The answer to a Swarm.',
  },
  {
    id: 'coilnest',
    name: 'Coilnest',
    cost: 160,
    damage: 19,
    range: 124,
    rate: 1.1,
    chain: 3,
    color: '#c8a4ff',
    dark: '#4b2a86',
    shape: 'coil',
    blurb: 'Arcs from one target to the next, up to three.',
    role: 'Good where the road doubles back on itself.',
  },
  {
    id: 'bastion',
    name: 'Bastion',
    cost: 80,
    damage: 0,
    range: 0,
    rate: 0,
    onRoad: true,          // the only one that is built on the road itself
    hp: 640,
    color: '#c9d1e8',
    dark: '#3e4763',
    shape: 'wall',
    blurb: 'Stands in the road. Nothing walks past until it is rubble.',
    role: 'Holds a queue still for the Mortar.',
  },
  {
    id: 'claw-bind',
    name: 'Claw-bind',
    cost: 100,
    damage: 9,
    range: 98,
    rate: 0.8,
    snare: { duration: 1.5 },
    color: '#8ce6a8',
    dark: '#1d6b3c',
    shape: 'claw',
    blurb: 'Grabs one of them and pins it where it stands.',
    role: 'Stops a Runner dead, one at a time.',
  },
  {
    id: 'nightkon',
    name: 'Nightkon',
    cost: 200,
    damage: 6,
    range: 146,
    rate: 1.2,
    dread: { damage: 15, duration: 3, stacks: 3 },
    color: '#a98bff',
    dark: '#2f1d6b',
    shape: 'night',
    blurb: 'Marks them with dread that keeps burning, and stacks three deep.',
    role: 'Melts anything with a big health bar.',
  },
  {
    id: 'frostglide',
    name: 'Frostglide',
    cost: 230,
    damage: 23,
    range: 100,
    rate: 1.0,
    freeze: { duration: 1.5, damage: 12.5, interval: 0.5 },
    color: '#e6f7ff',
    dark: '#2b4f9e',
    shape: 'glide',
    blurb: 'Freezes one solid, and the cold keeps biting while it stands there.',
    role: 'Short reach, heavy price. Put it where the road turns.',
  },
  {
    id: 'money-tree',
    name: 'Money Tree',
    cost: 150,
    damage: 0,
    range: 0,
    rate: 0,
    income: { amount: 100, interval: 6.5 },  // pays out on its own clock
    color: '#9be08a',
    dark: '#2c6b2f',
    shape: 'tree',
    blurb: 'Fruits 100 gold every 6.5 seconds. It does not shoot at anything.',
    role: 'Pays for itself in ten seconds, then funds everything else.',
  },
];

export const TOWER_BY_ID = new Map(TOWERS.map((tower) => [tower.id, tower]));
export const getTower = (id) => {
  const tower = TOWER_BY_ID.get(id);
  if (!tower) throw new Error(`Unknown defender: ${id}`);
  return tower;
};

/* ------------------------------------------------------------- the enemies */

export const ENEMIES = {
  creeper: { id: 'creeper', name: 'Creeper', hp: 90, speed: 46, bounty: 8, leak: 1, size: 11, color: '#8fd07a', dark: '#2f6b28' },
  runner: { id: 'runner', name: 'Runner', hp: 55, speed: 94, bounty: 7, leak: 1, size: 9, color: '#ffe07a', dark: '#8a6a10' },
  brute: { id: 'brute', name: 'Brute', hp: 430, speed: 32, bounty: 22, leak: 2, size: 15, color: '#ff8b6b', dark: '#7f2f14' },
  shieldbearer: { id: 'shieldbearer', name: 'Shieldbearer', hp: 260, speed: 40, bounty: 20, leak: 2, size: 13, armour: 9, color: '#9fb4e8', dark: '#2d3f70' },
  swarm: { id: 'swarm', name: 'Swarm', hp: 34, speed: 62, bounty: 4, leak: 1, size: 7, color: '#ffb0e0', dark: '#7a2a5e' },
  cripplestone: { id: 'cripplestone', name: 'Cripplestone', hp: 1270, speed: 87, bounty: 75, leak: 8, size: 17, stun: { duration: 3.5, interval: 4, range: 132 }, color: '#c9c2a8', dark: '#4a4230' },
  colossus: { id: 'colossus', name: 'Colossus', hp: 2700, speed: 24, bounty: 140, leak: 10, size: 22, armour: 7, slowResist: 0.5, color: '#d0b0ff', dark: '#3a2070', boss: true },
};

export const ENEMY_LIST = Object.values(ENEMIES);

/* --------------------------------------------------------------- the waves */

/** `{ enemy, count, gap }` - gap is the seconds between one and the next. */
const wave = (...groups) => groups.map(([enemy, count, gap, delay = 0]) => ({ enemy, count, gap, delay }));

export const WAVES = [
  wave(['creeper', 6, 1.1]),
  wave(['creeper', 9, 0.9]),
  wave(['runner', 8, 0.7], ['creeper', 5, 1.0, 3]),
  wave(['swarm', 14, 0.35], ['creeper', 6, 1.0, 2]),
  wave(['brute', 3, 2.4], ['runner', 8, 0.6, 1]),
  wave(['shieldbearer', 4, 1.8], ['creeper', 10, 0.8, 1]),
  wave(['swarm', 22, 0.28], ['runner', 10, 0.5, 4]),
  wave(['brute', 6, 1.6], ['shieldbearer', 4, 1.6, 2]),
  wave(['runner', 18, 0.35], ['swarm', 18, 0.3, 3], ['cripplestone', 1, 1, 6]),
  wave(['colossus', 1, 1], ['creeper', 12, 0.7, 2]),
  wave(['shieldbearer', 8, 1.1], ['brute', 5, 1.6, 3], ['cripplestone', 2, 4, 5]),
  wave(['swarm', 30, 0.22], ['brute', 6, 1.4, 4]),
  wave(['runner', 28, 0.24], ['shieldbearer', 8, 1.2, 3], ['colossus', 1, 1, 10], ['cripplestone', 2, 3.5, 7]),
  wave(['brute', 12, 0.8], ['colossus', 2, 5, 6], ['swarm', 20, 0.3, 2], ['cripplestone', 3, 3, 4]),
  wave(['colossus', 3, 5], ['swarm', 34, 0.2, 2], ['runner', 20, 0.3, 6], ['brute', 8, 1.2, 12], ['cripplestone', 4, 3, 8]),
];

export const WAVE_COUNT = WAVES.length;

/** How the road runs, in grid cells, from the left edge to your base. */
export const PATH_CELLS = [
  [-1, 5], [4, 5], [4, 2], [9, 2], [9, 8], [14, 8], [14, 3], [19, 3], [19, 7], [23, 7],
];

export const GRID = { cols: 24, rows: 11, cell: 40, top: 34 };
export const START_GOLD = 100;
export const START_LIVES = 20;
export const WAVE_GAP = 16;     // seconds between one wave starting and the next
export const SELL_RETURN = 0.6; // what you get back for taking a tower down

/**
 * Paid out when a wave is released, so the money keeps moving. The first wave
 * pays nothing: the opening gold above is already the wave-one budget, and
 * handing over another 33 three seconds in would quietly make the opening 133.
 */
export const waveBonus = (waveNumber) => (waveNumber <= 1 ? 0 : 25 + waveNumber * 8);
