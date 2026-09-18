import { SELL_RETURN, TOWERS } from './content.js';
import { drawTowerShape } from './render.js';

/**
 * The build bar along the bottom. It is the only DOM in Defensele - everything
 * else happens on the map.
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function sigil(spec, size = 24) {
  const canvas = el('canvas', 'df-sigil');
  const scale = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = size * scale;
  canvas.height = size * scale;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  drawTowerShape(ctx, spec, size / 2, size / 2 + 4, size / 42, 0);
  return canvas;
}

export class BuildBar {
  constructor(container, { onPick, onSell }) {
    this.onPick = onPick;
    this.onSell = onSell;
    this.picked = null;
    this.root = el('div', 'df-bar');
    container.append(this.root);

    this.buttons = new Map();
    for (const spec of TOWERS) {
      const button = el('button', 'df-tower');
      button.type = 'button';
      button.style.setProperty('--tint', spec.color);
      button.append(sigil(spec));
      const meta = el('div', 'df-tower-meta');
      meta.append(el('strong', null, spec.name));
      meta.append(el('span', 'df-cost', `${spec.cost}g`));
      button.append(meta);
      button.title = `${spec.blurb}\n${spec.role}`;
      button.addEventListener('click', () => {
        this.picked = this.picked === spec.id ? null : spec.id;
        this.onPick(this.picked);
        this.refresh(this.lastGold ?? 0);
      });
      this.buttons.set(spec.id, button);
      this.root.append(button);
    }

    this.detail = el('div', 'df-detail');
    this.root.append(this.detail);
  }

  /** Greys out what you cannot afford and marks what you are holding. */
  refresh(gold, selectedTower = null) {
    this.lastGold = gold;
    for (const spec of TOWERS) {
      const button = this.buttons.get(spec.id);
      button.classList.toggle('is-picked', this.picked === spec.id);
      button.classList.toggle('is-broke', gold < spec.cost);
    }

    this.detail.replaceChildren();
    if (selectedTower) {
      const refund = Math.round(selectedTower.spec.cost * SELL_RETURN);
      this.detail.append(el('strong', null, selectedTower.spec.name));
      // A Money Tree has never killed anything; what it has earned is the point.
      this.detail.append(selectedTower.spec.income
        ? el('span', null, `${selectedTower.earned}g fruited`)
        : el('span', null, `${selectedTower.kills} kill${selectedTower.kills === 1 ? '' : 's'}`));
      const sell = el('button', 'btn btn--ghost df-sell', `Sell for ${refund}g`);
      sell.type = 'button';
      sell.addEventListener('click', () => this.onSell(selectedTower));
      this.detail.append(sell);
      return;
    }
    const spec = this.picked ? TOWERS.find((entry) => entry.id === this.picked) : null;
    if (spec) {
      this.detail.append(el('strong', null, spec.name));
      this.detail.append(el('span', null, spec.blurb));
    } else {
      this.detail.append(el('span', 'df-hint', 'Pick one, then click open ground.'));
    }
  }

  clearPick() {
    this.picked = null;
    this.refresh(this.lastGold ?? 0);
  }

  destroy() {
    this.root.remove();
  }
}
