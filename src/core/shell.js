import { Input } from './input.js';
import { listGames, getGame } from './registry.js';
import { getHighScore, submitHighScore } from './storage.js';

export const VIEWPORT = { width: 960, height: 540 };
const MAX_FRAME_TIME = 1 / 20; // never step more than 50ms at once

/**
 * Runs the app: menu, the requestAnimationFrame loop, pause/resume and the
 * results screen. Minigames stay ignorant of the DOM.
 *
 * A minigame instance returned from `create(context)` must implement:
 *   update(dt, input)  - advance by dt seconds
 *   render(ctx)        - draw into a 960x540 logical space
 *   destroy?()         - release anything it holds
 *
 * The context it receives carries `{ width, height, highScore, finish(result) }`.
 * `finish` ends the round with `{ score, title?, subtitle?, collected? }`.
 */
export class Shell {
  constructor() {
    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.input = new Input(this.canvas, VIEWPORT);

    this.el = {
      menuScreen: document.getElementById('screen-menu'),
      playScreen: document.getElementById('screen-play'),
      grid: document.getElementById('game-grid'),
      topbarRight: document.getElementById('topbar-right'),
      howto: document.getElementById('overlay-howto'),
      howtoTitle: document.getElementById('howto-title'),
      howtoTagline: document.getElementById('howto-tagline'),
      howtoList: document.getElementById('howto-list'),
      pause: document.getElementById('overlay-pause'),
      results: document.getElementById('overlay-results'),
      resultsTitle: document.getElementById('results-title'),
      resultsScore: document.getElementById('results-score'),
      resultsBest: document.getElementById('results-best'),
      resultsDetail: document.getElementById('results-detail'),
    };

    this.game = null;
    this.gameDef = null;
    this.state = 'menu'; // menu | howto | playing | paused | results
    this.rafId = 0;
    this.lastTime = 0;

    this._loop = this._loop.bind(this);
    this._bindUi();
    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
  }

  _bindUi() {
    document.getElementById('brand').addEventListener('click', () => this.showMenu());
    document.getElementById('btn-start').addEventListener('click', () => this.startRound());
    document.getElementById('btn-howto-back').addEventListener('click', () => this.showMenu());
    document.getElementById('btn-resume').addEventListener('click', () => this.resume());
    document.getElementById('btn-quit').addEventListener('click', () => this.showMenu());
    document.getElementById('btn-again').addEventListener('click', () => this.startRound());
    document.getElementById('btn-results-menu').addEventListener('click', () => this.showMenu());

    window.addEventListener('keydown', (event) => {
      if (event.code !== 'Escape') return;
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    });
  }

  /** Keeps the backing store dense enough for the display without changing logical coords. */
  _resizeCanvas() {
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(VIEWPORT.width * scale);
    const height = Math.round(VIEWPORT.height * scale);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (this.game) this._render();
  }

  buildMenu() {
    const games = listGames();
    this.el.grid.replaceChildren();
    for (const def of games) {
      const item = document.createElement('li');
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'game-card';

      const title = document.createElement('h3');
      title.textContent = def.name;
      const tagline = document.createElement('p');
      tagline.textContent = def.tagline || def.description || '';
      card.append(title, tagline);

      if (def.status === 'coming-soon') {
        card.classList.add('game-card--soon');
        card.disabled = true;
        const meta = document.createElement('span');
        meta.className = 'card-meta';
        meta.textContent = 'Coming soon';
        card.append(meta);
      } else {
        const best = getHighScore(def.id);
        if (best > 0) {
          const meta = document.createElement('span');
          meta.className = 'card-meta';
          meta.textContent = `Best: ${best.toLocaleString()}`;
          card.append(meta);
        }
        card.addEventListener('click', () => this.select(def.id));
      }

      item.append(card);
      this.el.grid.append(item);
    }
  }

  showMenu() {
    this._stopLoop();
    this._destroyGame();
    this.state = 'menu';
    this.gameDef = null;
    this._hideOverlays();
    this.el.playScreen.classList.remove('is-active');
    this.el.menuScreen.classList.add('is-active');
    this.el.topbarRight.replaceChildren();
    this.buildMenu();
  }

  select(gameId) {
    const def = getGame(gameId);
    if (!def) return;
    this.gameDef = def;
    this.state = 'howto';
    this.el.menuScreen.classList.remove('is-active');
    this.el.playScreen.classList.add('is-active');
    this._hideOverlays();

    this.el.howtoTitle.textContent = def.name;
    this.el.howtoTagline.textContent = def.description || def.tagline || '';
    this.el.howtoList.replaceChildren();
    for (const line of def.howTo || []) {
      const li = document.createElement('li');
      li.innerHTML = line; // authored in-repo, not user input
      this.el.howtoList.append(li);
    }
    this.el.howto.hidden = false;
    this._paintIdleBackdrop();
    this._renderTopbar();
  }

  startRound() {
    if (!this.gameDef) return;
    this._destroyGame();
    this._hideOverlays();
    this.input.reset();

    this.game = this.gameDef.create({
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      highScore: getHighScore(this.gameDef.id),
      finish: (result) => this.finish(result),
    });

    this.state = 'playing';
    this.lastTime = performance.now();
    this._renderTopbar();
    this._startLoop();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.reset();
    this._stopLoop();
    this.el.pause.hidden = false;
  }

  resume() {
    if (this.state !== 'paused') return;
    this.el.pause.hidden = true;
    this.state = 'playing';
    this.lastTime = performance.now();
    this._startLoop();
  }

  finish(result = {}) {
    this._stopLoop();
    this.state = 'results';
    const score = Math.round(result.score || 0);
    const isRecord = submitHighScore(this.gameDef.id, score);
    const best = getHighScore(this.gameDef.id);

    this.el.resultsTitle.textContent = result.title || "Time's up!";
    this.el.resultsScore.textContent = score.toLocaleString();
    this.el.resultsBest.textContent = isRecord
      ? 'New personal best!'
      : best > 0
        ? `Best: ${best.toLocaleString()}`
        : 'No record yet - this one is yours to beat.';
    this.el.resultsBest.classList.toggle('is-record', isRecord);

    this._renderCollected(result.collected, result.emptyText);
    this.el.results.hidden = false;
    this._renderTopbar();
  }

  _renderCollected(rows, emptyText) {
    const detail = this.el.resultsDetail;
    detail.replaceChildren();
    if (!rows || rows.length === 0) {
      if (emptyText) {
        const p = document.createElement('p');
        p.className = 'results-empty';
        p.textContent = emptyText;
        detail.append(p);
      }
      return;
    }
    for (const row of rows) {
      const line = document.createElement('div');
      line.className = 'dex-row';

      const dot = document.createElement('span');
      dot.className = 'dex-dot';
      dot.style.background = row.color || '#888';

      const name = document.createElement('span');
      name.className = 'dex-name';
      name.textContent = row.name;

      const count = document.createElement('span');
      count.className = 'dex-count';
      count.textContent = `x${row.count}`;

      line.append(dot, name, count);
      if (row.isNew) {
        const badge = document.createElement('span');
        badge.className = 'dex-new';
        badge.textContent = 'NEW';
        line.append(badge);
      }
      detail.append(line);
    }
  }

  _renderTopbar() {
    const right = this.el.topbarRight;
    right.replaceChildren();
    if (this.state === 'menu' || !this.gameDef) return;

    if (this.state === 'playing' || this.state === 'paused') {
      const pauseBtn = document.createElement('button');
      pauseBtn.type = 'button';
      pauseBtn.className = 'btn btn--ghost';
      pauseBtn.textContent = this.state === 'paused' ? 'Resume' : 'Pause';
      pauseBtn.addEventListener('click', () => (this.state === 'paused' ? this.resume() : this.pause()));
      right.append(pauseBtn);
    }

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'btn btn--ghost';
    menuBtn.textContent = 'Menu';
    menuBtn.addEventListener('click', () => this.showMenu());
    right.append(menuBtn);
  }

  _hideOverlays() {
    this.el.howto.hidden = true;
    this.el.pause.hidden = true;
    this.el.results.hidden = true;
  }

  _paintIdleBackdrop() {
    const { ctx } = this;
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, VIEWPORT.width, VIEWPORT.height);
  }

  _startLoop() {
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(this._loop);
  }

  _stopLoop() {
    if (!this.rafId) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  _loop(now) {
    this.rafId = requestAnimationFrame(this._loop);
    const dt = Math.min((now - this.lastTime) / 1000, MAX_FRAME_TIME);
    this.lastTime = now;
    if (this.state !== 'playing' || !this.game) return;
    this.game.update(dt, this.input);
    this.input.endFrame();
    this._render();
  }

  _render() {
    if (!this.game) return;
    this.ctx.save();
    this.game.render(this.ctx);
    this.ctx.restore();
  }

  _destroyGame() {
    this.game?.destroy?.();
    this.game = null;
  }
}
