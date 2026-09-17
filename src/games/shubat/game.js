import { clamp } from '../../core/utils.js';
import { FACTIONS, otherFaction } from './cards.js';
import {
  LANES,
  boardOf,
  canAttack,
  createMatch,
  endTurn,
  legalPlays,
  opponentOf,
  playCard,
} from './rules.js';
import { DIFFICULTIES, takeTurn } from './ai.js';
import { SetupPanel } from './ui.js';
import {
  drawBanner,
  drawEndTurn,
  drawEnergy,
  drawFighter,
  drawHandCard,
  drawLanes,
  drawMessage,
  drawPopups,
  drawRivalHand,
  drawSideBar,
  drawTable,
  drawTraps,
  handCardAt,
  handPositions,
  inEndTurn,
  laneAt,
  laneRect,
} from './render.js';

export const GAME_ID = 'shubat';

const RIVAL_DELAY = 0.9;

class ShubatGame {
  constructor(context) {
    this.context = context;
    this.time = 0;
    this.phase = 'setup';
    this.state = null;
    this.faction = 'iron';
    this.difficulty = 'normal';

    this.selected = -1;
    this.popups = [];
    this.flashes = new Map();
    this.message = { text: '', tone: 'plain' };
    this.banner = { text: '', subtext: '', life: 0 };
    this.timer = 0;
    this.finished = false;
    this.hover = { lane: null, endTurn: false };

    this.setup = new SetupPanel(context.ui, { onStart: (options) => this._start(options) });
  }

  _start({ faction, difficulty }) {
    this.setup.destroy();
    this.setup = null;
    this.faction = faction;
    this.difficulty = difficulty;
    const level = DIFFICULTIES[difficulty];

    this.phase = 'play';
    this.state = createMatch({
      playerFaction: faction,
      recipes: { you: 'core', rival: level.recipe },
      handicaps: { you: 0, rival: level.handicap },
      first: Math.random() < 0.5 ? 'you' : 'rival',
    });
    this.banner = {
      text: FACTIONS[faction].name,
      subtext: `${FACTIONS[otherFaction(faction)].name} opposite - ${level.deckName}${this.state.turn === 'you' ? ' - you open' : ' - the rival opens'}`,
      life: 2.4,
    };
    this._setMessage();
    if (this.state.turn === 'rival') this.timer = RIVAL_DELAY;
  }

  /* ---------------------------------------------------------------- input */

  get yourTurn() {
    return this.state && !this.state.over && this.state.turn === 'you' && this.timer <= 0;
  }

  _setMessage() {
    if (!this.state || this.state.over) return;
    if (this.state.turn !== 'you') {
      this.message = { text: 'The rival is thinking...', tone: 'plain' };
      return;
    }
    const card = this.state.players.you.hand[this.selected];
    if (card && card.kind === 'fighter') this.message = { text: `Pick a lane for ${card.name}.`, tone: 'plain' };
    else if (card && card.target !== 'none') this.message = { text: `Pick a target for ${card.name}.`, tone: 'plain' };
    else this.message = { text: 'Play cards, then attack.', tone: 'plain' };
  }

  /** Every lane a click could legally send the selected card to. */
  _targets() {
    if (this.selected < 0 || !this.yourTurn) return [];
    return legalPlays(this.state, 'you')
      .filter((play) => play.index === this.selected && play.lane != null)
      .map((play) => ({ side: play.targetSide === 'rival' ? 'rival' : play.card.kind === 'fighter' ? 'you' : play.targetSide || 'you', lane: play.lane }));
  }

  _play(play) {
    const before = this._snapshot();
    this.state = playCard(this.state, 'you', play);
    this._reactTo(before);
    this.selected = -1;
    this._setMessage();
  }

  _endTurn() {
    const before = this._snapshot();
    this.state = endTurn(this.state, 'you');
    this._reactTo(before);
    this.selected = -1;
    if (!this.state.over) {
      this.timer = RIVAL_DELAY;
      this._setMessage();
    }
  }

  _snapshot() {
    const cores = {};
    const fighters = new Map();
    for (const side of ['you', 'rival']) {
      cores[side] = this.state.players[side].core;
      boardOf(this.state, side).forEach((fighter, lane) => {
        if (fighter) fighters.set(`${side}-${lane}`, fighter.hp);
      });
    }
    return { cores, fighters, log: this.state.log.length };
  }

  /** Turns whatever just happened into damage numbers and a status line. */
  _reactTo(before) {
    for (const side of ['you', 'rival']) {
      const delta = before.cores[side] - this.state.players[side].core;
      if (delta > 0) {
        this._popup(140, side === 'rival' ? 46 : 346, `-${delta}`, '#ff8b8b', 26);
      }
      boardOf(this.state, side).forEach((fighter, lane) => {
        if (!fighter) return;
        const was = before.fighters.get(`${side}-${lane}`);
        if (was == null || was === fighter.hp) return;
        const rect = laneRect(side, lane);
        const change = was - fighter.hp;
        this._popup(rect.x + rect.w / 2, rect.y + 40, change > 0 ? `-${change}` : `+${-change}`,
          change > 0 ? '#ff8b8b' : '#8ef0b4', 20);
        if (change > 0) this.flashes.set(`${side}-${lane}`, 1);
      });
    }
    const fresh = this.state.log.slice(before.log);
    if (fresh.length > 0) this.message = { text: fresh[fresh.length - 1], tone: 'plain' };
  }

  _popup(x, y, text, color, size) {
    this.popups.push({ x, y, text, color, size, life: 1, maxLife: 1 });
  }

  update(dt, input) {
    this.time += dt;
    if (this.banner.life > 0) this.banner.life -= dt;
    for (const popup of this.popups) {
      popup.life -= dt;
      popup.y -= dt * 26;
    }
    this.popups = this.popups.filter((popup) => popup.life > 0);
    for (const [key, value] of this.flashes) {
      const next = value - dt * 2.6;
      if (next <= 0) this.flashes.delete(key);
      else this.flashes.set(key, next);
    }

    if (this.phase !== 'play') return;

    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0 && !this.state.over && this.state.turn === 'rival') {
        const before = this._snapshot();
        this.state = takeTurn(this.state, 'rival', this.difficulty);
        this._reactTo(before);
        if (!this.state.over) this._setMessage();
      }
      return;
    }

    if (this.state.over) {
      this._finish();
      return;
    }
    if (this.state.turn !== 'you') return;

    this.hover.lane = laneAt(input.x, input.y);
    this.hover.endTurn = inEndTurn(input.x, input.y);

    const hand = this.state.players.you.hand;
    const positions = handPositions(hand.length);
    if (input.wasKeyPressed('ArrowLeft', 'KeyA')) this.selected = Math.max(0, this.selected - 1);
    if (input.wasKeyPressed('ArrowRight', 'KeyD')) this.selected = Math.min(hand.length - 1, this.selected + 1);
    if (input.wasKeyPressed('Enter')) this._endTurn();

    if (!input.justPressed) return;

    if (inEndTurn(input.x, input.y)) {
      this._endTurn();
      return;
    }

    const clicked = handCardAt(input.x, input.y, positions);
    if (clicked >= 0) {
      const plays = legalPlays(this.state, 'you').filter((play) => play.index === clicked);
      if (plays.length === 0) {
        const card = hand[clicked];
        this.message = { text: `${card.name} costs ${card.cost} - you have ${this.state.players.you.energy}.`, tone: 'bad' };
        return;
      }
      const needsTarget = plays.some((play) => play.lane != null);
      if (!needsTarget) this._play(plays[0]);
      else {
        this.selected = clicked;
        this._setMessage();
      }
      return;
    }

    const spot = laneAt(input.x, input.y);
    if (spot && this.selected >= 0) {
      const play = legalPlays(this.state, 'you').find(
        (option) => option.index === this.selected && option.lane === spot.lane &&
          (option.card.kind === 'fighter' ? spot.side === 'you' : (option.targetSide || 'you') === spot.side)
      );
      if (play) this._play(play);
      else this.message = { text: 'Not a legal target for that card.', tone: 'bad' };
      return;
    }
    this.selected = -1;
    this._setMessage();
  }

  /* -------------------------------------------------------------- drawing */

  render(ctx) {
    drawTable(ctx, this.time);
    if (this.phase === 'setup') return;
    const state = this.state;

    drawLanes(ctx, state, this._targets());
    for (const side of ['rival', 'you']) {
      boardOf(state, side).forEach((fighter, lane) => {
        if (!fighter) return;
        drawFighter(ctx, fighter, side, lane, {
          flash: this.flashes.get(`${side}-${lane}`) || 0,
          ready: canAttack(state, side, fighter),
        });
      });
      drawTraps(ctx, state.players[side].traps.length, side);
      drawSideBar(ctx, state, side, state.players[side], state.players[side].faction);
    }

    drawRivalHand(ctx, state.players.rival.hand.length);
    drawEnergy(ctx, state.players.you);
    drawEndTurn(ctx, this.yourTurn, this.hover.endTurn);

    const hand = state.players.you.hand;
    const positions = handPositions(hand.length);
    const playable = new Set(legalPlays(state, 'you').map((play) => play.index));
    hand.forEach((card, index) => {
      drawHandCard(ctx, card, positions[index].x, positions[index].y, {
        selected: index === this.selected,
        playable: playable.has(index),
      });
    });

    drawMessage(ctx, this.message.text, this.message.tone);
    drawPopups(ctx, this.popups);
    drawBanner(ctx, this.banner.text, this.banner.subtext, clamp(this.banner.life, 0, 1));
  }

  /* --------------------------------------------------------------- result */

  _finish() {
    if (this.finished) return;
    this.finished = true;
    const state = this.state;
    const won = state.winner === 'you';
    const you = state.players.you;
    const rival = state.players.rival;

    this.banner = {
      text: won ? 'Core secured' : state.winner ? 'Your core is down' : 'Stalemate',
      subtext: state.reason || '',
      life: 3,
    };

    this.context.finish({
      score: won ? Math.round(900 + you.core * 0.6 + Math.max(0, (25 - state.turnNumber) * 25)) : Math.round((rival.maxCore - rival.core) * 0.3),
      title: won ? 'You win the duel' : state.winner ? 'Beaten' : 'Stalemate',
      detailTitle: `${FACTIONS[you.faction].name} vs ${FACTIONS[rival.faction].name} - ${state.turnNumber} turns, ${state.reason}`,
      collected: [
        { name: 'Your core', color: FACTIONS[you.faction].color, count: you.core, label: `${you.core} / ${you.maxCore}` },
        { name: 'Rival core', color: FACTIONS[rival.faction].color, count: rival.core, label: `${rival.core} / ${rival.maxCore}` },
        { name: 'Fighters lost', color: '#ff9d94', count: you.fallen.length, label: `${you.fallen.length} of yours, ${rival.fallen.length} of theirs` },
      ],
    });
  }

  destroy() {
    this.setup?.destroy();
  }
}

export function createShubat(context) {
  return new ShubatGame(context);
}

export { ShubatGame, LANES, opponentOf };
