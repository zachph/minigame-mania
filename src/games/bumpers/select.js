import { CHARACTERS } from './content.js';

/**
 * The DOM half of Bumpers: pick a mode, pick a ball, start.
 *
 * It is a panel over the canvas rather than something drawn, because a grid of
 * things you hover and click is a job the browser already does properly. Once
 * the fight starts the panel goes away and the rest is all canvas.
 */

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/** A little canvas showing the ball itself, so you pick by sight not by name. */
function ballSwatch(spec) {
  const size = 46;
  const canvas = el('canvas', 'bb-swatch');
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = size * ratio;
  canvas.height = size * ratio;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  const grad = ctx.createRadialGradient(size * 0.36, size * 0.34, 3, size / 2, size / 2, size / 2 - 2);
  grad.addColorStop(0, spec.colour);
  grad.addColorStop(1, spec.shade);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(8, 12, 20, 0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();
  return canvas;
}

const STAT_MAX = { hp: 150, top: 500, mass: 2.6, power: 1.5 };
const STAT_LABEL = { hp: 'health', top: 'speed', mass: 'weight', power: 'power' };

function statRow(spec, key) {
  const row = el('div', 'bb-stat');
  row.append(el('span', 'bb-stat-label', STAT_LABEL[key]));
  const track = el('span', 'bb-stat-track');
  const fill = el('span', 'bb-stat-fill');
  fill.style.width = `${Math.min(100, (spec[key] / STAT_MAX[key]) * 100)}%`;
  track.append(fill);
  row.append(track);
  return row;
}

export class SelectPanel {
  constructor(container, { onStart }) {
    this.onStart = onStart;
    this.mode = 'ladder';
    this.picks = { a: CHARACTERS[0].id, b: CHARACTERS[1].id };
    this.seat = 'a';   // which seat the grid is currently choosing for

    this.root = el('div', 'bb-select');
    container.append(this.root);

    const head = el('div', 'bb-select-head');
    const title = el('div', 'bb-select-title');
    title.append(el('h2', null, 'Bumpers'));
    title.append(el('p', null, 'Two balls, one room, and only the speed you bring into a hit counts.'));
    head.append(title);

    this.modes = el('div', 'bb-modes');
    for (const [id, label] of [['ladder', 'Climb the ladder'], ['versus', 'Two players']]) {
      const button = el('button', 'bb-mode', label);
      button.type = 'button';
      button.dataset.mode = id;
      button.addEventListener('click', () => this.setMode(id));
      this.modes.append(button);
    }
    head.append(this.modes);
    this.root.append(head);

    this.seats = el('div', 'bb-seats');
    this.root.append(this.seats);

    this.grid = el('div', 'bb-grid');
    for (const spec of CHARACTERS) {
      const card = el('button', 'bb-card');
      card.type = 'button';
      card.dataset.id = spec.id;
      card.append(ballSwatch(spec));
      const body = el('div', 'bb-card-body');
      const name = el('div', 'bb-card-name');
      name.append(el('strong', null, spec.name));
      name.append(el('span', 'bb-card-role', spec.role));
      body.append(name);
      body.append(el('p', 'bb-card-blurb', spec.blurb));
      const stats = el('div', 'bb-stats');
      for (const key of ['hp', 'top', 'mass', 'power']) stats.append(statRow(spec, key));
      body.append(stats);
      body.append(el('p', 'bb-card-ability', `${spec.ability.name} - ${spec.ability.blurb}`));
      card.append(body);
      card.addEventListener('click', () => this.pick(spec.id));
      this.grid.append(card);
    }
    this.root.append(this.grid);

    const foot = el('div', 'bb-select-foot');
    this.hint = el('p', 'bb-hint', '');
    this.startButton = el('button', 'btn btn--primary', 'Start');
    this.startButton.type = 'button';
    this.startButton.addEventListener('click', () => {
      this.onStart({ mode: this.mode, picks: { ...this.picks } });
    });
    foot.append(this.hint, this.startButton);
    this.root.append(foot);

    this.setMode('ladder');
  }

  setMode(mode) {
    this.mode = mode;
    this.seat = 'a';
    this.render();
  }

  pick(id) {
    this.picks[this.seat] = id;
    // In versus, choosing for player one moves you straight on to player two.
    if (this.mode === 'versus' && this.seat === 'a') this.seat = 'b';
    this.render();
  }

  render() {
    for (const button of this.modes.children) {
      button.classList.toggle('is-active', button.dataset.mode === this.mode);
    }

    this.seats.innerHTML = '';
    const seats = this.mode === 'versus'
      ? [['a', 'Player 1', 'WASD + Space'], ['b', 'Player 2', 'Arrows + Enter']]
      : [['a', 'You', 'WASD or arrows, Space for your ability']];
    for (const [seat, label, keys] of seats) {
      const chip = el('button', 'bb-seat');
      chip.type = 'button';
      chip.classList.toggle('is-active', this.mode === 'versus' && seat === this.seat);
      const pick = CHARACTERS.find((c) => c.id === this.picks[seat]);
      chip.append(el('span', 'bb-seat-label', label));
      chip.append(el('strong', null, pick ? pick.name : 'pick one'));
      chip.append(el('span', 'bb-seat-keys', keys));
      chip.addEventListener('click', () => { this.seat = seat; this.render(); });
      this.seats.append(chip);
    }

    const active = this.picks[this.seat];
    for (const card of this.grid.children) {
      card.classList.toggle('is-picked', card.dataset.id === active);
    }

    this.hint.textContent = this.mode === 'versus'
      ? 'Best of three. Both of you on one keyboard.'
      : 'Six opponents, each harder than the last. You keep your health between rounds.';
  }

  destroy() {
    this.root.remove();
  }
}
