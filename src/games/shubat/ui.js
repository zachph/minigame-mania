import { SUITS } from './cards.js';
import { DIFFICULTIES } from './ai.js';
import { drawSuitGlyph } from './render.js';

/** The pre-match panel. Everything in a match itself is drawn on the table. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function suitChip(suit) {
  const canvas = el('canvas', 'sb-suit');
  const scale = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = 34 * scale;
  canvas.height = 34 * scale;
  canvas.style.width = '34px';
  canvas.style.height = '34px';
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  drawSuitGlyph(ctx, suit, 17, 17, 26);
  canvas.title = suit.name;
  return canvas;
}

export class SetupPanel {
  constructor(container, { onStart }) {
    this.difficulty = 'normal';
    this.root = el('div', 'sb-setup');
    container.append(this.root);

    const card = el('div', 'sb-setup-card');
    card.append(el('h2', null, 'Shubat'));
    card.append(el('p', 'sb-lede', 'A duel over thirty-two cards. Take the tricks worth taking.'));

    const herds = el('div', 'sb-herds');
    for (const suit of SUITS) {
      const chip = el('div', 'sb-herd');
      chip.append(suitChip(suit), el('span', null, suit.name));
      herds.append(chip);
    }
    card.append(herds);

    const rules = el('ul', 'sb-rules');
    for (const line of [
      'Four herds of eight. <strong>A card’s number is both its strength and its worth</strong> — an eight wins the trick and scores eight.',
      'One card is turned up to set the <strong>trump herd</strong>. Trumps beat any other herd.',
      'Play any card you like while the stock lasts; the higher card of the led herd takes the trick, and a trump takes it outright.',
      'Winner of a trick leads the next and draws first. <strong>Once the stock runs out you must follow the led herd</strong> if you can.',
      '<strong>Two deals a match</strong> — you lead one, the rival leads the other, because leading first is worth about six points. Most points over both wins.',
    ]) {
      const item = el('li');
      item.innerHTML = line;
      rules.append(item);
    }
    card.append(rules);

    const choice = el('div', 'sb-choice');
    choice.append(el('span', 'sb-choice-label', 'Rival'));
    const options = el('div', 'sb-choice-options');
    const buttons = [];
    for (const level of Object.values(DIFFICULTIES)) {
      const button = el('button', 'sb-option', level.name);
      button.type = 'button';
      button.title = level.blurb;
      button.classList.toggle('is-active', level.id === this.difficulty);
      button.addEventListener('click', () => {
        this.difficulty = level.id;
        for (const other of buttons) other.classList.toggle('is-active', other.textContent === level.name);
      });
      buttons.push(button);
      options.append(button);
    }
    choice.append(options);
    card.append(choice);

    const start = el('button', 'btn btn--primary sb-start', 'Deal');
    start.type = 'button';
    start.addEventListener('click', () => onStart({ difficulty: this.difficulty }));
    card.append(start);

    this.root.append(card);
  }

  destroy() {
    this.root.remove();
  }
}
