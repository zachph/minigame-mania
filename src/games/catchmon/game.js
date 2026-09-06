import { clamp } from '../../core/utils.js';
import { addToCollection, getCollection } from '../../core/storage.js';
import { Battle } from './battle.js';
import { chooseAction, chooseReplacement, draftTeam, randomTeam } from './ai.js';
import { getMove } from './moves.js';
import { TYPE_BY_ID } from './types.js';
import { TEAM_SIZE } from './roster.js';
import { BattlePanel, TeamSelect } from './ui.js';
import {
  SLOTS,
  drawArena,
  drawBanner,
  drawFighter,
  drawPanels,
  drawParticles,
  drawPopups,
  drawTurnBadge,
} from './scene.js';

export const GAME_ID = 'catchmon';

/** How long each kind of event is held on screen before the next one plays. */
const EVENT_DELAY = {
  move: 0.55,
  damage: 0.45,
  heal: 0.6,
  status: 0.7,
  stat: 0.7,
  miss: 0.7,
  blocked: 0.7,
  text: 0.55,
  switch: 0.7,
  faint: 0.9,
  end: 1.1,
};

const LOG_LINES = 3;

function newDisplay() {
  return {
    hpShown: 0,
    hpTarget: 0,
    flash: 0,
    shake: 0,
    lunge: 0,
    hop: 0,
    alpha: 1,
    entering: 0,
  };
}

class CatchmonGame {
  constructor(context) {
    this.context = context;
    this.time = 0;
    this.phase = 'select';
    this.rivalTeam = draftTeam();
    this.battle = null;
    this.panel = null;
    this.display = { player: newDisplay(), enemy: newDisplay() };
    this.popups = [];
    this.particles = [];
    this.queue = [];
    this.eventTimer = 0;
    this.logLines = [];
    this.banner = { text: '', life: 0 };
    this.finished = false;

    this.select = new TeamSelect(context.ui, {
      rivalTeam: this.rivalTeam,
      onStart: (team) => this._startBattle(team),
      onRandom: () => randomTeam(),
    });
  }

  /* -------------------------------------------------------------- battle */

  _startBattle(playerTeam) {
    this.select.destroy();
    this.select = null;
    this.phase = 'battle';
    this.battle = new Battle({ playerTeam, enemyTeam: this.rivalTeam });

    for (const side of ['player', 'enemy']) {
      const fighter = this.battle.activeOf(side);
      this.display[side] = { ...newDisplay(), hpShown: fighter.hp, hpTarget: fighter.hp, entering: 1 };
    }

    this.panel = new BattlePanel(this.context.ui, {
      onMove: (moveId) => this._commit({ kind: 'move', moveId }),
      onSwitch: (index) => this._chooseSwitch(index),
      onSkip: () => this._skipPlayback(),
    });

    this._log(`The rival sends out ${this.battle.activeOf('enemy').character.name}!`);
    this._log(`Go, ${this.battle.activeOf('player').character.name}!`);
    this._showCommands();
  }

  _showCommands() {
    if (this.finished) return;
    if (this.battle.pendingSwitch.player) {
      this.panel.showBench(this.battle, { forced: true });
      return;
    }
    this.panel.showCommands(this.battle);
  }

  /** A player action: pair it with the rival's and resolve the turn. */
  _commit(action) {
    if (this.queue.length || this.finished) return;
    this.battle.setAction('player', action);
    this.battle.setAction('enemy', chooseAction(this.battle, 'enemy'));
    this.panel.setBusy('...');
    this._enqueue(this.battle.resolveTurn());
  }

  _chooseSwitch(index) {
    if (this.finished) return;
    if (this.battle.pendingSwitch.player) {
      this.panel.setBusy('...');
      this._enqueue([this.battle.applyForcedSwitch('player', index)]);
      return;
    }
    this._commit({ kind: 'switch', index });
  }

  _enqueue(events) {
    this.queue.push(...events);
    if (this.eventTimer <= 0) this.eventTimer = 0.05;
  }

  /** Called once the queue drains: forced switches, then hand control back. */
  _afterPlayback() {
    if (this.finished) return;
    if (this.battle.over) {
      this._reportResult();
      return;
    }
    if (this.battle.pendingSwitch.enemy) {
      const index = chooseReplacement(this.battle, 'enemy');
      this._enqueue([this.battle.applyForcedSwitch('enemy', index)]);
      return;
    }
    this._showCommands();
  }

  /* ---------------------------------------------------------- playback */

  _playEvent(event, instant = false) {
    if (event.text) this._log(event.text);
    const side = event.side;
    const display = side ? this.display[side] : null;

    switch (event.kind) {
      case 'move': {
        const move = getMove(event.moveId);
        const attacker = this.display[side];
        attacker.lunge = 1;
        this._spawnBurst(side === 'player' ? 'enemy' : 'player', move.type);
        break;
      }
      case 'damage': {
        display.hpTarget = event.hpAfter;
        display.flash = 1;
        display.shake = 1;
        this._popup(side, `-${event.amount}`, event.crit ? '#ffd166' : '#ff8080', event.crit ? 34 : 28);
        break;
      }
      case 'heal': {
        display.hpTarget = event.hpAfter;
        if (event.amount > 0) this._popup(side, `+${event.amount}`, '#7bf0a8', 28);
        break;
      }
      case 'status':
      case 'stat': {
        if (display) display.hop = 8;
        break;
      }
      case 'faint': {
        display.alpha = 0.001;
        display.hpTarget = 0;
        break;
      }
      case 'switch': {
        const fighter = this.battle.teams[side][event.slot ?? this.battle.active[side]];
        this.display[side] = { ...newDisplay(), hpShown: fighter.hp, hpTarget: fighter.hp, entering: 1 };
        break;
      }
      case 'end': {
        this.banner = { text: event.side === 'player' ? 'Victory!' : 'Defeat', life: 2.4 };
        break;
      }
      default:
        break;
    }
    if (instant) this._snapDisplays();
  }

  _skipPlayback() {
    while (this.queue.length) this._playEvent(this.queue.shift(), true);
    this.eventTimer = 0;
    this._afterPlayback();
  }

  _snapDisplays() {
    for (const side of ['player', 'enemy']) {
      const display = this.display[side];
      display.hpShown = display.hpTarget;
      display.flash = 0;
      display.shake = 0;
      display.lunge = 0;
    }
    this.popups.length = 0;
  }

  _log(text) {
    this.logLines.push(text);
    if (this.logLines.length > 40) this.logLines.shift();
    this.panel?.setLog(this.logLines.slice(-LOG_LINES));
  }

  _popup(side, text, color, size) {
    const slot = SLOTS[side];
    this.popups.push({
      x: slot.x + (Math.random() - 0.5) * 30,
      y: slot.y - 120,
      text,
      color,
      size,
      life: 0.9,
      maxLife: 0.9,
    });
  }

  _spawnBurst(targetSide, typeId) {
    const slot = SLOTS[targetSide];
    const color = typeId ? TYPE_BY_ID.get(typeId).color : '#ffffff';
    for (let i = 0; i < 16; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 150;
      this.particles.push({
        x: slot.x,
        y: slot.y - 70,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
        size: 3 + Math.random() * 4,
        color,
      });
    }
  }

  /* ---------------------------------------------------------------- loop */

  update(dt, input) {
    this.time += dt;
    this._updateEffects(dt);

    if (this.phase !== 'battle') return;

    if (this.queue.length > 0) {
      if (input.justPressed || input.wasKeyPressed('Space', 'Enter')) {
        this._skipPlayback();
      } else {
        this.eventTimer -= dt;
        if (this.eventTimer <= 0) {
          const event = this.queue.shift();
          this._playEvent(event);
          this.eventTimer = EVENT_DELAY[event.kind] ?? 0.5;
          if (this.queue.length === 0) this.eventTimer = Math.max(this.eventTimer, 0.35);
        }
      }
    } else if (this.eventTimer > 0) {
      this.eventTimer -= dt;
      if (this.eventTimer <= 0) this._afterPlayback();
    }
  }

  _updateEffects(dt) {
    for (const side of ['player', 'enemy']) {
      const display = this.display[side];
      const speed = Math.max(40, Math.abs(display.hpTarget - display.hpShown) * 4);
      if (display.hpShown < display.hpTarget) display.hpShown = Math.min(display.hpTarget, display.hpShown + speed * dt);
      else if (display.hpShown > display.hpTarget) display.hpShown = Math.max(display.hpTarget, display.hpShown - speed * dt);
      display.flash = Math.max(0, display.flash - dt * 3.5);
      display.shake = Math.max(0, display.shake - dt * 3.5);
      display.lunge = Math.max(0, display.lunge - dt * 3.2);
      display.hop = Math.max(0, display.hop - dt * 24);
      display.entering = Math.max(0, display.entering - dt * 2.6);
      display.alpha = display.alpha < 1 && this.battle && !this.battle.teams[side][this.battle.active[side]].fainted
        ? Math.min(1, display.alpha + dt * 3)
        : display.alpha;
    }

    for (const popup of this.popups) {
      popup.life -= dt;
      popup.y -= dt * 34;
    }
    this.popups = this.popups.filter((popup) => popup.life > 0);

    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 260 * dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);

    if (this.banner.life > 0) this.banner.life -= dt;
  }

  render(ctx) {
    drawArena(ctx, this.time);
    if (this.phase === 'select') {
      this._renderSelectBackdrop(ctx);
      return;
    }

    drawFighter(ctx, 'enemy', this.battle.activeOf('enemy'), this.display.enemy, this.time);
    drawFighter(ctx, 'player', this.battle.activeOf('player'), this.display.player, this.time);
    drawParticles(ctx, this.particles);
    drawPanels(ctx, this.battle, this.display);
    drawTurnBadge(ctx, Math.min(this.battle.turn, this.battle.turnLimit), this.battle.turnLimit);
    drawPopups(ctx, this.popups);
    drawBanner(ctx, this.banner.text, clamp(this.banner.life, 0, 1));
  }

  _renderSelectBackdrop(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(10, 12, 28, 0.55)';
    ctx.fillRect(0, 0, this.context.width, this.context.height);
    ctx.restore();
  }

  /* -------------------------------------------------------------- result */

  _reportResult() {
    if (this.finished) return;
    this.finished = true;
    const battle = this.battle;
    const team = battle.teams.player;
    const won = battle.winner === 'player';
    const healthLeft = team.reduce((total, fighter) => total + fighter.hp / fighter.maxHp, 0);
    const kos = team.reduce((total, fighter) => total + fighter.kos, 0);
    const speedBonus = won ? Math.max(0, (20 - battle.turn) * 40) : 0;
    const score = won
      ? Math.round(1200 + healthLeft * 500 + speedBonus)
      : Math.round(kos * 250 + healthLeft * 150);

    const known = getCollection(GAME_ID);
    const discovered = new Set(
      addToCollection(GAME_ID, Object.fromEntries(team.map((fighter) => [fighter.character.id, 1])))
    );

    this.context.finish({
      score,
      title: won ? 'Victory!' : 'Defeated...',
      detailTitle: won
        ? `Won on turn ${battle.turn} with ${team.filter((f) => !f.fainted).length}/${TEAM_SIZE} standing`
        : `Your team managed ${kos} knockout${kos === 1 ? '' : 's'}`,
      collected: team.map((fighter) => ({
        name: fighter.character.name,
        color: fighter.character.color,
        count: fighter.kos,
        label: `${fighter.kos} KO${fighter.kos === 1 ? '' : 's'}`,
        isNew: discovered.has(fighter.character.id) || !known[fighter.character.id],
      })),
    });
  }

  destroy() {
    this.select?.destroy();
    this.panel?.destroy();
  }
}

export function createCatchmon(context) {
  return new CatchmonGame(context);
}

export { CatchmonGame };
