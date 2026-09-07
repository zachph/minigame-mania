import { FACTIONS, FIGHTERS, DECK_SHAPE, RECIPES, buildDeck } from './cards.js';
import { DIFFICULTIES } from './ai.js';
import { drawFighterArt } from './render.js';

/** The deck-choice screen. Everything in a match itself is drawn on the table. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function sigil(faction, art, size = 30) {
  const canvas = el('canvas', 'sh-sigil');
  const scale = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = size * scale;
  canvas.height = size * scale;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  drawFighterArt(ctx, art, faction, size / 2, size / 2, size * 0.8);
  return canvas;
}

export class SetupPanel {
  constructor(container, { onStart }) {
    this.faction = 'iron';
    this.difficulty = 'normal';
    this.onStart = onStart;
    this.root = el('div', 'sh-setup');
    container.append(this.root);

    const card = el('div', 'sh-setup-card');
    card.append(el('h2', null, 'Shubat'));
    card.append(el('p', 'sh-lede', 'Pick a starter deck. Twenty cards: five fighters, ten supports, two instants, three traps. Three lanes, one core each, and whatever gets through is what counts.'));

    this.decks = el('div', 'sh-decks');
    for (const faction of Object.values(FACTIONS)) {
      this.decks.append(this._deckCard(faction));
    }
    card.append(this.decks);

    const choice = el('div', 'sh-choice');
    choice.append(el('span', 'sh-choice-label', 'Rival'));
    const options = el('div', 'sh-choice-options');
    this.levelButtons = [];
    for (const level of Object.values(DIFFICULTIES)) {
      const button = el('button', 'sh-option', level.name);
      button.type = 'button';
      button.title = level.blurb;
      button.classList.toggle('is-active', level.id === this.difficulty);
      button.addEventListener('click', () => {
        this.difficulty = level.id;
        for (const other of this.levelButtons) other.classList.toggle('is-active', other.textContent === level.name);
        this.note.textContent = level.blurb;
      });
      this.levelButtons.push(button);
      options.append(button);
    }
    choice.append(options);
    card.append(choice);

    this.note = el('p', 'sh-note', DIFFICULTIES.normal.blurb);
    card.append(this.note);

    const start = el('button', 'btn btn--primary sh-start', 'Start the duel');
    start.type = 'button';
    start.addEventListener('click', () => this.onStart({ faction: this.faction, difficulty: this.difficulty }));
    card.append(start);
    this.root.append(card);
    this._paint();
  }

  _deckCard(faction) {
    const node = el('button', 'sh-deck');
    node.type = 'button';
    node.dataset.faction = faction.id;
    node.style.setProperty('--faction', faction.color);

    const head = el('div', 'sh-deck-head');
    head.append(el('strong', null, faction.name));
    head.append(el('span', 'sh-passive', faction.passive.name));
    node.append(head);
    node.append(el('p', 'sh-deck-lede', faction.tagline));
    node.append(el('p', 'sh-deck-passive', faction.passive.blurb));

    const roster = el('div', 'sh-roster');
    for (const fighter of FIGHTERS.filter((entry) => entry.faction === faction.id)) {
      const row = el('div', 'sh-fighter');
      row.append(sigil(faction, fighter.art, 26));
      const meta = el('div', 'sh-fighter-meta');
      meta.append(el('strong', null, fighter.name));
      meta.append(el('span', null, `${fighter.hp} HP · ${fighter.damage} dmg · costs ${fighter.cost}`));
      row.append(meta);
      roster.append(row);
    }
    node.append(roster);

    const shape = Object.entries(DECK_SHAPE).map(([kind, count]) => `${count} ${kind}${count > 1 ? 's' : ''}`).join(' · ');
    node.append(el('span', 'sh-deck-shape', shape));

    node.addEventListener('click', () => {
      this.faction = faction.id;
      this._paint();
    });
    return node;
  }

  _paint() {
    for (const node of this.decks.querySelectorAll('.sh-deck')) {
      node.classList.toggle('is-picked', node.dataset.faction === this.faction);
    }
  }

  destroy() {
    this.root.remove();
  }
}

export { RECIPES, buildDeck };
