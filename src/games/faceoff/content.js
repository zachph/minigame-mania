/**
 * Faceoff: nine fighters, and the three ways to use them.
 *
 * You pick three and send them out one at a time. The one in front fights
 * theirs; when it falls the next of yours walks in. You do not steer any of it
 * - the picks and the order are the whole decision, and then you watch.
 *
 * Every fighter below is a placeholder, standing in until the real nine
 * arrive. A fighter is data and one ability kind from `ABILITIES` in
 * `battle.js`, so replacing one is an edit to this file alone.
 */

/* ------------------------------------------------------------ the clock */

/**
 * Nobody takes turns. Each fighter fills a bar at its own speed and acts when
 * it is full, so a fast fighter simply gets more goes - and you can watch it
 * happen rather than being told whose turn it is.
 */
export const CHARGE_FULL = 100;
/**
 * Everything below is quoted at this pace. Raising it and shortening every
 * duration by the same factor makes a fight play out sooner without changing
 * a single outcome; raising damage instead broke half the roster, because a
 * poison that needs eight seconds is worthless in a fight that lasts six.
 */
export const BASE_TEMPO = 27.5; // charge per second at speed 1

/* ---------------------------------------------------------- the fighters */

/**
 * Health and attack below are not hand-picked: they came out of a tuner that
 * fought every pairing thousands of times and nudged each fighter towards
 * winning half of them, which settled with nobody more than three points off.
 * Individual matchups are still lopsided on purpose - that is what makes
 * choosing three of nine a decision rather than a formality.
 */
const fighter = (spec) => ({ hp: 100, attack: 12.0, speed: 5, guard: 0.0, ...spec });

export const FIGHTERS = [
  fighter({
    id: 'bulwark',
    name: 'Bulwark',
    title: 'the one that will not fall',
    hp: 142,
    attack: 8.2,
    speed: 4,
    guard: 5.0,
    colour: '#9fb4e8',
    shade: '#2d3f70',
    ability: { kind: 'brace', name: 'Dig In', charge: 3, guard: 9.0, duration: 2.4 },
    blurb: 'Slow, heavy, and takes a quarter off everything that hits it.',
  }),
  fighter({
    id: 'edge',
    name: 'Edge',
    title: 'the one that ends it early',
    hp: 93,
    attack: 17.3,
    speed: 5,
    colour: '#ff8b6b',
    shade: '#7f2f14',
    ability: { kind: 'strike', name: 'Open Up', charge: 4, multiplier: 2.4 },
    blurb: 'Hits harder than anything here and folds the moment it is hit back.',
  }),
  fighter({
    id: 'flicker',
    name: 'Flicker',
    title: 'the one that goes twice',
    hp: 107,
    attack: 7.8,
    speed: 9,
    colour: '#ffe07a',
    shade: '#8a6a10',
    ability: { kind: 'flurry', name: 'Rattle', charge: 3, hits: 4 },
    blurb: 'Acts about twice for every one of theirs. Each hit is small; there are a lot of them.',
  }),
  fighter({
    id: 'mender',
    name: 'Mender',
    title: 'the one that will not let you lose',
    hp: 158,
    attack: 11.1,
    speed: 5,
    colour: '#8ef0a8',
    shade: '#1d6b3c',
    ability: { kind: 'mend', name: 'Patch', charge: 4, amount: 34.0, bench: true },
    blurb: 'Heals whoever is worst off - including the ones waiting their turn.',
  }),
  fighter({
    id: 'rot',
    name: 'Rot',
    title: 'the one that wins later',
    hp: 128,
    attack: 8.8,
    speed: 5,
    colour: '#b7e06a',
    shade: '#41631a',
    ability: { kind: 'poison', name: 'Wither', charge: 3, damage: 7.0, ticks: 8, interval: 0.44 },
    blurb: 'Does almost nothing now and keeps doing it until they are gone.',
  }),
  fighter({
    id: 'mirror',
    name: 'Mirror',
    title: 'the one you should not hit',
    hp: 140,
    attack: 10.3,
    speed: 5,
    colour: '#c8a4ff',
    shade: '#4b2a86',
    ability: { kind: 'riposte', name: 'Turn It Back', charge: 3, share: 0.8, duration: 3.6 },
    blurb: 'For a while, most of what you do to it happens to you as well.',
  }),
  fighter({
    id: 'leech',
    name: 'Leech',
    title: 'the one that heals off you',
    hp: 112,
    attack: 11.7,
    speed: 6,
    colour: '#ff9ad5',
    shade: '#7a2a5e',
    ability: { kind: 'drain', name: 'Take It', charge: 4, multiplier: 1.5, share: 0.8 },
    blurb: 'Hits hard and keeps most of it for itself.',
  }),
  fighter({
    id: 'halt',
    name: 'Halt',
    title: 'the one that takes their go away',
    hp: 127,
    attack: 11.5,
    speed: 6,
    colour: '#9be8ff',
    shade: '#186a86',
    ability: { kind: 'stall', name: 'Hold', charge: 3, drain: 75, multiplier: 1.15 },
    blurb: 'Empties their bar. Whatever they were about to do, they are not doing it yet.',
  }),
  fighter({
    id: 'encore',
    name: 'Encore',
    title: 'the one that comes back',
    hp: 101,
    attack: 10.8,
    speed: 6,
    colour: '#ffd166',
    shade: '#8a6410',
    ability: { kind: 'rally', name: 'Not Done', charge: 0, share: 0.6, once: true, passive: true },
    blurb: 'The first time it would go down, it gets back up on a bit over half.',
  }),
];

export const FIGHTER_BY_ID = new Map(FIGHTERS.map((f) => [f.id, f]));
export const getFighter = (id) => {
  const found = FIGHTER_BY_ID.get(id);
  if (!found) throw new Error(`Unknown fighter: ${id}`);
  return found;
};

/** How many you take into a fight. */
export const TEAM_SIZE = 3;

/* ------------------------------------------------------------- the modes */

export const MODES = [
  {
    id: 'sandbox',
    name: 'Sandbox',
    blurb: 'Pick both sides and see what happens. Nothing is saved, nothing is lost.',
  },
  {
    id: 'tower',
    name: 'Tower',
    blurb: 'Ten floors. Your three carry their wounds up, and only the floors heal you.',
  },
  {
    id: 'story',
    name: 'Story',
    blurb: 'Six set fights, each one picked to argue with whatever beat the last.',
  },
];

export const MODE_BY_ID = new Map(MODES.map((mode) => [mode.id, mode]));

/**
 * The tower. Each floor names the three it sends and how much stronger they
 * are than the roster says - the same nine all the way up, hitting harder.
 */
export const TOWER = [
  { floor: 1, team: ['flicker', 'mender', 'bulwark'], scale: 0.8, name: 'The easy ones' },
  { floor: 2, team: ['edge', 'flicker', 'leech'], scale: 0.9, name: 'Quick and sharp' },
  { floor: 3, team: ['bulwark', 'mirror', 'mender'], scale: 1.0, name: 'The wall' },
  { floor: 4, team: ['rot', 'halt', 'mender'], scale: 1.05, name: 'The long game' },
  { floor: 5, team: ['edge', 'edge', 'flicker'], scale: 1.1, name: 'Two of the worst one' },
  { floor: 6, team: ['mirror', 'leech', 'encore'], scale: 1.15, name: 'Everything comes back' },
  { floor: 7, team: ['halt', 'edge', 'bulwark'], scale: 1.2, name: 'Held down' },
  { floor: 8, team: ['rot', 'mirror', 'bulwark'], scale: 1.25, name: 'Nothing lands' },
  { floor: 9, team: ['encore', 'leech', 'halt'], scale: 1.3, name: 'The long way down' },
  { floor: 10, team: ['edge', 'mirror', 'encore'], scale: 1.4, name: 'The top' },
];

/** Health handed back between floors, as a share of what was lost. */
export const TOWER_RECOVERY = 0.4;

/**
 * The story. Each chapter answers the one before it: beat a wall with poison
 * and the next fight punishes patience, and so on.
 */
export const STORY = [
  {
    id: 'first',
    name: 'Someone has to go first',
    team: ['flicker', 'edge', 'mender'],
    scale: 0.85,
    before: 'Three of them, three of yours, and no reason yet to think it matters which.',
    after: 'It mattered. Now they have seen you fight.',
  },
  {
    id: 'wall',
    name: 'The wall',
    team: ['bulwark', 'bulwark', 'mender'],
    scale: 1,
    before: 'Nothing here is quick. Everything here is still standing.',
    after: 'Big health bars are a problem you solve once.',
  },
  {
    id: 'clock',
    name: 'Against the clock',
    team: ['rot', 'rot', 'halt'],
    scale: 1.05,
    before: 'They have decided not to beat you. They have decided to wait.',
    after: 'You beat the waiting. Someone noticed.',
  },
  {
    id: 'mirror',
    name: 'Your own answer',
    team: ['mirror', 'mirror', 'encore'],
    scale: 1.1,
    before: 'Whatever you did to get here, this is the fight that does it back.',
    after: 'Hitting harder was not the answer. You found that out.',
  },
  {
    id: 'swarm',
    name: 'Faster than you',
    team: ['flicker', 'flicker', 'leech'],
    scale: 1.2,
    before: 'Three goes to your one, and all of them small.',
    after: 'Small hits add up. So do yours.',
  },
  {
    id: 'last',
    name: 'The one that has been watching',
    team: ['edge', 'mirror', 'encore'],
    scale: 1.35,
    before: 'It picked these three after watching every fight you have had.',
    after: 'Nothing left to argue with.',
  },
];

/** Health handed back between chapters, as a share of what was lost. */
export const STORY_RECOVERY = 0.6;

/**
 * How much a hit wanders either side of its average.
 *
 * Without this every fight is settled before it starts: the same two fighters
 * play out the same way every single time, and a game you watch is pointless
 * if you already know the ending. Enough to make a fight worth watching, not
 * so much that picking well stops mattering.
 */
export const DAMAGE_SPREAD = 0.2;

/** Nobody starts with an empty bar, so who moves first is not fixed either. */
export const OPENING_CHARGE = 0.5;

/**
 * Past this point every hit starts landing harder, and keeps getting harder.
 *
 * Two fighters who both heal can otherwise stand there all day, and about one
 * fight in six was being settled by the bell rather than by anyone winning.
 * This makes a long fight get tense instead of getting boring, and means the
 * clock below is a backstop almost nothing reaches.
 */
export const PRESSURE_FROM = 22;   // seconds of grace before it starts
export const PRESSURE_RATE = 0.07; // extra share of damage per second after

/**
 * A fight that drags is a fight nobody is watching. At these numbers nine in
 * ten finish inside about forty seconds on their own, so the clock is a
 * backstop rather than a way of winning.
 */
export const FIGHT_LIMIT = 70;   // seconds before it is called on health left
