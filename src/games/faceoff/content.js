/**
 * Faceoff: nine fighters in a battle box, bumping each other until one is out.
 *
 * You pick three. They go in one at a time; the two in the box bounce around
 * on their own and every collision costs both of them health. Nobody steers.
 *
 * A fighter without an ability has `ability: null`, and the fight runs fine
 * with nobody having one.
 */

/* --------------------------------------------------------------- the box */

/** The Undertale battle box, made bigger. Everything happens inside it. */
export const BOX = { x: 96, y: 92, w: 768, h: 300 };

export const BALL_RADIUS = 30;   // big enough for a face to read
export const CRUISE = 160;        // px/s every fighter keeps up - slow enough to follow
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

/** How fast Sans throws someone at a wall. */
export const LAUNCH_SPEED = 600;
/** Goku never teleports closer than this to the enemy. */
export const TELEPORT_CLEAR = 170;

/* ---------------------------------------------------------- the fighters */

export const BASE_HP = 250;

/**
 * A fighter can have any number of abilities. `ability` is kept as the first
 * of them for anything that only wants one to show.
 */
const fighter = ({ ability, abilities, ...spec }) => {
  const list = abilities || (ability ? [ability] : []);
  return { hp: BASE_HP, dodges: 0, ...spec, abilities: list, ability: list[0] || null };
};

/**
 * Where Gaster Blasters sit and fire to, by name. Each is a spot in the box
 * as a share of its width and height; the engine pulls them in off the walls.
 */
export const BLASTER_SPOTS = {
  'top-left': [0, 0],
  'top-right': [1, 0],
  'bottom-left': [0, 1],
  'bottom-right': [1, 1],
  left: [0, 0.5],
  right: [1, 0.5],
  middle: [0.5, 0.5],
};

/**
 * How often Sans's attacks hurt while you touch them: like the real fight,
 * 1 damage every frame at 30 frames a second - 30 a second.
 */
export const SANS_TICK = 1 / 30;

/** How thick the beams are: a normal one is about a fighter wide, a big one most of the box. */
export const BLAST_WIDTH = 64;
export const BIG_BLAST_WIDTH = 210;

/** A blaster in every corner, all firing at the middle. */
const CORNERS_AT_MIDDLE = ['top-left', 'top-right', 'bottom-right', 'bottom-left']
  .map((from) => ({ from, to: 'middle', damage: 1, width: BLAST_WIDTH }));

/** A blaster in every corner firing along its wall, round the box like a pinwheel. */
const ALONG_THE_WALLS = [
  { from: 'top-left', to: 'bottom-left', damage: 1, width: BLAST_WIDTH },     // down the left wall
  { from: 'top-right', to: 'top-left', damage: 1, width: BLAST_WIDTH },       // along the top
  { from: 'bottom-right', to: 'top-right', damage: 1, width: BLAST_WIDTH },   // up the right wall
  { from: 'bottom-left', to: 'bottom-right', damage: 1, width: BLAST_WIDTH }, // along the bottom
];

export const FIGHTERS = [
  // Infinity: anything that comes within `range` of him moves at half speed.
  // A bump hits as hard as you were moving into it, so a slowed attacker also
  // hits him for less.
  // Reversal Red: every 12 seconds, a long red shot at wherever the enemy is.
  // It flies straight, so an enemy that moves can be missed.
  fighter({
    id: 'gojo', name: 'Gojo', colour: '#9fd8ff', shade: '#2a5d8a',
    abilities: [
      { kind: 'infinity', name: 'Infinity', range: 170, slow: 0.5 },
      { kind: 'shot', name: 'Reversal Red', every: 12, damage: 25, speed: 620, length: 90, colour: '#ff2a2a' },
      // When Sukuna lands the hit that would knock him out, he takes off his
      // blindfold instead, once. 75%: Domain Expansion - everything freezes and
      // the player is asked how many possible games of chess there are. Right,
      // and Sukuna is beaten on the spot; wrong, and Gojo heals to full. The
      // other 25%: "Nice match", and he stays in on 1.
      { kind: 'domain', name: 'Domain Expansion: Infinite Void', against: 'sukuna', chance: 0.75 },
    ],
  }),
  // Heals a quarter of his health every 15 seconds he spends in the box.
  // Dismantle: every 5 seconds an instant cut on the enemy wherever they are
  // in the box, for 5. Nothing to aim, nothing to dodge but Sans's dodges.
  fighter({
    id: 'sukuna', name: 'Sukuna', colour: '#ff7a7a', shade: '#7a1e2a',
    abilities: [
      { kind: 'regen', name: 'Reverse Cursed Technique', share: 0.25, every: 15 },
      { kind: 'slash', name: 'Dismantle', every: 5, damage: 5 },
    ],
  }),
  // 1 health, but the first 24 attacks that reach him miss. The 25th does not.
  // Every 10 seconds he throws the enemy at a wall, and the wall does 5.
  // Gaster Blaster: a run of blasts, each set lasting 3 seconds: one in every
  // corner firing at the middle, then one in every corner firing along its
  // wall, then the corners at the middle again, then two big ones from the
  // left and right firing at the middle. The beams stay where they are, so
  // only whoever is in one gets hit. Sans can still dodge them, as he dodges
  // anything. When the run is over it waits 8 seconds before the next.
  fighter({
    id: 'sans', name: 'Sans', hp: 1, dodges: 24, colour: '#e8eef8', shade: '#5a6a8a',
    abilities: [
      { kind: 'launch', name: 'Blue Magic', every: 10, damage: 5 },
      {
        kind: 'blaster',
        name: 'Gaster Blaster',
        every: 8,          // seconds between one run ending and the next starting
        tick: SANS_TICK,   // 1 a frame, like the real fight
        steps: [
          { lasts: 3, blasts: CORNERS_AT_MIDDLE },
          { lasts: 3, blasts: ALONG_THE_WALLS },
          { lasts: 3, blasts: CORNERS_AT_MIDDLE },
          { lasts: 3, blasts: [
            { from: 'left', to: 'middle', damage: 1, big: true, width: BIG_BLAST_WIDTH },
            { from: 'right', to: 'middle', damage: 1, big: true, width: BIG_BLAST_WIDTH },
          ] },
        ],
      },
      // Bone Wave: every 20 seconds a row of bones slides across the box for 5,
      // with a gap weaving up and down. Touching a bone does 1 a frame.
      { kind: 'bones', name: 'Bone Wave', every: 20, lasts: 5, damage: 1, tick: SANS_TICK },
      // Last Attack: once, when he is down to his last dodge. He slams the
      // enemy into the walls again and again, bones jutting out where they
      // land, then rings them with Gaster Blasters. Nothing touches him while
      // he does it.
      {
        kind: 'finale', name: 'Last Attack', at: 1,
        slams: 12, slamGap: 0.45, slamDamage: 1, slamSpeed: 900,
        ring: 8, ringGap: 0.3, ringLasts: 1, ringRadius: 210, damage: 1, tick: SANS_TICK,
      },
    ],
  }),
  // A quarter of his hits set the enemy burning: 1 a second for 15 seconds.
  // Fireball: every 10 seconds a ball of fire thrown at the enemy, for 20,
  // and every one that lands sets them burning too.
  fighter({
    id: 'ralsei', name: 'Ralsei', colour: '#7ee08a', shade: '#2a6a3a',
    abilities: [
      { kind: 'burn', name: 'Burn', chance: 0.25, damage: 1, every: 1, lasts: 15 },
      { kind: 'shot', name: 'Fireball', every: 10, damage: 20, speed: 420, size: 13, style: 'ball', colour: '#ff8a1a', burns: true },
    ],
  }),
  // The first time she goes down, a 1 in 5 chance she gets back up as Undyne
  // the Undying, with 355 health instead of 250.
  fighter({
    id: 'undyne', name: 'Undyne', colour: '#6ab4ff', shade: '#1f3f7a',
    // Spears: every 10 seconds, 8 spears thrown one after another, 5 each.
    abilities: [
      { kind: 'undying', name: 'Undyne the Undying', chance: 0.2, hp: 355 },
      {
        kind: 'volley', name: 'Spears', every: 10, count: 8, gap: 0.3,
        shot: { damage: 5, speed: 560, length: 46, size: 6, style: 'spear', colour: '#6ab4ff' },
      },
    ],
  }),
  // 40% of his hits land twice.
  // Water Stream Rock Smashing Fist: every 15 seconds he dashes at the enemy.
  // A dash that lands does 10 and knocks them back, and he goes straight
  // after them again - up to 5 times. One that misses ends it.
  fighter({
    id: 'garou', name: 'Garou', colour: '#d8d8e0', shade: '#4a4a5a',
    abilities: [
      { kind: 'double', name: 'Double Hit', chance: 0.4 },
      {
        kind: 'dash', name: 'Water Stream Rock Smashing Fist',
        every: 15, damage: 10, speed: 720, reach: 0.8, knockback: 430, maxHits: 5,
      },
    ],
  }),
  // One hit in twenty ends it.
  // Table Flip: every 15 seconds he stands still for 2 with a big triangle
  // over his head - open to anything that comes at him - then flips it at the
  // enemy for 50.
  fighter({
    id: 'saitama', name: 'Saitama', colour: '#ffe07a', shade: '#a07a10',
    abilities: [
      { kind: 'instakill', name: 'Serious Punch', chance: 0.05 },
      {
        kind: 'windup', name: 'Table Flip', every: 15, hold: 2,
        shot: { damage: 50, speed: 480, size: 26, style: 'table', colour: '#d9a35a' },
      },
    ],
  }),
  // Every 20 seconds he vanishes and reappears somewhere else in the box.
  // Kamehameha: every 11 seconds a beam from his hands, locked on to the
  // enemy, 3 every 0.8 seconds for 8 seconds.
  fighter({
    id: 'goku', name: 'Goku', colour: '#ffb15a', shade: '#9a4a10',
    helper: 'vegeta',   // when Goku is knocked out, Vegeta comes to help whoever is next
    abilities: [
      { kind: 'teleport', name: 'Instant Transmission', every: 20 },
      { kind: 'beam', name: 'Kamehameha', every: 11, lasts: 8, damage: 3, tick: 0.8, colour: '#6ac8ff' },
      // Transformations, as he gets hurt - and he never goes back down. Each
      // one hits harder and heals more, every 1.5 seconds. The hit that would
      // knock him out leaves him on 1 instead, and he goes Ultra Instinct.
      {
        kind: 'forms', name: 'Transformations', every: 1.5,
        forms: [
          { id: 'ssj', name: 'Super Saiyan', below: 0.75, power: 1.25, regen: 3, colour: '#ffd84a' },
          { id: 'god', name: 'Super Saiyan God', below: 0.5, power: 1.5, regen: 5, colour: '#ff4a5a' },
          { id: 'blue', name: 'Super Saiyan Blue', below: 0.25, power: 1.75, regen: 7, colour: '#3ac8ff' },
        ],
        last: { id: 'ui', name: 'Ultra Instinct', power: 2, regen: 10, dodges: 5, colour: '#dfe6f4' },
      },
    ],
  }),
  // Every 15 seconds Whis joins in for 5: a second ball on Beerus's side that
  // bumps the enemy and cannot be hurt.
  fighter({
    id: 'beerus', name: 'Beerus', colour: '#c89aff', shade: '#4b2a86',
    // Hakai: every 18 seconds a square comes down on the enemy and stays where
    // it fell. Anything in it takes 5 every half second. It shrinks as it
    // goes - big for 5 seconds, medium for 3, small for 1.5 - then it is gone.
    abilities: [
      { kind: 'summon', name: 'Summon Whis', every: 15, lasts: 5 },
      {
        kind: 'zone', name: 'Hakai', every: 18, damage: 5, tick: 0.5, colour: '#b46aff',
        stages: [{ size: 240, lasts: 5 }, { size: 150, lasts: 3 }, { size: 80, lasts: 1.5 }],
      },
    ],
  }),
];

/**
 * Fighters who only ever come in to help, never picked. Vegeta arrives when
 * Goku is knocked out: Goku's moves without the transformations, 125 health,
 * and half Goku's damage. The fighter he comes in with is halved to 125 too.
 */
export const HELPERS = [
  fighter({
    id: 'vegeta', name: 'Vegeta', hp: 125, power: 0.5, colour: '#5a7aff', shade: '#1a2a7a',
    abilities: [
      { kind: 'teleport', name: 'Instant Transmission', every: 20 },
      { kind: 'beam', name: 'Kamehameha', every: 11, lasts: 8, damage: 3, tick: 0.8, colour: '#6ac8ff' },
    ],
  }),
];

/**
 * The ones you unlock in Story. Their abilities are still to come; until then
 * they bump like anyone else.
 */
export const UNLOCKABLES = [
  // Incineration Cannon: every 10 seconds a big orange beam, locked on, 5 a
  // second for 4 seconds. Missile Barrage: every 7 seconds a missile out in
  // each of the eight directions, 4 each.
  fighter({
    id: 'genos', name: 'Genos', colour: '#ffd24a', shade: '#8a6a10',
    abilities: [
      { kind: 'beam', name: 'Incineration Cannon', every: 10, lasts: 4, damage: 5, tick: 1, colour: '#ff7a1a', width: 1.7 },
      { kind: 'barrage', name: 'Missile Barrage', every: 7, count: 8, damage: 4, speed: 460, length: 0, colour: '#d0d4dc', style: 'missile', size: 6 },
    ],
  }),
  fighter({ id: 'yuji', name: 'Yuji', colour: '#ff9aa8', shade: '#8a3040' }),
  fighter({ id: 'frieza', name: 'Frieza', colour: '#c88aff', shade: '#4a1a7a' }),
  fighter({ id: 'susie', name: 'Susie', colour: '#b46ad6', shade: '#4a1a6a' }),
  // At half health the Knight changes shape, and stays changed.
  // The first hit that would knock it out leaves it on 1 instead, and it does
  // its final attack: stars come in from all round the box to it, hang
  // there, then fly back out. Each one that touches the enemy does 5, going in
  // and again coming out. Nothing touches the Knight while it does it.
  fighter({
    id: 'roaringknight', name: 'The Roaring Knight', colour: '#e8ecff', shade: '#101018', halfHead: 'roaringknight-half',
    abilities: [
      // Sword Dance: every 15 seconds, swords appear one after another round
      // the outside of the box, each pointing in through wherever the enemy
      // is. A moment later each one slashes straight across, leaving a white
      // line - and anything it touches loses a quarter of its health.
      { kind: 'swords', name: 'Sword Dance', every: 15, count: 5, gap: 0.35, warn: 0.9, strike: 0.22, share: 0.25 },
      // Red Slices: every 12 seconds, red lines slice across the box - one,
      // then two at once, then four at once. Each shows as a thin line first,
      // then slices, 10 to the enemy if it is touching it.
      { kind: 'slices', name: 'Red Slices', every: 12, waves: [1, 2, 4], gap: 1.0, warn: 0.6, strike: 0.25, damage: 10, spread: 70 },
      { kind: 'converge', name: 'Final Attack', blades: 14, damage: 5, gather: 1.6, hold: 0.5, scatter: 1.2 },
    ],
  }),
  fighter({ id: 'toriel', name: 'Toriel', colour: '#a060d0', shade: '#4a2a7a' }),
  fighter({ id: 'lastbreath', name: 'Last Breath Sans', colour: '#7ad8ff', shade: '#1a4a7a' }),
  fighter({ id: 'frisk', name: 'Frisk', colour: '#5ab0ff', shade: '#7a3aa0' }),
  fighter({ id: 'gojo1b', name: 'Gojo 1B%', colour: '#b48aff', shade: '#3a1a8a' }),
  fighter({ id: 'fullpower', name: 'Saitama Full Power', colour: '#ffe04a', shade: '#a02020' }),
];

export const FIGHTER_BY_ID = new Map([...FIGHTERS, ...HELPERS, ...UNLOCKABLES].map((f) => [f.id, f]));
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

/**
 * Story: six set fights. Knocking out one of the new characters unlocks
 * them - you do not have to win the fight - so they can be picked from then on.
 */
export const STORY = [
  { id: 'onepunch', name: 'One Punch', team: ['genos', 'garou', 'saitama'], scale: 1.0, unlocks: ['genos'],
    before: 'A cyborg, a monster, and a hero for fun.' },
  { id: 'jujutsu', name: 'Jujutsu High', team: ['yuji', 'sukuna', 'gojo'], scale: 1.05, unlocks: ['yuji'],
    before: 'The vessel, the King of Curses, and the strongest.' },
  { id: 'dbz', name: 'Dragon Ball Z', team: ['frieza', 'goku', 'beerus'], scale: 1.1, unlocks: ['frieza'],
    before: 'An emperor, a Saiyan and a god.' },
  { id: 'deltarune', name: 'Deltarune', team: ['ralsei', 'susie', 'roaringknight'], scale: 1.2, unlocks: ['susie', 'roaringknight'],
    before: 'A prince, a bully, and something knighted in the dark.' },
  { id: 'underground', name: 'The Underground', team: ['toriel', 'undyne', 'sans'], scale: 1.25, unlocks: ['toriel'],
    before: 'Somebody fell into the box. It is going to be a bad time.' },
  { id: 'laststretch', name: 'Last Stretch', team: ['lastbreath', 'frisk', 'gojo1b', 'fullpower'], scale: 1.35,
    unlocks: ['lastbreath', 'frisk', 'gojo1b', 'fullpower'],
    before: 'Four of them, and every one at their strongest.' },
];
/** Which chapter of Story unlocks a character. */
export const UNLOCKED_BY = new Map(STORY.flatMap((chapter) => chapter.unlocks.map((id) => [id, chapter])));

export const STORY_RECOVERY = 0.6;

/** Escalation, so nothing goes on forever. */
export const PRESSURE_FROM = 25;
export const PRESSURE_RATE = 0.06;
export const FIGHT_LIMIT = 90;

/** The question Gojo's Domain Expansion asks. */
export const CHESS_QUESTION = 'How many possible games of chess are there?';
export const CHESS_ANSWER = 'About 10^120 - the Shannon number';

/**
 * Whether a typed answer is the Shannon number, about 10^120, however it is
 * written: 10^120, 10**120, 10 to the 120, 10 to the power of 120, 1e120, a 1
 * with 120 zeros, or just "the Shannon number".
 */
export function isChessAnswer(text) {
  const t = String(text || '').toLowerCase().replace(/[\s,_]/g, '');
  if (t.includes('shannon')) return true;
  if (/^(about|around|roughly|~)?10(\^|\*\*|x|to(the)?(powerof)?|e)\+?120(th)?$/.test(t)) return true;
  if (/^(about|around|roughly|~)?1e\+?120$/.test(t)) return true;
  return /^10{120}$/.test(t);
}
