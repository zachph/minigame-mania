import { clamp } from '../../core/utils.js';
import {
  BOARD_SIZE,
  PIECES,
  SIDES,
  applyMove,
  createGame,
  legalMoves,
  movesFrom,
  opponentOf,
  piecesOf,
} from './rules.js';
import { chooseMove } from './ai.js';
import { BoardPanel, SetupPanel } from './ui.js';
import {
  drawBackdrop,
  drawBanner,
  drawBoard,
  drawHints,
  drawPiece,
  squareAt,
  squareCentre,
} from './render.js';

export const GAME_ID = 'nopoly';

const MOVE_ANIMATION = 0.24;   // seconds a piece takes to slide
const THINK_DELAY = 0.45;      // pause before the computer commits, so it reads as a turn

class NopolyGame {
  constructor(context) {
    this.context = context;
    this.time = 0;
    this.phase = 'setup';
    this.state = createGame();
    this.mode = 'computer';
    this.difficulty = 'normal';
    this.playerSide = 'red';

    this.selected = null;
    this.moveHints = [];
    this.cursor = 52; // b2-ish, so the keyboard has somewhere to start
    this.history = [];
    this.animation = null;
    this.thinkTimer = 0;
    this.thinking = false;
    this.banner = { text: '', subtext: '', life: 0 };
    this.finished = false;
    this.panel = null;

    this.setup = new SetupPanel(context.ui, {
      onStart: (options) => this._begin(options),
    });
  }

  _begin({ mode, difficulty }) {
    this.setup.destroy();
    this.setup = null;
    this.mode = mode;
    this.difficulty = difficulty;
    this.phase = 'play';
    this.state = createGame();
    this.history = [];
    this.panel = new BoardPanel(this.context.ui, { onResign: () => this._resign() });
    this._refreshPanel();
  }

  /* ------------------------------------------------------------- helpers */

  get controlsCurrentSide() {
    if (this.state.over || this.animation || this.thinking) return false;
    return this.mode === 'hotseat' || this.state.turn === this.playerSide;
  }

  _refreshPanel() {
    if (!this.panel) return;
    const counts = {
      red: { alive: piecesOf(this.state, 'red').length },
      blue: { alive: piecesOf(this.state, 'blue').length },
    };
    this.panel.setTurn(this.state, {
      thinking: this.thinking,
      mode: this.mode,
      playerSide: this.playerSide,
    });
    this.panel.setArmies(this.state, counts);
    this.panel.setLog(this.history);
  }

  _select(index) {
    const piece = this.state.board[index];
    if (!piece || piece.side !== this.state.turn) return false;
    this.selected = index;
    this.moveHints = movesFrom(this.state, index);
    return true;
  }

  _clearSelection() {
    this.selected = null;
    this.moveHints = [];
  }

  /** Starts the slide animation; the move is applied to state immediately. */
  _play(move) {
    const piece = this.state.board[move.from];
    const target = this.state.board[move.to];
    const next = applyMove(this.state, move);
    this.history.push(next.lastMove);
    this.animation = {
      piece,
      from: squareCentre(move.from),
      to: squareCentre(move.to),
      captured: target ? { piece: target, at: squareCentre(move.to) } : null,
      t: 0,
    };
    this.state = next;
    this._clearSelection();
    this._refreshPanel();
  }

  _resign() {
    if (this.state.over || this.finished) return;
    const loser = this.mode === 'hotseat' ? this.state.turn : this.playerSide;
    this.state = {
      ...this.state,
      over: true,
      winner: opponentOf(loser),
      reason: `${SIDES[loser].name} resigned`,
    };
    this._refreshPanel();
    this._announceEnd();
  }

  _announceEnd() {
    const { winner, reason } = this.state;
    this.banner = {
      text: winner ? `${SIDES[winner].name} wins!` : 'Draw',
      subtext: reason || '',
      life: 2.6,
    };
  }

  /* --------------------------------------------------------------- input */

  update(dt, input) {
    this.time += dt;
    if (this.banner.life > 0) this.banner.life -= dt;
    if (this.phase !== 'play') return;

    if (this.animation) {
      this.animation.t += dt / MOVE_ANIMATION;
      if (this.animation.t >= 1) {
        this.animation = null;
        if (this.state.over) this._finishIfNeeded();
      }
      return;
    }

    if (this.state.over) {
      this._finishIfNeeded();
      return;
    }

    this._handlePointer(input);
    this._handleKeyboard(input);
    this._maybeThink(dt);
  }

  _handlePointer(input) {
    if (!input.justPressed || !this.controlsCurrentSide) return;
    const index = squareAt(input.x, input.y);
    if (index == null) {
      this._clearSelection();
      return;
    }
    this.cursor = index;
    const move = this.moveHints.find((option) => option.to === index);
    if (move) {
      this._play(move);
      return;
    }
    if (!this._select(index)) this._clearSelection();
  }

  _handleKeyboard(input) {
    if (!this.controlsCurrentSide) return;
    const col = this.cursor % BOARD_SIZE;
    const row = Math.floor(this.cursor / BOARD_SIZE);
    let dx = 0;
    let dy = 0;
    if (input.wasKeyPressed('ArrowLeft', 'KeyA')) dx -= 1;
    if (input.wasKeyPressed('ArrowRight', 'KeyD')) dx += 1;
    if (input.wasKeyPressed('ArrowUp', 'KeyW')) dy -= 1;
    if (input.wasKeyPressed('ArrowDown', 'KeyS')) dy += 1;
    if (dx || dy) {
      const nextCol = clamp(col + dx, 0, BOARD_SIZE - 1);
      const nextRow = clamp(row + dy, 0, BOARD_SIZE - 1);
      this.cursor = nextRow * BOARD_SIZE + nextCol;
    }
    if (input.wasKeyPressed('Space', 'Enter')) {
      const move = this.moveHints.find((option) => option.to === this.cursor);
      if (move) this._play(move);
      else if (!this._select(this.cursor)) this._clearSelection();
    }
    if (input.wasKeyPressed('Backspace', 'Delete')) this._clearSelection();
  }

  /** Runs the computer's turn, one beat after it becomes its move. */
  _maybeThink(dt) {
    if (this.mode !== 'computer' || this.state.turn === this.playerSide) return;
    if (!this.thinking) {
      this.thinking = true;
      this.thinkTimer = THINK_DELAY;
      this._clearSelection();
      this._refreshPanel(); // paint "Thinking..." before the search blocks the frame
      return;
    }
    this.thinkTimer -= dt;
    if (this.thinkTimer > 0) return;
    const move = chooseMove(this.state, this.difficulty);
    this.thinking = false;
    if (move) this._play(move);
    else this._refreshPanel();
  }

  _finishIfNeeded() {
    if (this.finished) return;
    this.finished = true;
    this._announceEnd();

    const { winner, reason } = this.state;
    const survivors = piecesOf(this.state, this.playerSide);
    const enemyLosses = this.state.captured[opponentOf(this.playerSide)];
    const turns = Math.ceil(this.state.moveNumber / 2);
    const playerWon = this.mode === 'hotseat' ? Boolean(winner) : winner === this.playerSide;

    let score = 0;
    if (this.mode === 'hotseat') {
      score = enemyLosses.length * 120;
    } else if (playerWon) {
      score = Math.round(1200 + survivors.length * 140 + Math.max(0, (40 - turns) * 20));
    } else {
      score = enemyLosses.length * 90;
    }

    const title = this.mode === 'hotseat'
      ? winner ? `${SIDES[winner].name} wins!` : 'A draw'
      : playerWon ? 'You win!' : winner ? 'Beaten' : 'A draw';

    const counts = {};
    for (const type of enemyLosses) counts[type] = (counts[type] || 0) + 1;

    this.context.finish({
      score,
      title,
      detailTitle: `${reason} - ${turns} turn${turns === 1 ? '' : 's'}`,
      collected: Object.entries(counts).map(([type, count]) => ({
        name: `${PIECES[type].name}s taken`,
        color: SIDES[opponentOf(this.playerSide)].color,
        count,
        label: `x${count}`,
      })),
      emptyText: 'No captures this match.',
    });
  }

  /* ------------------------------------------------------------- drawing */

  render(ctx) {
    const { width, height } = this.context;
    drawBackdrop(ctx, width, height, this.time);
    if (this.phase === 'setup') return;

    drawBoard(ctx, this.state, this);
    drawHints(ctx, {
      selected: this.selected,
      moves: this.controlsCurrentSide ? this.moveHints : [],
      cursor: this.controlsCurrentSide ? this.cursor : null,
      time: this.time,
    });

    const moving = this.animation;
    for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
      const piece = this.state.board[index];
      if (!piece) continue;
      if (moving && piece === moving.piece) continue; // drawn along its path below
      const { x, y } = squareCentre(index);
      drawPiece(ctx, piece, x, y);
    }

    if (moving) {
      if (moving.captured) {
        const fade = 1 - clamp(moving.t * 1.4, 0, 1);
        drawPiece(ctx, moving.captured.piece, moving.captured.at.x, moving.captured.at.y, 0.6 + fade * 0.4, fade);
      }
      const ease = moving.t < 0.5 ? 2 * moving.t * moving.t : 1 - ((-2 * moving.t + 2) ** 2) / 2;
      const x = moving.from.x + (moving.to.x - moving.from.x) * ease;
      const y = moving.from.y + (moving.to.y - moving.from.y) * ease;
      const lift = Math.sin(Math.PI * moving.t) * 6;
      drawPiece(ctx, moving.piece, x, y - lift, 1.08);
    }

    drawBanner(ctx, width, this.banner.text, this.banner.subtext, clamp(this.banner.life, 0, 1));
  }

  destroy() {
    this.setup?.destroy();
    this.panel?.destroy();
  }
}

export function createNopoly(context) {
  return new NopolyGame(context);
}

export { NopolyGame };
