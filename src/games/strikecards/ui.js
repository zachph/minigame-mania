import { drawCard, CARD_W, CARD_H } from './art.js';

/**
 * The DOM half of Strike Cards: your hand along the bottom, and the two
 * buttons that drive a turn. The boards are drawn on the canvas; the hand is
 * here because a row of cards you scroll and hover is a thing the browser
 * already does well.
 */

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/** A little canvas of one card, for the hand. */
function cardFace(card, scale = 0.72) {
  const canvas = el('canvas', 'sc-face');
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = CARD_W * scale * ratio;
  canvas.height = CARD_H * scale * ratio;
  canvas.style.width = `${CARD_W * scale}px`;
  canvas.style.height = `${CARD_H * scale}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio * scale, ratio * scale);
  drawCard(ctx, card, 0, 0, {});
  return canvas;
}

export class HandBar {
  constructor(container, { onPick, onEndTurn }) {
    this.onPick = onPick;
    this.onEndTurn = onEndTurn;
    this.root = el('div', 'sc-bar');
    container.append(this.root);

    this.hand = el('div', 'sc-hand');
    this.root.append(this.hand);

    this.side = el('div', 'sc-actions');
    this.hint = el('p', 'sc-hint', '');
    this.endButton = el('button', 'btn btn--primary sc-end', 'End turn');
    this.endButton.type = 'button';
    this.endButton.addEventListener('click', () => this.onEndTurn());
    this.side.append(this.hint, this.endButton);
    this.root.append(this.side);

    this.picked = null;
  }

  /** Redraws the hand. `problemFor` says why a card cannot be played, if it cannot. */
  refresh(cards, { problemFor, picked, hint, canEnd }) {
    this.picked = picked;
    this.hand.replaceChildren();

    if (cards.length === 0) this.hand.append(el('span', 'sc-empty', 'Nothing in hand.'));

    cards.forEach((card, index) => {
      const button = el('button', 'sc-card');
      button.type = 'button';
      const problem = problemFor(card, index);
      button.classList.toggle('is-blocked', Boolean(problem));
      button.classList.toggle('is-picked', picked === index);
      button.append(cardFace(card));
      button.title = problem || `${card.name} - ${card.blurb || ''}`;
      button.addEventListener('click', () => this.onPick(index, card, problem));
      this.hand.append(button);
    });

    this.hint.textContent = hint || '';
    this.endButton.disabled = !canEnd;
  }

  destroy() {
    this.root.remove();
  }
}
