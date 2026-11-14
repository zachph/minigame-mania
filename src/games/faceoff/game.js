import { clamp, seededRandom } from '../../core/utils.js';
import {
  FIGHTERS,
  MODE_BY_ID,
  STORY,
  STORY_RECOVERY,
  TEAM_SIZE,
  TOWER,
  TOWER_RECOVERY,
} from './content.js';
import { createFight, frontOf, healthShare, pressureAt, stepFight } from './battle.js';
import { SelectPanel } from './select.js';
import {
  SPOT,
  drawBanner,
  drawBench,
  drawFighter,
  drawFrontPanel,
  drawLog,
  drawPopup,
  drawStage,
} from './art.js';

export const GAME_ID = 'faceoff';

/**
 * Faceoff on a screen.
 *
 * You do nothing once it starts, so the job here is to make what the fight is
 * doing legible: who is about to act, what just landed, and who is left. The
 * fight itself is `battle.js` and has never heard of a canvas.
 */

const COUNTDOWN = 1.6;
const AFTER = 2.6;          // how long the verdict sits before moving on
const SPEEDS = [1, 2, 4];   // watching speeds, cycled with a click

class FaceoffGame {
  constructor(context) {
    this.context = context;
    this.width = context.width;
    this.height = context.height;

    this.stage = 'select';   // select | countdown | fighting | between | over
    this.fight = null;
    this.mode = 'sandbox';
    this.team = [];
    this.step = 0;           // which floor or chapter
    this.carry = null;       // health carried between fights
    this.wins = 0;
    this.timer = 0;
    this.verdict = null;
    this.speed = 1;
    this.clock = 0;
    this.popups = [];
    this.flash = {};
    this.shake = 0;

    this.panel = new SelectPanel(context.ui, {
      onStart: ({ mode, team }) => this.begin(mode, team),
    });
  }

  /* --------------------------------------------------------------- setup */

  begin(mode, team) {
    this.mode = mode;
    this.team = team;
    this.step = 0;
    this.wins = 0;
    this.carry = null;
    this.panel.destroy();
    this.panel = null;
    this.startFight();
  }

  /** Who you are up against for this fight, and how much stronger they are. */
  opponent() {
    if (this.mode === 'tower') {
      const floor = TOWER[Math.min(this.step, TOWER.length - 1)];
      return { team: floor.team, scale: floor.scale, name: `Floor ${floor.floor} - ${floor.name}` };
    }
    if (this.mode === 'story') {
      const chapter = STORY[Math.min(this.step, STORY.length - 1)];
      return { team: chapter.team, scale: chapter.scale, name: chapter.name, before: chapter.before };
    }
    // Sandbox picks three at random, so it is worth running more than once.
    const ids = FIGHTERS.map((f) => f.id);
    const pick = () => ids[Math.floor(Math.random() * ids.length)];
    return { team: [pick(), pick(), pick()], scale: 1, name: 'Whoever turns up' };
  }

  startFight() {
    const foe = this.opponent();
    this.foe = foe;
    this.fight = createFight({
      a: this.team,
      b: foe.team,
      scaleB: foe.scale,
      random: seededRandom(Math.floor(Math.random() * 1e9)),
    });
    // Tower and story are one long run: your three carry their wounds forward.
    if (this.carry) {
      this.fight.sides.a.team.forEach((who, i) => {
        const left = this.carry[i];
        if (left != null) who.hp = clamp(left, 0, who.maxHp);
      });
      this.fight.sides.a.front = 0;
      while (
        this.fight.sides.a.front < TEAM_SIZE - 1 &&
        this.fight.sides.a.team[this.fight.sides.a.front].hp <= 0
      ) this.fight.sides.a.front += 1;
    }
    this.popups = [];
    this.flash = {};
    this.stage = 'countdown';
    this.timer = COUNTDOWN;
    this.verdict = null;
  }

  /* --------------------------------------------------------------- update */

  update(dt, input) {
    this.clock += dt;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.decay(dt);
    if (this.stage === 'select') return;

    // One click anywhere cycles how fast you are watching.
    if (input?.justPressed || input?.wasKeyPressed('Space')) {
      this.speed = SPEEDS[(SPEEDS.indexOf(this.speed) + 1) % SPEEDS.length];
    }

    if (this.stage === 'countdown') {
      this.timer -= dt;
      if (this.timer <= 0) this.stage = 'fighting';
      return;
    }
    if (this.stage === 'between') {
      this.timer -= dt;
      if (this.timer <= 0) this.advance();
      return;
    }
    if (this.stage !== 'fighting') return;

    stepFight(this.fight, dt * this.speed);
    this.absorb();

    if (this.fight.over) {
      this.verdict = this.fight.over;
      if (this.verdict.winner === 'a') this.wins += 1;
      this.stage = 'between';
      this.timer = AFTER;
    }
  }

  /** Turns the fight's events into things that move on screen. */
  absorb() {
    for (const event of this.fight.events) {
      if (event.kind === 'damage') {
        this.flash[event.uid] = 1;
        this.shake = Math.min(1, Math.max(this.shake, event.amount / 40));
        this.popups.push({
          ...this.spotOf(event.uid),
          text: `-${Math.round(event.amount)}`,
          colour: event.source === 'poison' ? '#b7e06a' : event.source === 'riposte' ? '#c8a4ff' : '#ff9f8b',
          size: event.amount > 25 ? 22 : 17,
          life: 0.8, maxLife: 0.8,
        });
      } else if (event.kind === 'heal') {
        this.popups.push({
          ...this.spotOf(event.uid),
          text: `+${Math.round(event.amount)}`,
          colour: '#8ef0a8', size: 17, life: 0.8, maxLife: 0.8,
        });
      } else if (event.kind === 'rally') {
        this.popups.push({ ...this.spotOf(event.uid), text: 'BACK UP', colour: '#ffd166', size: 20, life: 1.1, maxLife: 1.1 });
      } else if (event.kind === 'ability') {
        const spot = this.spotOf(event.uid);
        this.popups.push({ x: spot.x, y: spot.y - 34, text: event.name, colour: '#ffd166', size: 16, life: 1, maxLife: 1 });
      }
    }
  }

  /** Where on screen a fighter is, for a number to float off. */
  spotOf(uid) {
    for (const side of ['a', 'b']) {
      const front = frontOf(this.fight, side);
      if (front && front.uid === uid) return { x: SPOT[side].x, y: SPOT[side].y - 70 };
    }
    return { x: this.width / 2, y: 220 };
  }

  decay(dt) {
    for (const uid of Object.keys(this.flash)) {
      this.flash[uid] = Math.max(0, this.flash[uid] - dt * 4);
      if (this.flash[uid] === 0) delete this.flash[uid];
    }
    for (const popup of this.popups) popup.life -= dt;
    this.popups = this.popups.filter((popup) => popup.life > 0);
  }

  /* ---------------------------------------------------- what happens next */

  advance() {
    const won = this.verdict.winner === 'a';
    if (this.mode === 'sandbox') return this.finish(won);
    if (!won) return this.finish(false);

    this.step += 1;
    const runs = this.mode === 'tower' ? TOWER.length : STORY.length;
    if (this.step >= runs) return this.finish(true);

    // A breather between fights, never a full heal - the run is the point.
    const back = this.mode === 'tower' ? TOWER_RECOVERY : STORY_RECOVERY;
    this.carry = this.fight.sides.a.team.map((who) =>
      (who.hp <= 0 ? 0 : Math.min(who.maxHp, who.hp + (who.maxHp - who.hp) * back)));
    this.startFight();
  }

  finish(cleared) {
    const mine = this.fight.sides.a;
    const left = Math.round(healthShare(mine) * 100);
    const runs = this.mode === 'tower' ? TOWER.length : this.mode === 'story' ? STORY.length : 1;
    const score = this.mode === 'sandbox'
      ? (cleared ? 1000 + left * 10 : left * 5)
      : this.wins * 1000 + (cleared ? 750 : 0) + left * 8;

    this.context.finish({
      score,
      survived: cleared,
      title: this.titleFor(cleared),
      detailTitle: this.mode === 'sandbox'
        ? `${this.fight.time.toFixed(0)} seconds - ${this.verdict.reason}`
        : `${this.wins} of ${runs} - ${this.verdict.reason}`,
      collected: mine.team.map((who) => ({
        name: who.name,
        color: who.hp > 0 ? who.spec.colour : 'rgba(255, 255, 255, 0.2)',
        label: who.hp > 0 ? `${Math.ceil(who.hp)} left` : 'out',
      })),
    });
    this.stage = 'over';
  }

  titleFor(cleared) {
    if (this.mode === 'sandbox') return cleared ? 'Your three won' : 'Your three lost';
    if (cleared) return this.mode === 'tower' ? 'You reached the top' : 'Nothing left to argue with';
    return this.mode === 'tower' ? `Stopped on floor ${this.step + 1}` : `Stopped at ${STORY[Math.min(this.step, STORY.length - 1)].name}`;
  }

  /* -------------------------------------------------------------- drawing */

  render(ctx) {
    const pressure = this.fight ? pressureAt(this.fight.time) : 1;
    ctx.save();
    if (this.shake > 0.02) {
      ctx.translate((Math.random() - 0.5) * this.shake * 6, (Math.random() - 0.5) * this.shake * 6);
    }
    drawStage(ctx, this.width, this.height, this.clock, pressure);

    if (this.stage === 'select' || !this.fight) {
      ctx.restore();
      return;
    }

    for (const side of ['a', 'b']) {
      const lane = this.fight.sides[side];
      const who = frontOf(this.fight, side);
      if (!who) continue;
      const spot = SPOT[side];
      // A fighter with a full bar rises slightly: you can see a go coming.
      const bob = -Math.max(0, who.charge / 100 - 0.75) * 18;
      drawFighter(ctx, who, spot.x, spot.y, 52, {
        flash: this.flash[who.uid] || 0,
        facing: side === 'a' ? 1 : -1,
        bob,
      });
      drawBench(ctx, lane, side === 'a' ? 30 : this.width - 30, 112, side === 'a' ? 'left' : 'right');
    }

    // Once a side is wiped out it has no front fighter, and the fight keeps
    // being drawn through the verdict - so both of these can be nothing.
    const mine = frontOf(this.fight, 'a');
    const theirs = frontOf(this.fight, 'b');
    if (mine) drawFrontPanel(ctx, mine, 30, 406, 'left');
    if (theirs) drawFrontPanel(ctx, theirs, this.width - 30, 406, 'right');
    for (const popup of this.popups) drawPopup(ctx, popup);
    ctx.restore();

    this.drawHeader(ctx);
    drawLog(ctx, this.fight.log, 296, 470, 368, 52);

    if (this.stage === 'countdown') {
      drawBanner(ctx, this.width, this.height, 'Faceoff', this.foe.before || this.foe.name);
    } else if (this.stage === 'between' && this.verdict) {
      const won = this.verdict.winner === 'a';
      drawBanner(
        ctx, this.width, this.height,
        this.verdict.winner === 'draw' ? 'A draw' : won ? 'Your three win' : 'Your three are out',
        this.verdict.reason,
      );
    }
  }

  drawHeader(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '700 13px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(this.headline(), this.width / 2, 34);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.font = '700 11px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(
      this.stage === 'fighting' ? `${this.speed}x  -  click to speed it up` : '',
      this.width / 2, 54,
    );

    if (this.fight && pressureAt(this.fight.time) > 1.01) {
      ctx.fillStyle = '#ff8b6b';
      ctx.font = '700 12px "Trebuchet MS", system-ui, sans-serif';
      ctx.fillText('everything is hitting harder now', this.width / 2, 74);
    }
    ctx.restore();
  }

  headline() {
    const mode = MODE_BY_ID.get(this.mode);
    if (this.mode === 'tower') return `${mode.name}  -  floor ${this.step + 1} of ${TOWER.length}`;
    if (this.mode === 'story') return `${mode.name}  -  ${STORY[Math.min(this.step, STORY.length - 1)].name}`;
    return `${mode.name}  -  ${this.foe ? this.foe.name : ''}`;
  }

  destroy() {
    this.panel?.destroy();
    this.panel = null;
  }
}

export const createFaceoff = (context) => new FaceoffGame(context);
