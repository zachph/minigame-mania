import { FIGHTERS, MODES, TEAM_SIZE } from './content.js';

/**
 * Picking a mode and three fighters, in order.
 *
 * The order matters as much as the picks - the first one you name walks out
 * first and the third only ever fights if the other two have gone - so the
 * cards show their place in the line rather than just whether they are chosen.
 */

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/** A small drawing of the fighter, so you pick by sight as well as by name. */
function portrait(spec) {
  const size = 40;
  const canvas = el('canvas', 'fo-portrait');
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = size * ratio;
  canvas.height = size * ratio;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  const body = ctx.createLinearGradient(0, 0, 0, size);
  body.addColorStop(0, spec.colour);
  body.addColorStop(1, spec.shade);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(5, 3, size - 10, size - 6, 9) : ctx.rect(5, 3, size - 10, size - 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(8, 12, 20, 0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();
  return canvas;
}

/** What the card says under the name: health, and dodges for the one that has them. */
function statLine(spec) {
  return spec.dodges > 0 ? `${spec.hp} HP - dodges the first ${spec.dodges}` : `${spec.hp} HP`;
}

export class SelectPanel {
  constructor(container, { onStart }) {
    this.onStart = onStart;
    this.mode = 'sandbox';
    this.picked = [];

    this.root = el('div', 'fo-select');
    container.append(this.root);

    const head = el('div', 'fo-select-head');
    const title = el('div', 'fo-select-title');
    title.append(el('h2', null, 'Faceoff'));
    title.append(el('p', null, 'Pick three. They go into the box one at a time and bump each other until one is out.'));
    head.append(title);

    this.modes = el('div', 'fo-modes');
    for (const mode of MODES) {
      const button = el('button', 'fo-mode');
      button.type = 'button';
      button.dataset.mode = mode.id;
      button.append(el('strong', null, mode.name));
      button.append(el('span', null, mode.blurb));
      button.addEventListener('click', () => { this.mode = mode.id; this.render(); });
      this.modes.append(button);
    }
    head.append(this.modes);
    this.root.append(head);

    this.lineup = el('div', 'fo-lineup');
    this.root.append(this.lineup);

    this.grid = el('div', 'fo-grid');
    for (const spec of FIGHTERS) {
      const card = el('button', 'fo-card');
      card.type = 'button';
      card.dataset.id = spec.id;
      card.append(portrait(spec));
      const body = el('div', 'fo-card-body');
      const name = el('div', 'fo-card-name');
      name.append(el('strong', null, spec.name));
      name.append(el('span', 'fo-card-place', ''));
      body.append(name);
      body.append(el('p', 'fo-card-blurb', statLine(spec)));
      body.append(el('p', 'fo-card-ability', spec.ability ? spec.ability.name : 'ability coming'));
      card.append(body);
      card.addEventListener('click', () => this.toggle(spec.id));
      this.grid.append(card);
    }
    this.root.append(this.grid);

    const foot = el('div', 'fo-select-foot');
    this.hint = el('p', 'fo-hint', '');
    this.startButton = el('button', 'btn btn--primary', 'Fight');
    this.startButton.type = 'button';
    this.startButton.addEventListener('click', () => {
      if (this.picked.length === TEAM_SIZE) this.onStart({ mode: this.mode, team: [...this.picked] });
    });
    foot.append(this.hint, this.startButton);
    this.root.append(foot);

    this.render();
  }

  toggle(id) {
    const at = this.picked.indexOf(id);
    if (at >= 0) this.picked.splice(at, 1);
    else if (this.picked.length < TEAM_SIZE) this.picked.push(id);
    this.render();
  }

  render() {
    for (const button of this.modes.children) {
      button.classList.toggle('is-active', button.dataset.mode === this.mode);
    }

    this.lineup.replaceChildren();
    for (let i = 0; i < TEAM_SIZE; i += 1) {
      const id = this.picked[i];
      const spec = FIGHTERS.find((f) => f.id === id);
      const slot = el('div', 'fo-slot');
      slot.classList.toggle('is-filled', Boolean(spec));
      slot.append(el('span', 'fo-slot-no', i === 0 ? 'first out' : i === 1 ? 'second' : 'last'));
      slot.append(el('strong', null, spec ? spec.name : '-'));
      if (spec) {
        slot.style.setProperty('--who', spec.colour);
        slot.addEventListener('click', () => this.toggle(spec.id));
      }
      this.lineup.append(slot);
    }

    for (const card of this.grid.children) {
      const at = this.picked.indexOf(card.dataset.id);
      card.classList.toggle('is-picked', at >= 0);
      card.querySelector('.fo-card-place').textContent = at >= 0 ? `#${at + 1}` : '';
    }

    const left = TEAM_SIZE - this.picked.length;
    this.hint.textContent = left > 0
      ? `Pick ${left} more. The first one you choose walks out first.`
      : 'Click one of your three to take it back out.';
    this.startButton.disabled = left > 0;
  }

  destroy() {
    this.root.remove();
  }
}
