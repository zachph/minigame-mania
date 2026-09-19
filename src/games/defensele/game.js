import { clamp } from '../../core/utils.js';
import { GRID, START_LIVES, WAVE_COUNT, getTower } from './content.js';
import { build, canBuild, costOf, createRun, isRoad, sell, towerAt, update } from './rules.js';
import { BuildBar } from './ui.js';
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
} from './render.js';

export const GAME_ID = 'defensele';

const MAX_STEP = 1 / 20; // never simulate more than 50ms in one go

class DefenseleGame {
  constructor(context) {
    this.context = context;
    this.state = createRun();
    this.holding = null;      // a defender picked up from the bar
    this.selected = null;     // one already on the map
    this.hover = { col: -1, row: -1 };
    this.banner = { text: 'Defensele', subtext: 'They are already walking. Build.', life: 2.6 };
    this.finished = false;

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
    this.bar.refresh(this.state);
  }

  update(dt, input) {
    const step = Math.min(dt, MAX_STEP);
    if (this.banner.life > 0) this.banner.life -= dt;

    const goldBefore = this.state.gold;
    if (!this.state.over) update(this.state, step);

    this._handleInput(input);

    if (this.state.gold !== goldBefore || this.state.over) {
      this.bar.refresh(this.state, this.selected);
    }
    if (this.state.over) this._finish();
  }

  _handleInput(input) {
    const { col, row } = cellOf(input.x, input.y);
    this.hover = { col, row };
    if (!input.justPressed || this.state.over) return;
    if (row < 0 || row >= GRID.rows || col < 0 || col >= GRID.cols) return;

    const existing = towerAt(this.state, col, row);

    // Clicking something you already built always selects it, even while you
    // are holding another defender - otherwise the sell button is unreachable
    // until you put the new one down somewhere.
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
        // Keep holding it while you can still afford another.
        // The one you just put down made the next one dearer.
        if (this.state.gold < costOf(this.state, this.holding)) {
          this.holding = null;
          this.bar.clearPick();
        }
        this.bar.refresh(this.state, null);
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
    // The fire goes over the road and under everything walking on it.
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
      drawPlacement(
        ctx,
        this.holding,
        this.hover.col,
        this.hover.row,
        canBuild(this.state, this.holding, this.hover.col, this.hover.row)
      );
    }

    drawHud(ctx, this.state, width);
    drawBanner(ctx, width, this.banner.text, this.banner.subtext, clamp(this.banner.life, 0, 1));
  }

  _finish() {
    if (this.finished) return;
    this.finished = true;
    const state = this.state;
    const wavesHeld = state.won ? WAVE_COUNT : Math.max(0, state.waveIndex - 1);

    this.banner = {
      text: state.won ? 'The road is clear' : 'The base is overrun',
      subtext: state.won
        ? `${state.lives} of ${START_LIVES} lives left`
        : `You held ${wavesHeld} of ${WAVE_COUNT} waves`,
      life: 3,
    };

    this.context.finish({
      score: state.won
        ? Math.round(1500 + state.lives * 60 + state.gold * 0.2)
        : Math.round(wavesHeld * 90 + Math.max(0, state.lives) * 20),
      title: state.won ? 'Every wave turned back' : 'Overrun',
      detailTitle: `${wavesHeld} of ${WAVE_COUNT} waves - ${state.reason}`,
      collected: [
        { name: 'Lives left', color: '#8ef0a8', count: Math.max(0, state.lives), label: `${Math.max(0, state.lives)} / ${START_LIVES}` },
        { name: 'Killed', color: '#ffd166', count: state.stats.kills, label: `${state.stats.kills}` },
        { name: 'Walked past you', color: '#ff9d94', count: state.stats.leaked, label: `${state.stats.leaked}` },
        { name: 'Gold spent', color: '#c8a4ff', count: state.stats.spent, label: `${state.stats.spent}g` },
      ],
    });
  }

  destroy() {
    this.bar?.destroy();
  }
}

export function createDefensele(context) {
  return new DefenseleGame(context);
}

export { DefenseleGame, isRoad };
