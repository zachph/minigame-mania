import { PACK_COST, RARITY_BY_ID } from './collection.js';
import { PACK_KINDS, emptyTiers } from './packs.js';
import { canBuy, collectionProgress } from './profile.js';

/**
 * The screen between matches: what you own, what you can open, and the way
 * into a game. DOM rather than canvas, because it is a page of buttons and
 * numbers and the browser is better at those than a drawing is.
 */

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export class HomePanel {
  constructor(container, { onOpenPack, onBuyPack, onPlay }) {
    this.handlers = { onOpenPack, onBuyPack, onPlay };
    this.root = el('div', 'sc-home');
    container.append(this.root);

    const head = el('div', 'sc-home-head');
    const title = el('div', 'sc-home-title');
    title.append(el('h2', null, 'Strike Cards'));
    title.append(el('p', null, 'Open what you have earned, then take a deck into a match.'));
    head.append(title);
    this.stats = el('div', 'sc-home-stats');
    head.append(this.stats);
    this.root.append(head);

    this.packs = el('div', 'sc-packs');
    this.root.append(this.packs);

    const foot = el('div', 'sc-home-foot');
    this.note = el('p', 'sc-home-note', '');
    const play = el('button', 'btn btn--primary', 'Play a match');
    play.type = 'button';
    play.addEventListener('click', () => this.handlers.onPlay());
    foot.append(this.note, play);
    this.root.append(foot);
  }

  /** Redraws everything from the profile. Called after every change. */
  refresh(profile) {
    const progress = collectionProgress(profile);
    this.stats.replaceChildren();
    const rows = [
      ['Coins', `${profile.coins}`],
      ['Collection', `${progress.owned} of ${progress.total}`],
      ['Unopened', `${profile.packs.strike + profile.packs.support}`],
    ];
    for (const [label, value] of rows) {
      const stat = el('div', 'sc-home-stat');
      stat.append(el('span', 'sc-home-stat-label', label));
      stat.append(el('strong', null, value));
      this.stats.append(stat);
    }

    this.packs.replaceChildren();
    for (const kind of PACK_KINDS) {
      const held = profile.packs[kind.id] || 0;
      const tile = el('div', 'sc-pack');
      tile.style.setProperty('--pack', kind.color);

      const top = el('div', 'sc-pack-top');
      top.append(el('strong', null, kind.name));
      top.append(el('span', 'sc-pack-count', held ? `x${held}` : 'none'));
      tile.append(top);
      tile.append(el('p', 'sc-pack-blurb', kind.blurb));

      const actions = el('div', 'sc-pack-actions');
      const open = el('button', 'btn btn--primary sc-pack-open', 'Open one');
      open.type = 'button';
      open.disabled = held <= 0;
      open.addEventListener('click', () => this.handlers.onOpenPack(kind.id));

      const buy = el('button', 'btn', `Buy - ${PACK_COST}`);
      buy.type = 'button';
      buy.disabled = !canBuy(profile);
      buy.addEventListener('click', () => this.handlers.onBuyPack(kind.id));

      actions.append(open, buy);
      tile.append(actions);

      // Say plainly which tiers cannot come out of this pack yet, rather than
      // letting someone wonder why they have never seen a legendary.
      const missing = emptyTiers(kind.id);
      if (missing.length) {
        const names = missing.map((id) => RARITY_BY_ID.get(id)?.name.toLowerCase() || id);
        tile.append(el('p', 'sc-pack-missing', `No ${names.join(', ')} cards exist yet - those rolls drop a tier.`));
      }
      this.packs.append(tile);
    }

    this.note.textContent = profile.coins >= PACK_COST
      ? 'Selling spare copies is what pays for packs.'
      : `Win a match to earn a pack. Spare cards sell for ${PACK_COST / 5} coins each.`;
  }

  destroy() {
    this.root.remove();
  }
}
