/**
 * The support cards.
 *
 * Fifteen exist; a loadout takes five of them, three copies each. Five of the
 * fifteen can be played when it is not your turn, and those are the ones that
 * make an attack into a question - a card you were sure you could kill steps
 * aside, or lives through the swing and hits back.
 *
 * `effect` is read by the battle. Nothing here knows how to draw itself.
 */

const support = (id, name, rarity, timing, effect, blurb) =>
  ({ id, name, kind: 'support', rarity, timing, effect, blurb });

export const SUPPORTS = [
  support('patch-up', 'Patch Up', 'common', 'turn', { kind: 'heal', amount: 4, target: 'friendly' },
    'Puts 4 health back on one of your cards.'),

  support('hex-bolt', 'Hex Bolt', 'common', 'turn', { kind: 'damage', amount: 3, target: 'enemy' },
    'Three damage to any one of theirs, without anything of yours going near it.'),

  support('grave-call', 'Grave Call', 'common', 'turn', { kind: 'recall', target: 'graveyard' },
    'Brings a card back out of your graveyard, and it comes back free.'),

  support('sidestep', 'Sidestep', 'common', 'instant', { kind: 'buff', stat: 'speed', amount: 4, target: 'friendly', lasts: 'turn' },
    '+4 speed until the turn ends. Played on their turn, it steals the first swing.'),

  support('iron-will', 'Iron Will', 'common', 'instant', { kind: 'buff', stat: 'hp', amount: 3, target: 'friendly', lasts: 'match' },
    '+3 health, there and then. Enough to live through a hit that was meant to finish it.'),
];

export const SUPPORT_BY_ID = new Map(SUPPORTS.map((entry) => [entry.id, entry]));
export const getSupport = (id) => {
  const found = SUPPORT_BY_ID.get(id);
  if (!found) throw new Error(`Unknown support: ${id}`);
  return found;
};

export const instantSupports = () => SUPPORTS.filter((entry) => entry.timing === 'instant');
