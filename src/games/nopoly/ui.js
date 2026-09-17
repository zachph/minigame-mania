import { PIECES, SIDES, describeMove } from './rules.js';
import { DIFFICULTIES } from './ai.js';
import { drawPieceIcon } from './render.js';

/**
 * The DOM side of Nopoly: the pre-game options and the panel beside the board
 * (whose turn it is, what has been taken, the move log).
 */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function icon(type, sideId, size) {
  const canvas = el('canvas', 'np-icon');
  const scale = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = size * scale;
  canvas.height = size * scale;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  drawPieceIcon(ctx, type, sideId, size);
  return canvas;
}

/* ------------------------------------------------------------ setup screen */

export class SetupPanel {
  constructor(container, { onStart }) {
    this.onStart = onStart;
    this.mode = 'computer';
    this.difficulty = 'normal';
    this.root = el('div', 'np-setup');
    container.append(this.root);
    this._build();
  }

  _build() {
    const card = el('div', 'np-setup-card');
    card.append(el('h2', null, 'Nopoly'));
    card.append(el('p', 'np-setup-lede', 'Red and Blue, eight pieces each, one board. Take everything your opponent has.'));

    const key = el('div', 'np-key');
    for (const piece of Object.values(PIECES)) {
      const row = el('div', 'np-key-row');
      row.append(icon(piece.id, 'red', 40));
      const meta = el('div', 'np-key-meta');
      meta.append(el('strong', null, `${piece.count} ${piece.name}${piece.count === 1 ? '' : 's'} a side`));
      meta.append(el('span', null, piece.blurb));
      row.append(meta);
      key.append(row);
    }
    card.append(key);

    card.append(this._choice('Opponent', [
      { id: 'computer', label: 'Play the computer' },
      { id: 'hotseat', label: 'Two players, one screen' },
    ], (id) => {
      this.mode = id;
      this.difficultyRow.hidden = id !== 'computer';
    }, () => this.mode));

    this.difficultyRow = this._choice('Difficulty',
      Object.values(DIFFICULTIES).map((level) => ({ id: level.id, label: level.name, title: level.blurb })),
      (id) => { this.difficulty = id; },
      () => this.difficulty);
    card.append(this.difficultyRow);

    const start = el('button', 'btn btn--primary np-start', 'Start the match');
    start.type = 'button';
    start.addEventListener('click', () => this.onStart({ mode: this.mode, difficulty: this.difficulty }));
    card.append(start);

    card.append(el('p', 'np-setup-foot', 'Red moves first. Landing on an enemy piece captures it, and nothing jumps over anything.'));
    this.root.append(card);
  }

  _choice(label, options, onPick, current) {
    const row = el('div', 'np-choice');
    row.append(el('span', 'np-choice-label', label));
    const group = el('div', 'np-choice-options');
    const buttons = [];
    for (const option of options) {
      const button = el('button', 'np-option', option.label);
      button.type = 'button';
      if (option.title) button.title = option.title;
      button.classList.toggle('is-active', option.id === current());
      button.addEventListener('click', () => {
        onPick(option.id);
        for (const other of buttons) other.button.classList.toggle('is-active', other.id === current());
      });
      buttons.push({ id: option.id, button });
      group.append(button);
    }
    row.append(group);
    return row;
  }

  destroy() {
    this.root.remove();
  }
}

/* ----------------------------------------------------------- in-game panel */

export class BoardPanel {
  constructor(container, { onResign }) {
    this.root = el('div', 'np-panel');

    this.turnCard = el('div', 'np-turn');
    this.root.append(this.turnCard);

    this.armies = el('div', 'np-armies');
    this.root.append(this.armies);

    this.root.append(el('h3', 'np-heading', 'Moves'));
    this.log = el('ol', 'np-log');
    this.root.append(this.log);

    const resign = el('button', 'btn btn--ghost np-resign', 'Resign');
    resign.type = 'button';
    resign.addEventListener('click', onResign);
    this.root.append(resign);

    container.append(this.root);
  }

  /** Whose turn, and what they are waiting on. */
  setTurn(state, { thinking, mode, playerSide }) {
    this.turnCard.replaceChildren();
    const side = SIDES[state.turn];
    this.turnCard.style.setProperty('--side', side.color);

    const label = el('span', 'np-turn-label', state.over ? 'Match over' : `${side.name} to move`);
    this.turnCard.append(label);

    let hint = '';
    if (state.over) hint = state.winner ? `${SIDES[state.winner].name} wins - ${state.reason}` : state.reason;
    else if (thinking) hint = 'Thinking...';
    else if (mode === 'hotseat') hint = 'Pick up a piece, then choose a square.';
    else hint = state.turn === playerSide ? 'Your move.' : 'Waiting on the computer.';
    this.turnCard.append(el('span', 'np-turn-hint', hint));
    this.turnCard.append(el('span', 'np-turn-count', `Turn ${Math.ceil(state.moveNumber / 2)}`));
  }

  /** Pieces each side still has, with what it has lost greyed out beside them. */
  setArmies(state, counts) {
    this.armies.replaceChildren();
    for (const sideId of ['red', 'blue']) {
      const side = SIDES[sideId];
      const card = el('div', 'np-army');
      card.style.setProperty('--side', side.color);

      const head = el('div', 'np-army-head');
      head.append(el('strong', null, side.name));
      head.append(el('span', 'np-army-count', `${counts[sideId].alive} left`));
      card.append(head);

      const row = el('div', 'np-army-pieces');
      for (const type of ['dragon', 'golem', 'farmer']) {
        const total = PIECES[type].count;
        const lost = state.captured[sideId].filter((entry) => entry === type).length;
        for (let i = 0; i < total; i += 1) {
          const chip = icon(type, sideId, 26);
          if (i >= total - lost) chip.classList.add('is-lost');
          chip.title = `${PIECES[type].name}${i >= total - lost ? ' (captured)' : ''}`;
          row.append(chip);
        }
      }
      card.append(row);
      this.armies.append(card);
    }
  }

  setLog(moves) {
    this.log.replaceChildren();
    for (const move of moves.slice(-8)) {
      const item = el('li', `np-log-line np-log-line--${move.side}`, describeMove(move));
      this.log.append(item);
    }
    this.log.scrollTop = this.log.scrollHeight;
  }

  destroy() {
    this.root.remove();
  }
}
