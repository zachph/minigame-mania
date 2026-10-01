import { clamp } from '../../core/utils.js';
import { CHARACTERS, FIELD, LADDER, ROUND_LIMIT, getCharacter } from './content.js';
import { createMatch, healthShare, stepMatch } from './rules.js';
import { createBot } from './ai.js';
import { SelectPanel } from './select.js';
import {
  drawArena,
  drawBanner,
  drawFighter,
  drawHud,
  drawPopup,
  drawRing,
  drawSpark,
  drawTrail,
} from './art.js';

export const GAME_ID = 'bumpers';

/**
 * Bumpers on a screen: the select panel, the countdown, the round, and the
 * bookkeeping for a ladder run or a best-of-three on one keyboard.
 *
 * All the actual rules live in `rules.js`, which has never heard of a canvas.
 * This file only turns keys into a steering vector, draws what came back, and
 * decides what happens between rounds.
 */

const COUNTDOWN = 2.2;
const BETWEEN = 2.4;          // how long the verdict sits on screen
const TRAIL_POINTS = 14;
const HEAL_BETWEEN_RUNGS = 40;
const VERSUS_TARGET = 2;      // rounds needed to take a best-of-three

const KEYS = {
  a: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], ability: ['Space', 'ShiftLeft'] },
  b: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], ability: ['Enter', 'NumpadEnter', 'ShiftRight'] },
  solo: {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    ability: ['Space', 'ShiftLeft', 'Enter'],
  },
};

/** Turns held keys into a steering vector of length at most one. */
function readKeys(input, map) {
  const x = (input.isKeyDown(...map.right) ? 1 : 0) - (input.isKeyDown(...map.left) ? 1 : 0);
  const y = (input.isKeyDown(...map.down) ? 1 : 0) - (input.isKeyDown(...map.up) ? 1 : 0);
  const length = Math.hypot(x, y);
  const ability = input.wasKeyPressed(...map.ability);
  if (length === 0) return { x: 0, y: 0, ability };
  return { x: x / length, y: y / length, ability };
}

class BumpersGame {
  constructor(context) {
    this.ctx = context;
    this.width = context.width;
    this.height = context.height;

    this.phase = 'select';   // select | countdown | fighting | between | over
    this.mode = 'ladder';
    this.match = null;
    this.bot = null;
    this.rung = 0;
    this.wins = { a: 0, b: 0 };
    this.carryHp = null;     // health carried into the next ladder rung
    this.timer = 0;
    this.verdict = null;

    this.trails = { a: [], b: [] };
    this.sparks = [];
    this.rings = [];
    this.popups = [];
    this.flash = { a: 0, b: 0 };
    this.shake = 0;
    this.clock = 0;

    this.panel = new SelectPanel(context.ui, {
      onStart: ({ mode, picks }) => this.begin(mode, picks),
    });
  }

  /* --------------------------------------------------------------- setup */

  begin(mode, picks) {
    this.mode = mode;
    this.picks = picks;
    this.rung = 0;
    this.wins = { a: 0, b: 0 };
    this.carryHp = null;
    this.panel.destroy();
    this.panel = null;
    this.startRound();
  }

  /** The opponent for the round about to start. */
  opponentFor() {
    if (this.mode === 'versus') return { character: this.picks.b, skill: null, title: 'Player 2' };
    const rung = LADDER[Math.min(this.rung, LADDER.length - 1)];
    return rung;
  }

  startRound() {
    const foe = this.opponentFor();
    this.match = createMatch(this.picks.a, foe.character, { limit: ROUND_LIMIT });
    // A ladder run is one long fight with breathers, not six fresh ones.
    if (this.mode === 'ladder' && this.carryHp != null) {
      this.match.a.hp = clamp(this.carryHp, 1, this.match.a.maxHp);
    }
    this.bot = this.mode === 'ladder' ? createBot('b', foe.skill) : null;
    this.trails = { a: [], b: [] };
    this.sparks = [];
    this.rings = [];
    this.popups = [];
    this.phase = 'countdown';
    this.timer = COUNTDOWN;
    this.verdict = null;
  }

  /* ---------------------------------------------------------- the update */

  update(dt, input) {
    this.clock += dt;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.decay(dt);

    if (this.phase === 'select') return;

    if (this.phase === 'countdown') {
      this.timer -= dt;
      if (this.timer <= 0) this.phase = 'fighting';
      return;
    }

    if (this.phase === 'between') {
      this.timer -= dt;
      if (this.timer <= 0) this.advance();
      return;
    }

    if (this.phase !== 'fighting') return;

    const commands = {
      a: readKeys(input, this.mode === 'versus' ? KEYS.a : KEYS.solo),
      b: this.bot ? this.bot.think(this.match, dt) : readKeys(input, KEYS.b),
    };
    stepMatch(this.match, dt, commands);
    this.absorbEvents();
    this.pushTrails();

    if (this.match.over) {
      this.verdict = this.match.over;
      this.phase = 'between';
      this.timer = BETWEEN;
      if (this.verdict.winner === 'a') this.wins.a += 1;
      else if (this.verdict.winner === 'b') this.wins.b += 1;
    }
  }

  /** Turns the round's events into things that fly about on screen. */
  absorbEvents() {
    for (const event of this.match.events) {
      if (event.kind === 'clash') {
        this.shake = Math.min(1, event.closing / 500);
        this.rings.push({ x: event.x, y: event.y, radius: 46, life: 0.4, maxLife: 0.4, colour: '#ffffff' });
        const count = Math.round(clamp(event.closing / 40, 3, 16));
        for (let i = 0; i < count; i += 1) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 60 + Math.random() * event.closing * 0.4;
          this.sparks.push({
            x: event.x, y: event.y,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            size: 3.4, life: 0.45, maxLife: 0.45, colour: '#ffe9b0',
          });
        }
        if (event.toA > 0) this.hurt('a', event.toA);
        if (event.toB > 0) this.hurt('b', event.toB);
      } else if (event.kind === 'shock') {
        const who = event.side === 'a' ? this.match.a : this.match.b;
        this.rings.push({ x: event.x, y: event.y, radius: event.radius, life: 0.45, maxLife: 0.45, colour: who.spec.colour });
      } else if (event.kind === 'wall') {
        for (let i = 0; i < 4; i += 1) {
          const angle = Math.random() * Math.PI * 2;
          this.sparks.push({
            x: event.x, y: event.y,
            vx: Math.cos(angle) * 70, vy: Math.sin(angle) * 70,
            size: 2.2, life: 0.3, maxLife: 0.3, colour: 'rgba(200, 220, 255, 0.9)',
          });
        }
      } else if (event.kind === 'ability') {
        const who = event.side === 'a' ? this.match.a : this.match.b;
        this.popups.push({
          x: who.x, y: who.y - who.radius - 6, text: event.name,
          colour: who.spec.colour, size: 13, life: 0.7, maxLife: 0.7,
        });
      }
    }
  }

  hurt(side, amount) {
    const who = side === 'a' ? this.match.a : this.match.b;
    this.flash[side] = 1;
    this.popups.push({
      x: who.x, y: who.y - who.radius - 10,
      text: `-${amount.toFixed(amount < 10 ? 1 : 0)}`,
      colour: '#ff9f8b', size: 17, life: 0.75, maxLife: 0.75,
    });
  }

  pushTrails() {
    for (const side of ['a', 'b']) {
      const who = this.match[side];
      const trail = this.trails[side];
      trail.push({ x: who.x, y: who.y });
      if (trail.length > TRAIL_POINTS) trail.shift();
    }
  }

  decay(dt) {
    for (const side of ['a', 'b']) this.flash[side] = Math.max(0, this.flash[side] - dt * 4);
    const keep = (item) => item.life > 0;
    for (const spark of this.sparks) {
      spark.life -= dt;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vx *= 0.92;
      spark.vy *= 0.92;
    }
    for (const ring of this.rings) ring.life -= dt;
    for (const popup of this.popups) popup.life -= dt;
    this.sparks = this.sparks.filter(keep);
    this.rings = this.rings.filter(keep);
    this.popups = this.popups.filter(keep);
  }

  /* ------------------------------------------------- what happens next */

  advance() {
    if (this.mode === 'versus') {
      if (this.wins.a >= VERSUS_TARGET || this.wins.b >= VERSUS_TARGET) return this.finishVersus();
      return this.startRound();
    }
    if (this.verdict.winner !== 'a') return this.finishLadder(false);
    this.rung += 1;
    if (this.rung >= LADDER.length) return this.finishLadder(true);
    this.carryHp = Math.min(this.match.a.maxHp, this.match.a.hp + HEAL_BETWEEN_RUNGS);
    this.startRound();
  }

  finishLadder(cleared) {
    const left = Math.max(0, Math.round(this.match.a.hp));
    const score = this.rung * 1000 + (cleared ? 500 : 0) + left * 5;
    this.ctx.finish({
      score,
      title: cleared ? 'You cleared the ladder' : `Beaten on rung ${this.rung + 1}`,
      detailTitle: 'How the run went',
      // The shell draws these as a dot, a name and a label.
      collected: LADDER.map((rung, i) => ({
        name: rung.title,
        color: i < this.rung ? '#8ef0a8' : i === this.rung ? '#ff8b6b' : 'rgba(255, 255, 255, 0.18)',
        label: i < this.rung ? 'beaten' : i === this.rung ? 'stopped you' : '-',
      })),
    });
    this.phase = 'over';
  }

  finishVersus() {
    const winner = this.wins.a > this.wins.b ? 'Player 1' : 'Player 2';
    this.ctx.finish({
      score: Math.max(this.wins.a, this.wins.b),
      title: `${winner} takes it ${this.wins.a}-${this.wins.b}`,
      detailTitle: 'Best of three',
    });
    this.phase = 'over';
  }

  /* --------------------------------------------------------- the drawing */

  render(ctx) {
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    if (this.shake > 0.02) {
      ctx.translate((Math.random() - 0.5) * this.shake * 7, (Math.random() - 0.5) * this.shake * 7);
    }
    drawArena(ctx, FIELD, this.clock);

    if (this.phase === 'select' || !this.match) {
      ctx.restore();
      return;
    }

    drawTrail(ctx, this.match.a, this.trails.a);
    drawTrail(ctx, this.match.b, this.trails.b);
    for (const ring of this.rings) drawRing(ctx, ring);
    drawFighter(ctx, this.match.a, { flash: this.flash.a, mine: true });
    drawFighter(ctx, this.match.b, { flash: this.flash.b, mine: this.mode === 'versus' });
    for (const spark of this.sparks) drawSpark(ctx, spark);
    for (const popup of this.popups) drawPopup(ctx, popup);
    ctx.restore();

    const left = this.mode === 'versus' ? `P1 - won ${this.wins.a}` : 'You';
    const right = this.mode === 'versus'
      ? `P2 - won ${this.wins.b}`
      : `Rung ${Math.min(this.rung + 1, LADDER.length)}/${LADDER.length}`;
    drawHud(ctx, this.match, {
      width: this.width,
      leftLabel: left,
      rightLabel: right,
      clock: this.phase === 'fighting' ? Math.max(0, this.match.limit - this.match.time) : null,
    });

    if (this.phase === 'countdown') {
      const n = Math.ceil(this.timer - 0.2);
      drawBanner(ctx, this.width, this.height, n > 0 ? String(n) : 'Go', this.opponentTitle());
    } else if (this.phase === 'between' && this.verdict) {
      drawBanner(ctx, this.width, this.height, this.verdictText(), this.verdict.reason);
    }
  }

  opponentTitle() {
    if (this.mode === 'versus') return `${getCharacter(this.picks.a).name} versus ${getCharacter(this.picks.b).name}`;
    return LADDER[Math.min(this.rung, LADDER.length - 1)].title;
  }

  verdictText() {
    const { winner } = this.verdict;
    if (winner === 'draw') return 'Draw';
    if (this.mode === 'versus') return winner === 'a' ? 'Player 1' : 'Player 2';
    return winner === 'a' ? 'Win' : 'Knocked out';
  }

  destroy() {
    this.panel?.destroy();
    this.panel = null;
  }
}

export const createBumpers = (context) => new BumpersGame(context);
export { CHARACTERS, healthShare };
