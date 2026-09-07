import { clamp } from '../../core/utils.js';
import { SUIT_BY_ID, TOTAL_POINTS, cardName } from './cards.js';
import {
  DEALS_PER_MATCH,
  createDeal,
  describeTrick,
  legalPlays,
  mustFollowSuit,
  playCard,
  scoreOf,
  settleTrick,
} from './rules.js';
import { chooseCard } from './ai.js';
import { SetupPanel } from './ui.js';
import {
  CARD,
  LAYOUT,
  cardAt,
  drawBanner,
  drawCard,
  drawHud,
  drawMessage,
  drawStock,
  drawTable,
  handPositions,
} from './render.js';

export const GAME_ID = 'shubat';

const RIVAL_THINK = 0.65;   // pause before the rival plays, so a turn reads
const TRICK_HOLD = 1.15;    // how long both cards sit on the table
const DEAL_HOLD = 2.6;      // the pause between deals
const FLIGHT = 0.32;        // seconds a card takes to reach the table

class ShubatGame {
  constructor(context) {
    this.context = context;
    this.time = 0;
    this.phase = 'setup';
    this.difficulty = 'normal';

    this.state = null;
    this.dealNumber = 1;
    this.totals = { you: 0, rival: 0 };
    this.dealScores = [];

    this.selected = 0;
    this.flights = [];
    this.timer = 0;
    this.pending = null;      // what happens when the timer runs out
    this.message = { text: '', tone: 'plain' };
    this.banner = { text: '', subtext: '', life: 0 };
    this.finished = false;

    this.setup = new SetupPanel(context.ui, { onStart: ({ difficulty }) => this._start(difficulty) });
  }

  _start(difficulty) {
    this.setup.destroy();
    this.setup = null;
    this.difficulty = difficulty;
    this.phase = 'play';
    this._deal(1);
  }

  _deal(number) {
    this.dealNumber = number;
    // You lead the first deal, the rival leads the second.
    this.state = createDeal({ leader: number === 1 ? 'you' : 'rival' });
    this.selected = 0;
    this.flights = [];
    this.banner = {
      text: `Deal ${number}`,
      subtext: `${SUIT_BY_ID.get(this.state.trumpSuit).name} are trumps - ${
        this.state.leader === 'you' ? 'you lead' : 'the rival leads'
      }`,
      life: 2.2,
    };
    this._setMessage();
    if (this.state.turn === 'rival') this._scheduleRival();
  }

  /* --------------------------------------------------------------- flow */

  _setMessage() {
    const state = this.state;
    if (!state || state.over) return;
    if (state.turn === 'rival') {
      this.message = { text: 'The rival is choosing...', tone: 'plain' };
      return;
    }
    const following = state.table[state.leader] && state.leader !== 'you';
    if (following && mustFollowSuit(state)) {
      const led = SUIT_BY_ID.get(state.table[state.leader].suit).name;
      this.message = { text: `Stock is empty - follow ${led} if you can.`, tone: 'plain' };
    } else if (following) {
      this.message = { text: 'Beat it, trump it, or throw a low card away.', tone: 'plain' };
    } else {
      this.message = { text: 'Your lead.', tone: 'plain' };
    }
  }

  _scheduleRival() {
    this.timer = RIVAL_THINK;
    this.pending = 'rival';
  }

  _playCard(player, card) {
    const from = player === 'you'
      ? handPositions(this.state.hands.you.length)[this.state.hands.you.indexOf(card)]
      : { x: LAYOUT.rival.x, y: LAYOUT.rival.y, rotation: 0 };
    const to = LAYOUT.trick[player];

    this.state = playCard(this.state, player, card.id);
    this.flights.push({ card, from, to, t: 0, player });
    this.selected = Math.min(this.selected, Math.max(0, this.state.hands.you.length - 1));

    if (this.state.pendingTrick) {
      // Both cards are down: leave them there to be read, then sweep up.
      this.timer = TRICK_HOLD;
      this.pending = 'trick';
      const trick = this.state.pendingTrick;
      this.message = {
        text: describeTrick(trick),
        tone: trick.winner === 'you' ? 'good' : 'bad',
      };
    } else if (this.state.turn === 'rival') {
      this._scheduleRival();
    } else {
      this._setMessage();
    }
  }

  _resolvePending() {
    const pending = this.pending;
    this.pending = null;
    if (pending === 'rival') {
      const card = chooseCard(this.state, 'rival', this.difficulty);
      if (card) this._playCard('rival', card);
      return;
    }
    if (pending === 'trick') {
      this.state = settleTrick(this.state);
      if (this.state.over) {
        this._endDeal();
        return;
      }
      if (this.state.turn === 'rival') this._scheduleRival();
      else this._setMessage();
      return;
    }
    if (pending === 'next-deal') {
      this._deal(this.dealNumber + 1);
      return;
    }
    if (pending === 'finish') this._finish();
  }

  _endDeal() {
    const you = scoreOf(this.state, 'you');
    const rival = scoreOf(this.state, 'rival');
    this.totals.you += you;
    this.totals.rival += rival;
    this.dealScores.push({ you, rival });

    this.banner = {
      text: `Deal ${this.dealNumber}: ${you} - ${rival}`,
      subtext: this.dealNumber < DEALS_PER_MATCH
        ? 'The rival leads the next deal.'
        : `Match: ${this.totals.you} - ${this.totals.rival}`,
      life: DEAL_HOLD,
    };
    this.timer = DEAL_HOLD;
    this.pending = this.dealNumber < DEALS_PER_MATCH ? 'next-deal' : 'finish';
  }

  /* -------------------------------------------------------------- input */

  update(dt, input) {
    this.time += dt;
    if (this.banner.life > 0) this.banner.life -= dt;

    for (const flight of this.flights) flight.t += dt / FLIGHT;
    this.flights = this.flights.filter((flight) => flight.t < 1);

    if (this.phase !== 'play') return;

    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) this._resolvePending();
      return;
    }
    if (this.state.over || this.state.turn !== 'you') return;

    const hand = this.state.hands.you;
    const legal = legalPlays(this.state, 'you');
    const positions = handPositions(hand.length);

    // When following suit is forced, do not leave the highlight on a card that
    // cannot be played - the keyboard would have nothing to press.
    if (legal.length > 0 && !legal.some((card) => card.id === hand[this.selected]?.id)) {
      this.selected = hand.findIndex((card) => legal.some((option) => option.id === card.id));
    }

    if (input.usingPointer) {
      const hovered = cardAt(input.x, input.y, positions);
      if (hovered >= 0) this.selected = hovered;
    }
    const stepSelection = (direction) => {
      const playable = hand
        .map((card, index) => ({ card, index }))
        .filter(({ card }) => legal.some((option) => option.id === card.id));
      if (playable.length === 0) return;
      const current = playable.findIndex(({ index }) => index === this.selected);
      const next = (current + direction + playable.length) % playable.length;
      this.selected = playable[next].index;
    };
    if (input.wasKeyPressed('ArrowLeft', 'KeyA')) stepSelection(-1);
    if (input.wasKeyPressed('ArrowRight', 'KeyD')) stepSelection(1);

    const play = (index) => {
      const card = hand[index];
      if (!card) return;
      if (!legal.some((option) => option.id === card.id)) {
        this.message = { text: `You must follow ${SUIT_BY_ID.get(this.state.table[this.state.leader].suit).name}.`, tone: 'bad' };
        return;
      }
      this._playCard('you', card);
    };

    if (input.justPressed) {
      const clicked = cardAt(input.x, input.y, positions);
      if (clicked >= 0) play(clicked);
    }
    if (input.wasKeyPressed('Space', 'Enter')) play(this.selected);
  }

  /* ------------------------------------------------------------ drawing */

  render(ctx) {
    const { width, height } = this.context;
    drawTable(ctx, width, height, this.time);
    if (this.phase === 'setup') return;

    const state = this.state;
    drawStock(ctx, state, this.time);

    // Rival hand, face down
    const rivalPositions = handPositions(state.hands.rival.length, LAYOUT.rival);
    rivalPositions.forEach((spot) => {
      drawCard(ctx, null, spot.x, spot.y, { faceUp: false, scale: LAYOUT.rival.scale, rotation: spot.rotation });
    });

    // Cards on the table
    for (const player of ['rival', 'you']) {
      const card = state.table[player];
      if (!card || this.flights.some((flight) => flight.card === card)) continue;
      const spot = LAYOUT.trick[player];
      drawCard(ctx, card, spot.x, spot.y, { rotation: player === 'you' ? 0.06 : -0.05 });
    }

    // Your hand
    const legal = state.turn === 'you' && !state.over ? legalPlays(state, 'you') : [];
    const positions = handPositions(state.hands.you.length);
    state.hands.you.forEach((card, index) => {
      const spot = positions[index];
      const playable = legal.some((option) => option.id === card.id);
      const chosen = index === this.selected && state.turn === 'you' && !state.over;
      drawCard(ctx, card, spot.x, spot.y - (chosen ? LAYOUT.hand.lift : 0), {
        rotation: spot.rotation,
        glow: chosen && playable ? 0.9 : 0,
        dim: legal.length > 0 && !playable,
      });
    });

    // Cards mid-flight
    for (const flight of this.flights) {
      const ease = flight.t < 0.5 ? 2 * flight.t * flight.t : 1 - ((-2 * flight.t + 2) ** 2) / 2;
      const x = flight.from.x + (flight.to.x - flight.from.x) * ease;
      const y = flight.from.y + (flight.to.y - flight.from.y) * ease;
      drawCard(ctx, flight.card, x, y, {
        faceUp: true,
        rotation: (flight.from.rotation || 0) * (1 - ease),
        scale: 1 + Math.sin(Math.PI * flight.t) * 0.06,
      });
    }

    drawHud(ctx, width, {
      you: scoreOf(state, 'you') + this.totals.you,
      rival: scoreOf(state, 'rival') + this.totals.rival,
      dealNumber: this.dealNumber,
      dealCount: DEALS_PER_MATCH,
      trumpSuit: state.trumpSuit,
    });
    drawMessage(ctx, width, this.message.text, this.message.tone);
    drawBanner(ctx, width, this.banner.text, this.banner.subtext, clamp(this.banner.life, 0, 1));
  }

  /* ------------------------------------------------------------- result */

  _finish() {
    if (this.finished) return;
    this.finished = true;
    const { you, rival } = this.totals;
    const won = you > rival;
    const drawn = you === rival;
    const margin = Math.abs(you - rival);

    this.context.finish({
      score: won ? 1000 + margin * 12 : drawn ? 400 : Math.round(you * 3),
      title: won ? 'You take the match' : drawn ? 'Dead level' : 'The rival takes it',
      detailTitle: `${you} - ${rival} over ${DEALS_PER_MATCH} deals (${TOTAL_POINTS * DEALS_PER_MATCH} on the table)`,
      collected: this.dealScores.map((deal, index) => ({
        name: `Deal ${index + 1}`,
        color: deal.you > deal.rival ? '#8ef0b4' : deal.you === deal.rival ? '#ffd166' : '#ff9d94',
        count: deal.you,
        label: `${deal.you} - ${deal.rival}`,
      })),
    });
  }

  destroy() {
    this.setup?.destroy();
  }
}

export function createShubat(context) {
  return new ShubatGame(context);
}

export { ShubatGame, cardName };
