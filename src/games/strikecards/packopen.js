import { TAU, clamp, lerp } from '../../core/utils.js';
import { RARITY_BY_ID, rarityRank } from './collection.js';
import { getPackKind } from './packs.js';
import {
  CARD_H,
  CARD_W,
  drawCard,
  drawCardBack,
  drawCardFlip,
  drawRarityGlow,
  drawSealedPack,
} from './art.js';

/**
 * Opening a pack.
 *
 * The cards are already decided before this runs - it is handed the five it is
 * going to show and does nothing but show them. That split is deliberate: what
 * you pulled is settled by `packs.js` and saved before the first card turns
 * over, so closing the tab halfway through cannot cost you a legendary.
 *
 * One click does the next thing, whatever that is: tear the pack, turn the
 * next card, or finish. There is nothing to aim at.
 */

const GAP = 18;
const ROW_Y = 206;
const FLIP_TIME = 0.42;
const DEAL_TIME = 0.5;

/** How much of a fuss a tier is worth making. */
const FANFARE = { common: 0.25, uncommon: 0.45, rare: 0.7, epic: 0.88, legendary: 1 };

const rowX = (count, width) => (width - (count * CARD_W + (count - 1) * GAP)) / 2;

export class PackOpening {
  /**
   * `results` is `[{ card, rolled, fellFrom, isNew, owned }]` - what came out,
   * and what each one meant to a collection that has already been updated.
   */
  constructor({ kind, results, width, height, onDone }) {
    this.kind = getPackKind(kind);
    this.results = results;
    this.width = width;
    this.height = height;
    this.onDone = onDone;

    this.phase = 'sealed';   // sealed | dealing | revealing | done
    this.clock = 0;
    this.phaseTime = 0;
    this.revealed = 0;       // how many have been turned over
    this.flip = 0;           // 0..1 through the card turning now
    this.sparks = [];
    this.shake = 0;
    this.pulse = 0;
  }

  /* ----------------------------------------------------------- the input */

  /** One click or key press, meaning "get on with it". */
  advance() {
    if (this.phase === 'sealed') {
      this.phase = 'dealing';
      this.phaseTime = 0;
      this.shake = 1;
      this.burst(this.width / 2, this.height / 2 - 10, 26, this.kind.color);
      return;
    }
    if (this.phase === 'dealing') {
      // Impatience is allowed: skip straight to the cards being laid out.
      this.phaseTime = DEAL_TIME;
      return;
    }
    if (this.phase === 'revealing') {
      if (this.flip > 0 && this.flip < 1) {
        this.flip = 1;         // snap the one in progress
        return;
      }
      this.turnNext();
      return;
    }
    this.onDone?.();
  }

  /** Turns the next card over, or finishes if they are all up. */
  turnNext() {
    if (this.revealed >= this.results.length) {
      this.phase = 'done';
      return;
    }
    this.revealed += 1;
    this.flip = 0.0001;
  }

  /** Turns everything over at once, for someone who has seen it before. */
  revealAll() {
    this.revealed = this.results.length;
    this.flip = 1;
    this.phase = 'done';
  }

  /* ---------------------------------------------------------- the update */

  update(dt, input) {
    this.clock += dt;
    this.phaseTime += dt;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.pulse = (Math.sin(this.clock * 2.6) + 1) / 2;

    for (const spark of this.sparks) {
      spark.life -= dt;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vy += 320 * dt;
      spark.vx *= 0.97;
    }
    this.sparks = this.sparks.filter((spark) => spark.life > 0);

    if (this.phase === 'dealing' && this.phaseTime >= DEAL_TIME) {
      this.phase = 'revealing';
      this.phaseTime = 0;
    }

    if (this.phase === 'revealing' && this.flip > 0 && this.flip < 1) {
      this.flip = Math.min(1, this.flip + dt / FLIP_TIME);
      if (this.flip >= 1) this.onTurned(this.results[this.revealed - 1]);
    }

    if (input?.justPressed || input?.wasKeyPressed('Space', 'Enter')) this.advance();
  }

  /** The moment a card lands face up. */
  onTurned(result) {
    const tier = result.card.rarity;
    const fuss = FANFARE[tier] ?? 0.3;
    const tone = RARITY_BY_ID.get(tier);
    const spot = this.slotOf(this.revealed - 1);
    this.burst(spot.x + CARD_W / 2, spot.y + CARD_H / 2, Math.round(8 + fuss * 34), tone?.color || '#fff');
    this.shake = fuss * 0.8;
    if (this.revealed >= this.results.length) {
      this.phase = 'done';
      this.phaseTime = 0;
    }
  }

  burst(x, y, count, colour) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * TAU;
      const speed = 70 + Math.random() * 230;
      this.sparks.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        size: 1.8 + Math.random() * 2.6,
        life: 0.45 + Math.random() * 0.5,
        maxLife: 0.95,
        colour,
      });
    }
  }

  /** Where card `i` sits once the pack is open. */
  slotOf(i) {
    const x = rowX(this.results.length, this.width) + i * (CARD_W + GAP);
    return { x, y: ROW_Y };
  }

  /* --------------------------------------------------------- the drawing */

  render(ctx) {
    const { width, height } = this;
    ctx.save();
    if (this.shake > 0.02) {
      ctx.translate((Math.random() - 0.5) * this.shake * 9, (Math.random() - 0.5) * this.shake * 9);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    if (this.phase === 'sealed') this.drawSealed(ctx);
    else this.drawCards(ctx);

    for (const spark of this.sparks) {
      const t = clamp(spark.life / spark.maxLife, 0, 1);
      ctx.globalAlpha = t;
      ctx.fillStyle = spark.colour;
      ctx.beginPath();
      ctx.arc(spark.x, spark.y, spark.size * t, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    this.drawFooter(ctx, width, height);
    ctx.restore();
  }

  drawSealed(ctx) {
    const { width, height } = this;
    ctx.fillStyle = '#e9edf7';
    ctx.font = '800 30px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(this.kind.name, width / 2, 110);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = '700 14px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(this.kind.blurb, width / 2, 134);

    drawSealedPack(ctx, width / 2, height / 2 + 6, this.kind, {
      shake: 0,
      scale: 1 + this.pulse * 0.035,
    });
  }

  drawCards(ctx) {
    // The header stays up through the reveal, so the screen is never just
    // cards floating in the middle of nothing.
    ctx.fillStyle = '#e9edf7';
    ctx.font = '800 24px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.kind.name, this.width / 2, 92);
    if (this.phase !== 'done') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '700 13px "Trebuchet MS", system-ui, sans-serif';
      ctx.fillText(`${this.revealed} of ${this.results.length} turned over`, this.width / 2, 114);
    }

    const dealt = clamp(this.phaseTime / DEAL_TIME, 0, 1);
    const ease = 1 - (1 - dealt) ** 3;

    for (let i = 0; i < this.results.length; i += 1) {
      const result = this.results[i];
      const slot = this.slotOf(i);
      // On the way out of the pack they fly from the middle to their place.
      const fromX = this.width / 2 - CARD_W / 2;
      const fromY = this.height / 2 - CARD_H / 2;
      const x = this.phase === 'dealing' ? lerp(fromX, slot.x, ease) : slot.x;
      const y = this.phase === 'dealing' ? lerp(fromY, slot.y, ease) : slot.y;

      const isTurning = this.phase === 'revealing' && i === this.revealed - 1 && this.flip < 1;
      const isUp = i < this.revealed && !isTurning;

      if (isUp) {
        const age = clamp((this.clock - (result._shownAt ?? (result._shownAt = this.clock))) * 2.6, 0, 1);
        drawRarityGlow(ctx, x, y, result.card.rarity, (FANFARE[result.card.rarity] ?? 0.3) * (0.5 + 0.5 * this.pulse));
        drawCard(ctx, result.card, x, y, {});
        this.drawTag(ctx, result, x, y, age);
      } else if (isTurning) {
        drawCardFlip(ctx, result.card, x, y, this.flip, {});
      } else {
        drawCardBack(ctx, x, y);
      }
    }
  }

  /** What this card meant: brand new, another copy, or a tier that fell short. */
  drawTag(ctx, result, x, y, age) {
    ctx.save();
    ctx.globalAlpha = age;
    ctx.textAlign = 'center';
    if (result.isNew) {
      ctx.fillStyle = '#ffd166';
      ctx.font = '800 13px "Trebuchet MS", system-ui, sans-serif';
      ctx.fillText('NEW', x + CARD_W / 2, y - 10);
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '700 11px "Trebuchet MS", system-ui, sans-serif';
      ctx.fillText(`you now have ${result.owned}`, x + CARD_W / 2, y - 10);
    }
    const tone = RARITY_BY_ID.get(result.card.rarity);
    ctx.fillStyle = tone?.color || '#fff';
    ctx.font = '700 11px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(tone?.name || '', x + CARD_W / 2, y + CARD_H + 16);
    ctx.restore();
  }

  /** The line along the bottom that says what a click will do next. */
  drawFooter(ctx, width, height) {
    let text = '';
    if (this.phase === 'sealed') text = 'Click to tear it open';
    else if (this.phase === 'dealing') text = '';
    else if (this.phase === 'revealing') text = 'Click to turn the next one';
    else text = this.summary();

    if (!text) return;
    const done = this.phase === 'done';
    ctx.fillStyle = done ? '#e9edf7' : 'rgba(255, 255, 255, 0.6)';
    ctx.font = `700 ${done ? 16 : 14}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, height - 74);
    if (done) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '700 13px "Trebuchet MS", system-ui, sans-serif';
      ctx.fillText('Click to put them away', width / 2, height - 50);
    }
  }

  /** What the whole pack came to, once it is all face up. */
  summary() {
    const fresh = this.results.filter((r) => r.isNew).length;
    const best = this.results.reduce(
      (top, r) => (rarityRank(r.card.rarity) > rarityRank(top) ? r.card.rarity : top),
      'common',
    );
    const tone = RARITY_BY_ID.get(best);
    const newPart = fresh === 0 ? 'nothing you did not already have'
      : fresh === 1 ? '1 you had never seen'
        : `${fresh} you had never seen`;
    return `${newPart}  -  best was ${tone?.name.toLowerCase() || best}`;
  }
}

export const createPackOpening = (options) => new PackOpening(options);
