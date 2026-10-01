/**
 * Bumpers: the arena, the fighters, and the ladder of bots you climb.
 *
 * Everything here is data. `physics.js` and `rules.js` read it and have no
 * idea what any of it is called, so adding a character is a matter of adding
 * an entry below - as long as its ability is one of the kinds in `rules.js`.
 */

/* ------------------------------------------------------------- the arena */

/**
 * The floor you fight on, in the shell's 960x540 logical space. The band above
 * it holds the two health bars, and nothing is drawn below it, so the whole
 * fight stays on the canvas with no DOM in the way.
 */
export const FIELD = { x: 26, y: 78, w: 908, h: 436 };

export const WALL_BOUNCE = 0.9;   // speed kept when you come off a wall
export const DRAG = 0.55;         // how quickly a drifting ball sheds speed
export const DRIFT_SPEED = 115;   // nobody ever fully stops; this is the floor
export const BALL_BOUNCE = 0.94;  // speed kept when the two of you collide

/**
 * Damage. An approach of `HIT_REFERENCE` is the yardstick: one ball moving at
 * exactly that speed into a stationary, equally heavy one does `HIT_BASE`.
 *
 * The rule the whole game rests on is in `damageFor` in rules.js: only the
 * speed you were carrying *into* the hit counts. Drift into someone who is
 * charging and you take the lot and give nothing back.
 */
export const HIT_BASE = 13;
export const HIT_REFERENCE = 300;
/**
 * Damage does not rise in a straight line with the speed you brought: it
 * curves. Arriving twice as fast hurts rather more than twice as much, which
 * is what makes a proper run worth setting up instead of just leaning on them.
 */
export const HIT_CURVE = 1.6;
export const HIT_FLOOR = 55;      // below this approach, it is just a nudge
export const HIT_LOCK = 0.34;     // seconds before the same pair can trade again

/**
 * Taking a hit sends you flying, and without this that would be a gift: the
 * ball that just got hit is now the fast one, and it turns straight round and
 * cashes in speed it never earned. While you are reeling you still bounce, you
 * just cannot hurt anyone with it.
 */
export const STAGGER_TIME = 0.8;
export const STAGGER_OUTPUT = 0.3;

/* -------------------------------------------------------- the characters */

/**
 * `thrust` is acceleration in px/s^2, `top` the speed your own steering can
 * reach, `mass` decides who wins a shoulder-charge, and `power` scales the
 * damage you deal. A ball can be flung past `top` by a dash or a shove - that
 * cap is on your engine, not on the world.
 */
const fighter = (spec) => ({ hp: 100, radius: 20, mass: 1, thrust: 900, top: 380, power: 1, ...spec });

export const CHARACTERS = [
  fighter({
    id: 'pebble',
    name: 'Pebble',
    blurb: 'Nothing special, and good at everything because of it.',
    role: 'The one to learn on.',
    colour: '#7fd4ff',
    shade: '#1a5b80',
    ability: { kind: 'dash', name: 'Dart', cooldown: 2.6, speed: 720, blurb: 'A hard shove in the way you are already pointing.' },
  }),
  fighter({
    id: 'boulder',
    name: 'Boulder',
    blurb: 'Slow to get going, and nothing you do moves it once it has.',
    role: 'Hits like a truck, steers like one.',
    hp: 130,
    radius: 26,
    mass: 2.2,
    thrust: 520,
    top: 300,
    power: 1.15,
    colour: '#ff9f6b',
    shade: '#8a3a12',
    ability: { kind: 'anchor', name: 'Set', cooldown: 5, duration: 1.6, mass: 6, blurb: 'Plants itself. For a moment nothing can push it at all.' },
  }),
  fighter({
    id: 'zip',
    name: 'Zip',
    blurb: 'Quick enough to pick the moment, light enough to regret it.',
    role: 'Fast, sharp, and made of glass.',
    hp: 80,
    radius: 16,
    mass: 0.62,
    thrust: 1250,
    top: 470,
    power: 1.3,
    colour: '#ffe07a',
    shade: '#8a6a10',
    ability: { kind: 'shockwave', name: 'Clap', cooldown: 3.4, radius: 120, push: 620, blurb: 'Throws them away from you. Does nothing itself.' },
  }),
];

export const CHARACTER_BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));

export const getCharacter = (id) => {
  const found = CHARACTER_BY_ID.get(id);
  if (!found) throw new Error(`Unknown fighter: ${id}`);
  return found;
};

/* --------------------------------------------------------- the solo climb */

/**
 * Six rungs. `skill` is the only dial: it widens or tightens the bot's aim,
 * shortens how long it takes to notice you, and decides how willingly it
 * spends an ability. See `ai.js`.
 */
export const LADDER = [
  { character: 'pebble', skill: 0.2, title: 'Pebble, going easy' },
  { character: 'zip', skill: 0.35, title: 'Zip, warming up' },
  { character: 'boulder', skill: 0.45, title: 'Boulder, immovable' },
  { character: 'zip', skill: 0.62, title: 'Zip, serious now' },
  { character: 'boulder', skill: 0.78, title: 'Boulder, set and waiting' },
  { character: 'pebble', skill: 0.95, title: 'Pebble, who has done this before' },
];

export const ROUND_LIMIT = 75;    // seconds; whoever has more health left wins
