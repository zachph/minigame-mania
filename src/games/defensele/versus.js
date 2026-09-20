import { clamp } from '../../core/utils.js';
import { seededRandom } from '../../core/utils.js';
import { GRID, SENDS, START_LIVES, WAVE_COUNT, getTower } from './content.js';
import { build, canBuild, costOf, createRun, sell, sendEnemy, towerAt, update } from './rules.js';
import { BuildBar, SendBar } from './ui.js';
import {
  cellOf,
  drawBanner,
  drawEnemy,
  drawGround,
  drawHud,
  drawPlacement,
  drawRoad,
  drawRoadFire,
  drawShots,
  drawTower,
  drawVersusHud,
} from './render.js';

/**
 * Defensele against a friend.
 *
 * You each defend your own road against the same waves - both sides seed their
 * randomness from the match, so nobody has to send a wave script over - and you
 * each spend gold to drop extra enemies onto the *other* road. The gold you
 * spend sending is gold not spent on towers, and anything they kill pays them
 * its bounty, so a send that bounces off has funded your opponent.
 *
 * Nothing about the simulation is shared. Each side runs its own board and the
 * only thing on the wire is "I sent you two Creepers".
 */

const MAX_STEP = 1 / 20;

class DefenseleVersus {
  constructor(context) {
    this.context = context;
    this.duel = context.duel;
    this.random = seededRandom(this.duel?.seed || 1);
    this.state = createRun({ random: this.random });
    this.holding = null;
    this.selected = null;
    this.hover = { col: -1, row: -1 };
    this.finished = false;
    this.opponent = this.duel?.opponent?.name || 'your friend';
    this.theirLives = START_LIVES;
    this.sent = 0;
    this.taken = 0;
    this.banner = { text: `Versus ${this.opponent}`, subtext: 'Same waves, two roads. Send them something.', life: 3 };
    this.incoming = [];   // things they sent, drawn as a warning strip

    this.bar = new BuildBar(context.ui, {
      onPick: (id) => {
        this.holding = id ? getTower(id) : null;
        this.selected = null;
      },
      onSell: (tower) => {
        sell(this.state, tower);
        this.selected = null;
        this.bar.refresh(this.state, null);
      },
    });
    this.sendBar = new SendBar(context.ui, { onSend: (send) => this._send(send) });
    this.bar.refresh(this.state);
    this.sendBar.refresh(this.state);

    // Their attacks, and how their road is going.
    this.offMatchEvent = context.onOpponentEvent?.((event) => this._receive(event)) || (() => {});
  }

  /** Spends the gold, tells them, and notes it for the ticker. */
  _send(send) {
    if (this.state.over || this.finished) return;
    if (this.state.gold < send.cost) return;
    this.state.gold -= send.cost;
    this.state.stats.spent += send.cost;
    this.sent += send.count;
    this.banner = { text: '', subtext: '', life: 0 };
    this.context.sendToOpponent?.({ kind: 'send', enemy: send.enemy, count: send.count });
    this.bar.refresh(this.state, this.selected);
    this.sendBar.refresh(this.state);
  }

  /** Something arrived from their side. */
  _receive(event) {
    if (!event || this.state.over) return;
    if (event.kind === 'send') {
      const send = SENDS.find((entry) => entry.enemy === event.enemy);
      if (!send) return;
      const count = Math.min(Number(event.count) || 1, send.count);
      for (let i = 0; i < count; i += 1) {
        // Spread them out a little rather than stacking on one pixel.
        this.state.queue.push({ enemy: send.enemy, at: this.state.time + i * 0.45 });
      }
      this.taken += count;
      this.incoming.push({ enemy: send.enemy, count, life: 3.5 });
    } else if (event.kind === 'lives') {
      this.theirLives = Number(event.lives);
    }
  }

  update(dt, input) {
    const step = Math.min(dt, MAX_STEP);
    if (this.banner.life > 0) this.banner.life -= dt;
    for (const note of this.incoming) note.life -= dt;
    this.incoming = this.incoming.filter((note) => note.life > 0);

    const goldBefore = this.state.gold;
    const livesBefore = this.state.lives;
    if (!this.state.over) update(this.state, step);

    this._handleInput(input);

    if (this.state.gold !== goldBefore || this.state.over) {
      this.bar.refresh(this.state, this.selected);
      this.sendBar.refresh(this.state);
    }
    // Let them watch your lives go down; it is half the fun.
    if (this.state.lives !== livesBefore) {
      this.context.sendToOpponent?.({ kind: 'lives', lives: Math.max(0, this.state.lives) });
    }
    if (this.state.over) this._finish();
  }

  _handleInput(input) {
    const { col, row } = cellOf(input.x, input.y);
    this.hover = { col, row };
    if (!input.justPressed || this.state.over) return;
    if (row < 0 || row >= GRID.rows || col < 0 || col >= GRID.cols) return;

    const existing = towerAt(this.state, col, row);
    if (existing) {
      this.holding = null;
      this.bar.clearPick();
      this.selected = existing;
      this.bar.refresh(this.state, this.selected);
      return;
    }
    if (this.holding) {
      if (canBuild(this.state, this.holding, col, row)) {
        build(this.state, this.holding.id, col, row);
        if (this.state.gold < costOf(this.state, this.holding)) {
          this.holding = null;
          this.bar.clearPick();
        }
        this.bar.refresh(this.state, null);
        this.sendBar.refresh(this.state);
      }
      return;
    }
    this.selected = null;
    this.bar.refresh(this.state, null);
  }

  render(ctx) {
    const { width, height } = this.context;
    drawGround(ctx, width, height, this.state.time);
    drawRoad(ctx);
    const burning = this.state.flameUntil - this.state.time;
    if (burning > 0) drawRoadFire(ctx, this.state.time, Math.min(1, burning / 0.6));

    for (const tower of this.state.towers) {
      drawTower(ctx, tower, {
        selected: this.selected && this.selected.uid === tower.uid,
        showRange: this.selected && this.selected.uid === tower.uid,
      }, this.state.time);
    }
    for (const enemy of this.state.enemies) drawEnemy(ctx, enemy, this.state.time);
    drawShots(ctx, this.state);

    if (this.holding && this.hover.row >= 0 && this.hover.row < GRID.rows && this.hover.col >= 0 && this.hover.col < GRID.cols) {
      drawPlacement(ctx, this.holding, this.hover.col, this.hover.row,
        canBuild(this.state, this.holding, this.hover.col, this.hover.row));
    }

    drawHud(ctx, this.state, width);
    drawVersusHud(ctx, width, {
      opponent: this.opponent,
      theirLives: this.theirLives,
      yourLives: Math.max(0, this.state.lives),
      incoming: this.incoming,
    });
    drawBanner(ctx, width, this.banner.text, this.banner.subtext, clamp(this.banner.life, 0, 1));
  }

  _finish() {
    if (this.finished) return;
    this.finished = true;
    const state = this.state;
    const wavesHeld = state.won ? WAVE_COUNT : Math.max(0, state.waveIndex - 1);
    const lives = Math.max(0, state.lives);

    this.banner = {
      text: state.won ? 'Your road held' : 'Your base is overrun',
      subtext: `Now we see how ${this.opponent} did`,
      life: 4,
    };

    this.context.finish({
      score: state.won
        ? Math.round(1500 + lives * 60 + state.gold * 0.2)
        : Math.round(wavesHeld * 90 + lives * 20),
      lives,
      survived: state.won,
      title: state.won ? 'Every wave turned back' : 'Overrun',
      detailTitle: `${wavesHeld} of ${WAVE_COUNT} waves held`,
      collected: [
        { name: 'Lives left', color: '#8ef0a8', count: lives, label: `${lives} / ${START_LIVES}` },
        { name: 'Killed', color: '#ffd166', count: state.stats.kills, label: `${state.stats.kills}` },
        { name: `Sent at ${this.opponent}`, color: '#ff9f6b', count: this.sent, label: `${this.sent}` },
        { name: 'They sent you', color: '#ff9d94', count: this.taken, label: `${this.taken}` },
      ],
    });
  }

  destroy() {
    this.offMatchEvent();
    this.bar?.destroy();
    this.sendBar?.destroy();
  }
}

export const createDefenseleVersus = (context) => new DefenseleVersus(context);
