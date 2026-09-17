/**
 * Shubat card data. Two starter decks, twenty cards each:
 *   5 fighters, 10 support cards, 2 instant damage cards, 3 traps.
 *
 * Fighter HP and damage are exactly as specified. Everything else is derived,
 * so changing a fighter's numbers changes what it costs to field it:
 *
 *   cost = round(((hp + damage) / 200) ** COST_CURVE), at least 1
 *
 * The curve is what balances the two decks against each other. String Brain's
 * fighters carry more than twice Iron Warrior's total HP, so on a flat curve
 * they simply win; bending it makes the enormous ones cost enormously, and the
 * decks become archetypes instead - Iron floods the lanes early, String has to
 * survive to the turn its monsters land. Raise it to squeeze String further,
 * lower it to let the big cards out sooner.
 */
export const COST_CURVE = 1.3;

export const FACTIONS = {
  iron: {
    id: 'iron',
    name: 'Iron Warrior',
    tagline: 'Cheap, fast, relentless. Flood the lanes before the Brain wakes up.',
    passive: { id: 'breakthrough', name: 'Breakthrough', blurb: 'Damage past a kill carries straight into the core.' },
    color: '#e8913f',
    light: '#ffc27a',
    dark: '#7a3f08',
    core: '#f2b46a',
  },
  string: {
    id: 'string',
    name: 'String Brain',
    tagline: 'Slow, enormous, and it has read your hand. Survive to the late game.',
    passive: { id: 'foresight', name: 'Foresight', blurb: 'Your first draw each turn looks one card deeper.' },
    color: '#8b7ce8',
    light: '#c0b6ff',
    dark: '#3b2c7a',
    core: '#b5a6ff',
  },
};

export const FACTION_IDS = Object.keys(FACTIONS);
export const otherFaction = (id) => (id === 'iron' ? 'string' : 'iron');

export const fighterCost = (hp, damage) => Math.max(1, Math.round(((hp + damage) / 200) ** COST_CURVE));

function fighter(faction, id, name, hp, damage, blurb, art) {
  return {
    id: `${faction}-${id}`,
    kind: 'fighter',
    faction,
    name,
    hp,
    damage,
    cost: fighterCost(hp, damage),
    blurb,
    art,
  };
}

/* ------------------------------------------------------------------ fighters */

export const FIGHTERS = [
  // Iron Warrior - the numbers are the spec; the costs fall out of them.
  fighter('iron', 'scrapper', 'Scrapper', 120, 180, 'Cheap, brittle, and hits far above its weight.', 'brawler'),
  fighter('iron', 'magnet-bot', 'Magnet Bot', 290, 70, 'Soaks a lane so something meaner can work.', 'orb'),
  fighter('iron', 'overdrive', 'Overdrive', 160, 210, 'The hardest early punch in either deck.', 'spike'),
  fighter('iron', 'iron-forge', 'Iron-Forge', 135, 177, 'Steady output, and it never asks for much.', 'anvil'),
  fighter('iron', 'criptmetal', 'Criptmetal', 401, 101, 'The wall Iron builds while the others swing.', 'tower'),

  // String Brain
  fighter('string', 'brainer', 'Brainer', 380, 20, 'It is not here to hit you. It is here to stay.', 'brain'),
  fighter('string', 'calculator', 'Calculator', 297 + 17, 1000 - 210, 'Works out exactly how much you had left.', 'prism'),
  fighter('string', 'coden', 'Coden', 1010, 7, 'A thousand and ten points of absolutely nothing happening.', 'block'),
  fighter('string', 'puppeteer', 'Puppeteer', 248, 157, 'Cheap enough to hold a lane while the big ones load.', 'puppet'),
  fighter('string', 'grand', 'Grand', 560, 129, 'Big, patient, and always in the way.', 'crown'),
];

/* ------------------------------------------------------- supports and spells */

/**
 * Effects are data, read by `rules.js`:
 *   buff     {stat, amount, duration}      target an ally fighter
 *   heal     {amount}                      ally fighter, or all allies
 *   shield   {amount}                      damage the fighter ignores next hit
 *   damage   {amount}                      enemy fighter, all enemies, or the core
 *   drain    {stat, amount, duration}      take damage off an enemy fighter
 *   silence  {turns}                       an enemy fighter cannot attack
 *   draw     {count}                       cards
 *   energy   {amount}                      right now
 *   discard  {count}                       from the enemy hand
 *   haste    {}                            your fighters may attack the turn they land
 *   move     {}                            send a fighter to another lane
 *   revive   {}                            a fallen fighter back to your hand
 *   coreward {amount}                      damage your core ignores next turn
 */
const card = (faction, kind, id, name, cost, target, effect, blurb, tier = 'core') => ({
  id: `${faction}-${id}`,
  kind,
  faction,
  name,
  cost,
  target,
  effect,
  blurb,
  tier,
});

export const SUPPORTS = [
  // --- Iron Warrior ------------------------------------------------------
  card('iron', 'support', 'plating', 'Plating', 1, 'ally', { buff: { stat: 'hp', amount: 120 } }, '+120 HP, for good.'),
  card('iron', 'support', 'overclock', 'Overclock', 1, 'ally', { buff: { stat: 'damage', amount: 90, duration: 'turn' } }, '+90 damage this turn.'),
  card('iron', 'support', 'weld', 'Weld', 1, 'ally', { heal: { amount: 150 } }, 'Repair 150.'),
  card('iron', 'support', 'salvage', 'Scrap Salvage', 2, 'none', { draw: { count: 2 } }, 'Draw two cards.'),
  card('iron', 'support', 'assembly', 'Assembly Line', 0, 'none', { energy: { amount: 2 } }, 'Gain 2 energy now.'),
  card('iron', 'support', 'riveted', 'Riveted Guard', 2, 'ally', { shield: { amount: 250 } }, 'Ignore the next 250 damage.'),
  card('iron', 'support', 'foundry', 'Foundry Blast', 3, 'none', { buff: { stat: 'damage', amount: 60, duration: 'turn', scope: 'all' } }, '+60 damage to every fighter you have, this turn.'),
  card('iron', 'support', 'magnetise', 'Magnetise', 2, 'enemy', { move: {} }, 'Drag an enemy fighter into another lane.'),
  card('iron', 'support', 'repair-bay', 'Repair Bay', 3, 'none', { heal: { amount: 100, scope: 'all' } }, 'Repair 100 across your whole line.'),
  card('iron', 'support', 'discipline', 'Iron Discipline', 2, 'none', { haste: {} }, 'Your fighters can attack the turn they land.'),
  card('iron', 'support', 'scrap-cannon', 'Scrap Cannon', 2, 'ally', { buff: { stat: 'damage', amount: 150, duration: 'turn' } }, '+150 damage this turn.', 'elite'),
  card('iron', 'support', 'reinforce', 'Reinforce', 1, 'ally', { buff: { stat: 'hp', amount: 60 } }, '+60 HP, for good.', 'basic'),

  // --- String Brain ------------------------------------------------------
  card('string', 'support', 'tangle', 'Tangle', 2, 'enemy', { silence: { turns: 1 } }, 'That fighter does not attack next turn.'),
  card('string', 'support', 'mind-spike', 'Mind Spike', 2, 'enemy', { drain: { stat: 'damage', amount: 80 } }, '-80 damage, permanently.'),
  card('string', 'support', 'recalculate', 'Recalculate', 2, 'none', { draw: { count: 2 } }, 'Draw two cards.'),
  card('string', 'support', 'neural-boost', 'Neural Boost', 2, 'ally', { buff: { stat: 'damage', amount: 100, duration: 'turn' } }, '+100 damage this turn.'),
  card('string', 'support', 'synaptic', 'Synaptic Shield', 2, 'none', { coreward: { amount: 200 } }, 'Your core ignores the next 200.'),
  card('string', 'support', 'puppet-strings', 'Puppet Strings', 2, 'enemy', { move: {} }, 'Walk an enemy fighter into another lane.'),
  card('string', 'support', 'overthink', 'Overthink', 2, 'none', { discard: { count: 1 } }, 'The rival throws a card away.'),
  card('string', 'support', 'rewrite', 'Rewrite', 3, 'enemy', { drain: { stat: 'damage', amount: 200, duration: 'turn' } }, '-200 damage this turn.'),
  card('string', 'support', 'firewall', 'Firewall', 3, 'none', { coreward: { amount: 400 } }, 'Your core ignores the next 400.'),
  card('string', 'support', 'backup-loop', 'Backup Loop', 3, 'none', { revive: {} }, 'A fallen fighter returns to your hand.'),
  card('string', 'support', 'deep-thought', 'Deep Thought', 3, 'none', { draw: { count: 3 } }, 'Draw three cards.', 'elite'),
  card('string', 'support', 'static', 'Static', 1, 'enemy', { drain: { stat: 'damage', amount: 40 } }, '-40 damage, permanently.', 'basic'),
];

export const INSTANTS = [
  card('iron', 'instant', 'rocket-punch', 'Rocket Punch', 3, 'enemy', { damage: { amount: 300 } }, '300 damage to one fighter.'),
  card('iron', 'instant', 'rail-shot', 'Rail Shot', 4, 'none', { damage: { amount: 250, scope: 'core' } }, '250 straight to the rival core.'),
  card('iron', 'instant', 'scrap-grenade', 'Scrap Grenade', 4, 'none', { damage: { amount: 150, scope: 'all' } }, '150 to every enemy fighter.', 'elite'),

  card('string', 'instant', 'logic-bomb', 'Logic Bomb', 3, 'enemy', { damage: { amount: 350 } }, '350 damage to one fighter.'),
  card('string', 'instant', 'mind-burn', 'Mind Burn', 3, 'none', { damage: { amount: 200, scope: 'core' } }, '200 straight to the rival core.'),
  card('string', 'instant', 'cascade', 'Cascade', 3, 'none', { damage: { amount: 120, scope: 'all' } }, '120 to every enemy fighter.', 'elite'),
];

/**
 * Traps are set face down for their cost and fire on their own during the
 * rival's turn. `trigger` says when.
 */
export const TRAPS = [
  card('iron', 'trap', 'bear-trap', 'Bear Trap', 2, 'none', { trigger: 'enemy-deploy', damage: { amount: 200 } }, 'A fighter arrives: 200 damage to it.'),
  card('iron', 'trap', 'counterweight', 'Counterweight', 2, 'none', { trigger: 'core-hit', damage: { amount: 150, scope: 'attacker' } }, 'Your core is hit: 150 back to whatever hit it.'),
  card('iron', 'trap', 'scrap-mines', 'Scrap Mines', 2, 'none', { trigger: 'enemy-instant', damage: { amount: 180, scope: 'core' } }, 'They cast an instant: 180 to their core.'),
  card('iron', 'trap', 'lockdown', 'Lockdown', 3, 'none', { trigger: 'enemy-support', cancel: true }, 'Their next support card does nothing.', 'elite'),
  card('iron', 'trap', 'emergency-weld', 'Emergency Weld', 3, 'none', { trigger: 'ally-death', heal: { amount: 200 } }, 'A fighter of yours falls: it survives on 200 instead.', 'basic'),

  card('string', 'trap', 'neural-snare', 'Neural Snare', 2, 'none', { trigger: 'enemy-deploy', silence: { turns: 2 } }, 'A fighter arrives: it cannot attack for two turns.'),
  card('string', 'trap', 'mirror', 'Mirror', 3, 'none', { trigger: 'core-hit', reflect: true }, 'Your core is hit: the attacker takes the same.'),
  card('string', 'trap', 'blackout', 'Blackout', 2, 'none', { trigger: 'enemy-instant', cancel: true }, 'Their next instant does nothing.'),
  card('string', 'trap', 'overload', 'Overload', 3, 'none', { trigger: 'enemy-full-board', damage: { amount: 150, scope: 'all' } }, 'They fill all three lanes: 150 to each.', 'elite'),
  card('string', 'trap', 'feedback', 'Feedback Loop', 1, 'none', { trigger: 'enemy-support', draw: { count: 2 } }, 'They play a support: you draw two.', 'basic'),
];

export const ALL_CARDS = [...FIGHTERS, ...SUPPORTS, ...INSTANTS, ...TRAPS];
export const CARD_BY_ID = new Map(ALL_CARDS.map((entry) => [entry.id, entry]));

export function getCard(id) {
  const found = CARD_BY_ID.get(id);
  if (!found) throw new Error(`Unknown card: ${id}`);
  return found;
}

/* -------------------------------------------------------------------- decks */

export const DECK_SHAPE = { fighter: 5, support: 10, instant: 2, trap: 3 };
export const DECK_SIZE = Object.values(DECK_SHAPE).reduce((total, count) => total + count, 0);

/**
 * A deck is always the same shape; the difficulty decides which cards fill the
 * support, instant and trap slots. Every deck runs all five of its fighters.
 */
const order = (tiers) => (entry) => tiers.indexOf(entry.tier);

/**
 * `spread` is how many different cards the recipe runs before it starts
 * doubling up. Measured head to head, variety beats concentration in this game
 * by a wide margin - a deck of four cards drawn three times each floods your
 * hand with copies you have nothing to point at - so the ladder runs from a
 * repetitive Trainee pile up to a Prototype deck that carries one of
 * everything.
 */
export const RECIPES = {
  basic: { label: 'Trainee', blurb: 'The same few cheap cards, over and over.', spread: 0.45, rank: order(['basic', 'core', 'elite']) },
  core: { label: 'Standard', blurb: 'The deck as it comes in the box.', spread: 0.7, rank: order(['core', 'elite', 'basic']) },
  elite: { label: 'Prototype', blurb: 'One of everything, and the best of it.', spread: 1.0, rank: order(['elite', 'core', 'basic']) },
};

function pick(pool, faction, kind, count, recipe) {
  const available = pool.filter((entry) => entry.faction === faction && entry.kind === kind);
  const ranked = [...available].sort((a, b) => recipe.rank(a) - recipe.rank(b));
  // Each recipe runs a narrower list with duplicates rather than one of
  // everything, so a Trainee deck and a Prototype deck share very little.
  const roster = ranked.slice(0, Math.max(2, Math.min(ranked.length, Math.ceil(count * recipe.spread))));
  const chosen = [];
  while (chosen.length < count) chosen.push(roster[chosen.length % roster.length]);
  return chosen;
}

/** Builds a twenty-card deck: 5 fighters, 10 supports, 2 instants, 3 traps. */
export function buildDeck(faction, recipeId = 'core') {
  const recipe = RECIPES[recipeId] || RECIPES.core;
  return [
    ...FIGHTERS.filter((entry) => entry.faction === faction),
    ...pick(SUPPORTS, faction, 'support', DECK_SHAPE.support, recipe),
    ...pick(INSTANTS, faction, 'instant', DECK_SHAPE.instant, recipe),
    ...pick(TRAPS, faction, 'trap', DECK_SHAPE.trap, recipe),
  ];
}

export function deckSummary(faction, recipeId = 'core') {
  const deck = buildDeck(faction, recipeId);
  const counts = {};
  for (const entry of deck) counts[entry.kind] = (counts[entry.kind] || 0) + 1;
  return counts;
}
