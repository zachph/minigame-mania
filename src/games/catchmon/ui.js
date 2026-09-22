import { ROSTER, TEAM_SIZE } from './roster.js';
import { TYPES, abilityOf, effectiveness } from './types.js';
import { drawPortrait } from './art.js';

/**
 * The DOM half of Catchmon: the team-select screen and the battle command
 * panel. Both live in the layer the shell hands the game, and both hand every
 * decision back through callbacks so `game.js` keeps the state machine.
 */

const MAX_STAT = 160;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function portrait(character, size) {
  const canvas = el('canvas', 'cm-portrait');
  const scale = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = size * scale;
  canvas.height = size * scale;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  drawPortrait(ctx, character, size);
  return canvas;
}

function typeChip(character) {
  const chip = el('span', 'cm-chip', character.typeName);
  chip.style.background = character.color;
  return chip;
}

function statBar(label, value) {
  const row = el('div', 'cm-stat');
  row.append(el('span', 'cm-stat-label', label));
  const track = el('span', 'cm-stat-track');
  const fill = el('span', 'cm-stat-fill');
  fill.style.width = `${Math.min(100, (value / MAX_STAT) * 100)}%`;
  track.append(fill);
  row.append(track, el('span', 'cm-stat-value', String(value)));
  return row;
}

/* ------------------------------------------------------------ team select */

export class TeamSelect {
  constructor(container, { rivalTeam, onStart, onRandom }) {
    this.container = container;
    this.rivalTeam = rivalTeam;
    this.onStart = onStart;
    this.onRandom = onRandom;
    this.selected = [];
    this.filter = 'all';
    this.root = el('div', 'cm-select');
    container.append(this.root);
    this._build();
  }

  _build() {
    const header = el('div', 'cm-select-head');
    const title = el('div', 'cm-select-title');
    title.append(el('h2', null, 'Pick your team of three'));
    title.append(el('p', null, 'Every Catchmon is a final evolution. Counter the rival types you can see.'));
    header.append(title);

    const rival = el('div', 'cm-rival');
    rival.append(el('span', 'cm-rival-label', 'Rival team'));
    const rivalList = el('div', 'cm-rival-list');
    for (const character of this.rivalTeam) {
      const card = el('div', 'cm-rival-card');
      card.style.borderColor = character.color;
      card.append(portrait(character, 44));
      const meta = el('div', 'cm-rival-meta');
      meta.append(el('strong', null, character.name), typeChip(character));
      card.append(meta);
      rivalList.append(card);
    }
    rival.append(rivalList);
    header.append(rival);
    this.root.append(header);

    const filters = el('div', 'cm-filters');
    for (const option of [{ id: 'all', name: 'All types', color: '#8b93c7' }, ...TYPES]) {
      const button = el('button', 'cm-filter', option.name);
      button.type = 'button';
      button.dataset.type = option.id;
      button.style.setProperty('--chip', option.color);
      button.addEventListener('click', () => {
        this.filter = option.id;
        this._renderGrid();
        for (const other of filters.querySelectorAll('.cm-filter')) {
          other.classList.toggle('is-active', other.dataset.type === option.id);
        }
      });
      if (option.id === 'all') button.classList.add('is-active');
      filters.append(button);
    }
    this.root.append(filters);

    this.grid = el('div', 'cm-grid');
    this.root.append(this.grid);

    const footer = el('div', 'cm-select-foot');
    this.tray = el('div', 'cm-tray');
    footer.append(this.tray);

    const actions = el('div', 'cm-select-actions');
    const randomButton = el('button', 'btn', 'Surprise me');
    randomButton.type = 'button';
    randomButton.addEventListener('click', () => {
      this.selected = this.onRandom().slice(0, TEAM_SIZE);
      this._renderGrid();
      this._renderTray();
    });
    this.startButton = el('button', 'btn btn--primary', 'Battle!');
    this.startButton.type = 'button';
    this.startButton.disabled = true;
    this.startButton.addEventListener('click', () => {
      if (this.selected.length === TEAM_SIZE) this.onStart(this.selected);
    });
    actions.append(randomButton, this.startButton);
    footer.append(actions);
    this.root.append(footer);

    this._renderGrid();
    this._renderTray();
  }

  _toggle(character) {
    const index = this.selected.indexOf(character);
    if (index >= 0) this.selected.splice(index, 1);
    else if (this.selected.length < TEAM_SIZE) this.selected.push(character);
    else return;
    this._renderGrid();
    this._renderTray();
  }

  /** How this fighter fares against the three rivals, as a quick hint. */
  _matchupHint(character) {
    let good = 0;
    let bad = 0;
    for (const rival of this.rivalTeam) {
      if (effectiveness(character.type, rival.type) > 1) good += 1;
      if (effectiveness(rival.type, character.type) > 1) bad += 1;
    }
    if (good > bad) return { text: `Strong vs ${good}`, tone: 'good' };
    if (bad > good) return { text: `Weak vs ${bad}`, tone: 'bad' };
    return { text: 'Even matchup', tone: 'even' };
  }

  _renderGrid() {
    this.grid.replaceChildren();
    const list = this.filter === 'all' ? ROSTER : ROSTER.filter((c) => c.type === this.filter);
    for (const character of list) {
      const card = el('button', 'cm-card');
      card.type = 'button';
      card.style.setProperty('--type', character.color);
      if (this.selected.includes(character)) card.classList.add('is-picked');

      card.append(portrait(character, 74));
      const body = el('div', 'cm-card-body');
      const nameRow = el('div', 'cm-card-name');
      nameRow.append(el('strong', null, character.name), typeChip(character));
      body.append(nameRow);
      body.append(el('span', 'cm-card-role', `${character.roleName} - evolved from ${character.evolvesFrom}`));

      const stats = el('div', 'cm-stats');
      stats.append(
        statBar('HP', character.stats.hp),
        statBar('ATK', character.stats.atk),
        statBar('DEF', character.stats.def),
        statBar('SPD', character.stats.spd)
      );
      body.append(stats);

      const ability = abilityOf(character.type);
      if (ability) {
        const row = el('div', 'cm-ability');
        row.append(el('strong', null, ability.name));
        row.append(el('span', null, ability.blurb));
        body.append(row);
      }

      const hint = this._matchupHint(character);
      body.append(el('span', `cm-hint cm-hint--${hint.tone}`, hint.text));
      card.append(body);

      card.title = ability
        ? `${character.blurb}\n${ability.name}: ${ability.blurb}`
        : `${character.blurb}\nMoves: ${character.moves.length}`;
      card.addEventListener('click', () => this._toggle(character));
      this.grid.append(card);
    }
  }

  _renderTray() {
    this.tray.replaceChildren();
    for (let slot = 0; slot < TEAM_SIZE; slot += 1) {
      const character = this.selected[slot];
      const cell = el('div', 'cm-tray-cell');
      if (character) {
        cell.classList.add('is-filled');
        cell.style.borderColor = character.color;
        cell.append(portrait(character, 40));
        cell.append(el('span', null, character.name));
        cell.addEventListener('click', () => this._toggle(character));
      } else {
        cell.append(el('span', 'cm-tray-empty', `Slot ${slot + 1}`));
      }
      this.tray.append(cell);
    }
    this.startButton.disabled = this.selected.length !== TEAM_SIZE;
  }

  destroy() {
    this.root.remove();
  }
}

/* ----------------------------------------------------------- battle panel */

export class BattlePanel {
  constructor(container, { onMove, onSwitch, onSkip }) {
    this.onMove = onMove;
    this.onSwitch = onSwitch;
    this.onSkip = onSkip;
    this.root = el('div', 'cm-battle');

    this.log = el('div', 'cm-log');
    this.commands = el('div', 'cm-commands');
    this.root.append(this.log, this.commands);
    container.append(this.root);

    this._onLogClick = () => this.onSkip?.();
    this.log.addEventListener('click', this._onLogClick);
  }

  setLog(lines) {
    this.log.replaceChildren();
    for (const line of lines) this.log.append(el('p', 'cm-log-line', line));
    this.log.scrollTop = this.log.scrollHeight;
  }

  setBusy(text) {
    this.commands.replaceChildren();
    this.commands.classList.add('is-busy');
    this.commands.append(el('p', 'cm-busy', text));
  }

  /** The four move buttons plus the switch button. */
  showCommands(battle) {
    this.commands.replaceChildren();
    this.commands.classList.remove('is-busy');
    const grid = el('div', 'cm-moves');
    const foe = battle.activeOf('enemy');

    for (const option of battle.moveOptions('player')) {
      const { move, ready, cooldown, usesLeft, limited } = option;
      const button = el('button', 'cm-move');
      button.type = 'button';
      button.disabled = !ready;
      button.style.setProperty('--type', move.type ? `var(--type-${move.type})` : '#8b93c7');

      const head = el('div', 'cm-move-head');
      head.append(el('strong', null, move.name));
      head.append(el('span', 'cm-move-power', move.power > 0 ? `PWR ${move.power}` : 'SUPPORT'));
      button.append(head);

      const meta = el('div', 'cm-move-meta');
      if (move.type && move.power > 0) {
        const multiplier = effectiveness(move.type, foe.character.type);
        if (multiplier > 1) meta.append(el('span', 'cm-tag cm-tag--good', 'Super effective'));
        else if (multiplier < 1) meta.append(el('span', 'cm-tag cm-tag--bad', 'Resisted'));
      }
      if (cooldown > 0) meta.append(el('span', 'cm-tag', `Ready in ${cooldown}`));
      else if (limited) meta.append(el('span', 'cm-tag', `${usesLeft} left`));
      if (move.priority > 0) meta.append(el('span', 'cm-tag', 'Priority'));
      button.append(meta);

      button.title = move.description;
      button.addEventListener('click', () => this.onMove(move.id));
      grid.append(button);
    }
    this.commands.append(grid);

    const side = el('div', 'cm-side-actions');
    const switchButton = el('button', 'btn', 'Switch');
    switchButton.type = 'button';
    switchButton.disabled = !battle.canSwitch('player');
    if (switchButton.disabled) switchButton.title = 'Rooted, or nobody left on the bench.';
    switchButton.addEventListener('click', () => this.showBench(battle, { forced: false }));
    side.append(switchButton);
    this.commands.append(side);
  }

  /** Bench list, used both for a voluntary switch and after a knockout. */
  showBench(battle, { forced }) {
    this.commands.replaceChildren();
    this.commands.classList.remove('is-busy');
    const list = el('div', 'cm-bench');
    list.append(el('p', 'cm-bench-title', forced ? 'Choose who steps up.' : 'Switch to:'));

    for (const [index, fighter] of battle.teams.player.entries()) {
      if (index === battle.active.player || fighter.fainted) continue;
      const button = el('button', 'cm-bench-card');
      button.type = 'button';
      button.style.setProperty('--type', fighter.character.color);
      button.append(portrait(fighter.character, 44));
      const meta = el('div', 'cm-bench-meta');
      meta.append(el('strong', null, fighter.character.name));
      meta.append(el('span', null, `${fighter.character.typeName} - ${fighter.hp}/${fighter.maxHp} HP`));
      button.append(meta);
      button.addEventListener('click', () => this.onSwitch(index));
      list.append(button);
    }

    if (!forced) {
      const cancel = el('button', 'btn btn--ghost', 'Back');
      cancel.type = 'button';
      cancel.addEventListener('click', () => this.showCommands(battle));
      list.append(cancel);
    }
    this.commands.append(list);
  }

  destroy() {
    this.log.removeEventListener('click', this._onLogClick);
    this.root.remove();
  }
}
