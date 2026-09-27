import { clamp, seededRandom } from '../../core/utils.js';
import { CARDS, getCard } from './cards.js';
import { DECK_MAX } from './collection.js';
import { BOARD_LIMIT, playProblem } from './rules.js';
import {
  activeSide,
  attack,
  createMatch,
  endTurn,
  other,
  playCard,
  playGear,
} from './battle.js';
import { chooseCard, chooseGear, chooseTarget, shouldForceIt } from './ai.js';
import { HandBar } from './ui.js';
import {
  CARD_H,
  CARD_W,
  drawBackdrop,
  drawBanner,
  drawCard,
  drawLog,
  drawSideBar,
  drawSlot,
} from './art.js';

export const GAME_ID = 'strikecards';

/**
 * Strike Cards, played against the machine.
 *
 * The rules live in battle.js and know nothing about a screen. This is the part
 * that puts the two boards on the canvas, hands you your cards, and lets the
 * opponent take its turn a beat at a time so you can see what it did.
 */

/**
 * Where everything sits.
 *
 * The hand bar is a DOM strip over the bottom of the canvas, which eats the
 * last ~107 logical pixels, so nothing the game draws may go below 433 or it
 * ends up hidden behind your own cards.
 */
const FLOOR = 433;
const SLOT = {
  enemy: [{ x: 367, y: 44 }, { x: 489, y: 44 }],
  mine: [{ x: 367, y: 252 }, { x: 489, y: 252 }],
};

const ENEMY_STEP = 0.75;   // seconds between the opponent's actions

/** A legal starter deck: two of each common, and one of each cheap uncommon. */
export function starterDeck() {
  const deck = [];
  for (const card of CARDS.filter((c) => c.rarity === 'common' && !c.form)) deck.push(card, card);
  for (const id of ['sparkfly', 'duskmoth', 'spurs', 'stonewall']) deck.push(getCard(id));
  return deck.slice(0, DECK_MAX);
}

class StrikeCardsGame {
  constructor(context) {
    this.context = context;
    const seed = Math.floor(Math.random() * 1e9);
    this.state = createMatch({
      decks: { a: starterDeck(), b: starterDeck() },
      random: seededRandom(seed),
      first: 'a',
    });

    this.me = 'a';
    this.foe = 'b';
    this.pickedHand = null;      // index into your hand
    this.pickedAttacker = null;  // uid of one of your board cards
    this.enemyQueue = [];
    this.enemyTimer = 0;
    this.finished = false;
    this.banner = { text: 'Strike Cards', subtext: 'Faster card swings first. Kill it before it moves and it never swings back.', life: 3.2 };

    this.bar = new HandBar(context.ui, {
      onPick: (index, card, problem) => this._pickFromHand(index, card, problem),
      onEndTurn: () => this._endMyTurn(),
    });
    this._refreshBar();
  }

  /* --------------------------------------------------------------- input */

  _pickFromHand(index, card, problem) {
    if (this.state.over || this.state.active !== this.me) return;
    if (problem) {
      this.banner = { text: '', subtext: '', life: 0 };
      this._say(problem);
      return;
    }
    if (card.kind === 'gear') {
      // Gear needs a target, so picking it arms the next click on your board.
      this.pickedHand = this.pickedHand === index ? null : index;
      this.pickedAttacker = null;
    } else {
      playCard(this.state, index);
      this.pickedHand = null;
    }
    this._refreshBar();
  }

  _clickBoard(which, card) {
    if (this.state.over || this.state.active !== this.me) return;

    // Putting gear on one of yours.
    if (this.pickedHand != null && which === this.me) {
      const result = playGear(this.state, this.pickedHand, card.uid);
      if (result.error) this._say(result.error);
      this.pickedHand = null;
      this._refreshBar();
      return;
    }

    if (which === this.me) {
      if (card.attackedThisTurn) {
        this._say(`${card.name} has already swung this turn.`);
        return;
      }
      this.pickedAttacker = this.pickedAttacker === card.uid ? null : card.uid;
      this._refreshBar();
      return;
    }

    if (!this.pickedAttacker) {
      this._say('Pick one of your own cards first.');
      return;
    }
    const result = attack(this.state, this.pickedAttacker, card.uid);
    if (result.error) this._say(result.error);
    this.pickedAttacker = null;
    this._refreshBar();
  }

  _say(text) {
    this.state.log.push({ text, kind: 'text' });
  }

  _endMyTurn() {
    if (this.state.over || this.state.active !== this.me) return;
    this.pickedHand = null;
    this.pickedAttacker = null;
    endTurn(this.state);
    this._planEnemyTurn();
    this._refreshBar();
  }

  /* ------------------------------------------------------- the opponent */

  _planEnemyTurn() {
    if (this.state.over) return;
    const side = this.state.sides[this.foe];
    const queue = [];

    const index = chooseCard(side);
    if (index >= 0) queue.push({ kind: 'play', index });
    queue.push({ kind: 'gear' });
    for (const card of side.board) queue.push({ kind: 'swing', uid: card.uid });
    queue.push({ kind: 'done' });

    this.enemyQueue = queue;
    this.enemyTimer = ENEMY_STEP;
  }

  _stepEnemy() {
    const step = this.enemyQueue.shift();
    if (!step) return;
    const side = this.state.sides[this.foe];
    const foeBoard = this.state.sides[this.me].board;

    if (step.kind === 'play') {
      // The hand has moved since it planned, so ask again.
      const index = chooseCard(side);
      if (index >= 0) playCard(this.state, index);
    } else if (step.kind === 'gear') {
      const gear = chooseGear(side);
      if (gear) playGear(this.state, gear.handIndex, gear.targetUid);
    } else if (step.kind === 'swing') {
      const attacker = side.board.find((card) => card.uid === step.uid);
      if (attacker && !attacker.attackedThisTurn) {
        const target = chooseTarget(attacker, foeBoard, { mustAct: shouldForceIt(side) });
        if (target) attack(this.state, attacker.uid, target.uid);
      }
    } else if (step.kind === 'done') {
      endTurn(this.state);
    }
    this._refreshBar();
  }

  /* --------------------------------------------------------------- loop */

  update(dt, input) {
    if (this.banner.life > 0) this.banner.life -= dt;

    if (!this.state.over && this.state.active === this.foe) {
      this.enemyTimer -= dt;
      if (this.enemyTimer <= 0) {
        this._stepEnemy();
        this.enemyTimer = ENEMY_STEP;
      }
    }

    if (input.justPressed) this._hitTest(input.x, input.y);
    if (this.state.over) this._finish();
  }

  _hitTest(x, y) {
    const within = (slot) => x >= slot.x && x <= slot.x + CARD_W && y >= slot.y && y <= slot.y + CARD_H;
    this.state.sides[this.foe].board.forEach((card, i) => {
      if (within(SLOT.enemy[i])) this._clickBoard(this.foe, card);
    });
    this.state.sides[this.me].board.forEach((card, i) => {
      if (within(SLOT.mine[i])) this._clickBoard(this.me, card);
    });
  }

  _refreshBar() {
    const side = this.state.sides[this.me];
    const myTurn = this.state.active === this.me && !this.state.over;
    this.bar.refresh(side.hand, {
      picked: this.pickedHand,
      canEnd: myTurn,
      problemFor: (card) => {
        if (!myTurn) return 'Wait for your turn.';
        if (card.kind === 'gear') {
          if (side.points < card.cost) return `${card.name} costs ${card.cost} - you have ${side.points}.`;
          if (side.board.length === 0) return 'Nothing out to put it on.';
          return null;
        }
        return playProblem(side, card);
      },
      hint: this.state.over ? ''
        : !myTurn ? 'Their turn...'
          : this.pickedHand != null ? 'Now click one of your cards to put it on.'
            : this.pickedAttacker ? 'Now click what you want it to hit.'
              : 'Play a card, then click yours and theirs to swing.',
    });
  }

  /* ------------------------------------------------------------- drawing */

  render(ctx) {
    const { width, height } = this.context;
    drawBackdrop(ctx, width, height, this.state.time);
    void height;

    const mine = this.state.sides[this.me];
    const theirs = this.state.sides[this.foe];
    drawSideBar(ctx, theirs, 18, 10, 420, { name: 'Opponent', active: this.state.active === this.foe, align: 'left' });
    drawSideBar(ctx, mine, width - 438, FLOOR - 26, 420, { name: `You - turn ${mine.turn}`, active: this.state.active === this.me, align: 'right' });

    for (let i = 0; i < BOARD_LIMIT; i += 1) {
      const slot = SLOT.enemy[i];
      const card = theirs.board[i];
      if (!card) drawSlot(ctx, slot.x, slot.y, 'empty');
      else {
        drawCard(ctx, card, slot.x, slot.y, {
          hp: card.hp,
          maxHp: card.maxHp,
          targetable: Boolean(this.pickedAttacker),
          evolvesIn: card.evolvesTo ? Math.max(0, card.evolvesAfter - card.turnsOnBoard) : null,
        });
      }
    }
    for (let i = 0; i < BOARD_LIMIT; i += 1) {
      const slot = SLOT.mine[i];
      const card = mine.board[i];
      if (!card) drawSlot(ctx, slot.x, slot.y, 'your side');
      else {
        drawCard(ctx, card, slot.x, slot.y, {
          hp: card.hp,
          maxHp: card.maxHp,
          picked: this.pickedAttacker === card.uid,
          spent: card.attackedThisTurn,
          evolvesIn: card.evolvesTo ? Math.max(0, card.evolvesAfter - card.turnsOnBoard) : null,
        });
      }
    }

    drawLog(ctx, this.state.log, 18, 190, 316, 68);
    drawBanner(ctx, width, this.banner.text, this.banner.subtext, clamp(this.banner.life, 0, 1));
  }

  _finish() {
    if (this.finished) return;
    this.finished = true;
    const mine = this.state.sides[this.me];
    const theirs = this.state.sides[this.foe];
    const won = this.state.winner === this.me;

    this.banner = {
      text: won ? 'Their board is clear' : this.state.winner ? 'You are out of cards' : 'A draw',
      subtext: this.state.reason,
      life: 4,
    };

    this.context.finish({
      score: Math.round(mine.kills * 120 + (won ? 900 : 0) + mine.board.length * 60),
      lives: mine.kills,
      survived: won,
      title: won ? 'Every card knocked out' : this.state.winner ? 'Beaten' : 'A draw',
      detailTitle: `${mine.turn} turns - ${this.state.reason}`,
      collected: [
        { name: 'Cards you knocked out', color: '#ffd166', count: mine.kills, label: `${mine.kills}` },
        { name: 'Cards they knocked out', color: '#ff9d94', count: theirs.kills, label: `${theirs.kills}` },
        { name: 'Still standing', color: '#8ef0a8', count: mine.board.length, label: `${mine.board.length}` },
        { name: 'Points unspent', color: '#9be8ff', count: mine.points, label: `${mine.points}` },
      ],
    });
  }

  destroy() {
    this.bar?.destroy();
  }
}

export const createStrikeCards = (context) => new StrikeCardsGame(context);
export { StrikeCardsGame };
