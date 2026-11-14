/**
 * Faceoff: nine fighters in a battle box, bumping each other until one is out.
 *
 * You pick three. They go in one at a time; the two in the box bounce around
 * on their own and every collision costs both of them health. Nobody steers.
 *
 * Abilities are still to come - every fighter has `ability: null` until they
 * are written, and the fight runs fine without them.
 */

/* --------------------------------------------------------------- the box */

/** The Undertale battle box, made bigger. Everything happens inside it. */
export const BOX = { x: 96, y: 92, w: 768, h: 300 };

export const BALL_RADIUS = 30;   // big enough for a face to read
export const CRUISE = 270;        // px/s every fighter keeps up
export const HOMING = 8;        // how hard they lean in - lower and they orbit instead of meeting
/**
 * Homing alone can leave two balls circling each other forever. If they go
 * this long without touching, both are pointed straight at the other.
 */
export const STALL_AFTER = 2;
export const HIT_LOCK = 0.45;     // seconds before the same pair can trade again

/**
 * What a bump is worth. Both fighters take damage from every collision; the
 * one that was moving into the other more takes less of it. Averaged over a
 * fight it is about BUMP_DAMAGE each per bump, so 250 health is roughly a
 * dozen bumps.
 */
export const BUMP_DAMAGE = 20;
export const BUMP_SPREAD = 0.25;  // how much one bump wanders either side

/* ---------------------------------------------------------- the fighters */

export const BASE_HP = 250;

const fighter = (spec) => ({ hp: BASE_HP, dodges: 0, ability: null, ...spec });

export const FIGHTERS = [
  fighter({ id: 'gojo', name: 'Gojo', colour: '#9fd8ff', shade: '#2a5d8a' }),
  fighter({ id: 'sukuna', name: 'Sukuna', colour: '#ff7a7a', shade: '#7a1e2a' }),
  // 1 health, but the first 24 attacks that reach him miss. The 25th does not.
  fighter({ id: 'sans', name: 'Sans', hp: 1, dodges: 24, colour: '#e8eef8', shade: '#5a6a8a' }),
  fighter({ id: 'ralsei', name: 'Ralsei', colour: '#7ee08a', shade: '#2a6a3a' }),
  fighter({ id: 'undyne', name: 'Undyne', colour: '#6ab4ff', shade: '#1f3f7a' }),
  fighter({ id: 'garou', name: 'Garou', colour: '#d8d8e0', shade: '#4a4a5a' }),
  fighter({ id: 'saitama', name: 'Saitama', colour: '#ffe07a', shade: '#a07a10' }),
  fighter({ id: 'goku', name: 'Goku', colour: '#ffb15a', shade: '#9a4a10' }),
  fighter({ id: 'beerus', name: 'Beerus', colour: '#c89aff', shade: '#4b2a86' }),
];

export const FIGHTER_BY_ID = new Map(FIGHTERS.map((f) => [f.id, f]));
export const getFighter = (id) => {
  const found = FIGHTER_BY_ID.get(id);
  if (!found) throw new Error(`Unknown fighter: ${id}`);
  return found;
};

export const TEAM_SIZE = 3;

/* ------------------------------------------------------------- the modes */

export const MODES = [
  { id: 'sandbox', name: 'Sandbox', blurb: 'One fight against three picked at random.' },
  { id: 'tower', name: 'Tower', blurb: 'Ten floors. Your three carry their wounds up.' },
  { id: 'story', name: 'Story', blurb: 'Six set fights, one after another.' },
];

export const MODE_BY_ID = new Map(MODES.map((mode) => [mode.id, mode]));

/** `scale` multiplies the damage the enemy deals, so floors get harder. */
export const TOWER = [
  { floor: 1, team: ['ralsei', 'undyne', 'garou'], scale: 0.8, name: 'Warming up' },
  { floor: 2, team: ['undyne', 'garou', 'ralsei'], scale: 0.9, name: 'Spears and fists' },
  { floor: 3, team: ['sans', 'ralsei', 'undyne'], scale: 1.0, name: 'A bad time' },
  { floor: 4, team: ['garou', 'sukuna', 'undyne'], scale: 1.05, name: 'Monsters' },
  { floor: 5, team: ['gojo', 'ralsei', 'sans'], scale: 1.1, name: 'Infinity' },
  { floor: 6, team: ['goku', 'garou', 'undyne'], scale: 1.15, name: 'Power up' },
  { floor: 7, team: ['sukuna', 'gojo', 'sans'], scale: 1.2, name: 'Domains' },
  { floor: 8, team: ['beerus', 'goku', 'garou'], scale: 1.25, name: 'Gods' },
  { floor: 9, team: ['saitama', 'sukuna', 'gojo'], scale: 1.3, name: 'One punch' },
  { floor: 10, team: ['beerus', 'saitama', 'goku'], scale: 1.4, name: 'The top' },
];
export const TOWER_RECOVERY = 0.4;

export const STORY = [
  { id: 'underground', name: 'The Underground', team: ['ralsei', 'undyne', 'sans'], scale: 0.9,
    before: 'Somebody fell into the box. It is going to be a bad time.' },
  { id: 'hero', name: 'The Hero Hunter', team: ['garou', 'garou', 'undyne'], scale: 1,
    before: 'He hunts heroes. You brought three.' },
  { id: 'jujutsu', name: 'Jujutsu High', team: ['gojo', 'sukuna', 'ralsei'], scale: 1.1,
    before: 'The strongest, and the one who wants that title.' },
  { id: 'saiyan', name: 'Saiyan Pride', team: ['goku', 'goku', 'garou'], scale: 1.15,
    before: 'He just wants a good fight.' },
  { id: 'destroyer', name: 'God of Destruction', team: ['beerus', 'sukuna', 'gojo'], scale: 1.25,
    before: 'He woke up hungry.' },
  { id: 'caped', name: 'Just a Hobby', team: ['saitama', 'beerus', 'sans'], scale: 1.35,
    before: 'He is only doing this for fun.' },
];
export const STORY_RECOVERY = 0.6;

/** Escalation, so nothing goes on forever. */
export const PRESSURE_FROM = 25;
export const PRESSURE_RATE = 0.06;
export const FIGHT_LIMIT = 90;
