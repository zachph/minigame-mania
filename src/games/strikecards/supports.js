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

  support('second-wind', 'Second Wind', 'common', 'turn', { kind: 'draw', amount: 2 },
    'Draw two. Nothing else here refills a hand, and a hand of nothing is how a game goes quiet.'),

  // The mirror of Sidestep. Both decide who swings first; this one is for when
  // the card you want to save is not the card you want to make faster - and it
  // works on a board where you have nothing out at all.
  support('dead-weight', 'Dead Weight', 'uncommon', 'instant', { kind: 'buff', stat: 'speed', amount: -5, target: 'enemy', lasts: 'turn' },
    '-5 speed on one of theirs until the turn ends. Played on their turn, it takes the first swing off them.'),

  // The only support that pays more for having two cards out, which is the one
  // thing the board limit makes you choose about.
  support('warcry', 'Warcry', 'uncommon', 'turn', { kind: 'buff', stat: 'power', amount: 2, target: 'friendly', scope: 'board', lasts: 'match' },
    '+2 power to everything you have out, for the rest of the match. Worth double with a full board.'),

  // The answer to the rule the whole game turns on: kill it before it moves and
  // it never swings back. This is the card that makes them wonder.
  support('last-stand', 'Last Stand', 'rare', 'instant', { kind: 'shield', target: 'friendly' },
    'One of yours cannot be knocked out this turn - it holds on at 1. Played on their turn, the kill they lined up trades instead.'),
];

export const SUPPORT_BY_ID = new Map(SUPPORTS.map((entry) => [entry.id, entry]));
export const getSupport = (id) => {
  const found = SUPPORT_BY_ID.get(id);
  if (!found) throw new Error(`Unknown support: ${id}`);
  return found;
};

export const instantSupports = () => SUPPORTS.filter((entry) => entry.timing === 'instant');
