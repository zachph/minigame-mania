import { clamp, seededRandom } from '../../core/utils.js';
import {
  BOX,
  CHESS_ANSWER,
  CHESS_QUESTION,
  FIGHTERS,
  MODE_BY_ID,
  STORY,
  STORY_RECOVERY,
  TOWER,
  TOWER_RECOVERY,
  UNLOCKABLES,
  isChessAnswer,
} from './content.js';
import { createFight, frontOf, healthShare, inInfinity, pressureAt, resolveDomain, stepFight } from './battle.js';
import { SelectPanel } from './select.js';
import { unlock } from './unlocks.js';
import {
  drawBall,
  drawBeam,
  drawBanner,
  drawBench,
  drawBlaster,
  drawBones,
  drawConverge,
  drawSword,
  drawSpikes,
  drawBox,
  drawVoid,
  drawInfinity,
  drawShot,
  drawSlash,
  drawSlowed,
  drawPopup,
  drawScreen,
  drawSpark,
  drawStatus,
  drawWindup,
  drawZone,
  drawText,
} from './art.js';

export const GAME_ID = 'faceoff';

/**
 * Faceoff on a screen. You pick three and watch; the fight is `battle.js`.
 * One click cycles how fast you are watching.
 */

const COUNTDOWN = 1.6;
const AFTER = 2.4;
const SPEEDS = [1, 2, 4];
const TRAIL = 8;

class FaceoffGame {
  constructor(context) {
    this.context = context;
    this.width = context.width;
    this.height = context.height;
    this.stage = 'select';
    this.fight = null;
    this.mode = 'sandbox';
    this.team = [];
    this.step = 0;
    this.wins = 0;
    this.carry = null;
    this.speed = 1;
    this.clock = 0;
    this.popups = [];
    this.sparks = [];
    this.flash = {};
    this.trails = {};
    this.panel = new SelectPanel(context.ui, { onStart: ({ mode, team }) => this.begin(mode, team) });
  }

  begin(mode, team) {
    this.mode = mode;
    this.team = team;
    this.step = 0;
    this.wins = 0;
    this.carry = null;
    this.unlockedNow = [];
    this.panel.destroy();
    this.panel = null;
    this.startFight();
  }

  opponent() {
    if (this.mode === 'tower') {
      const floor = TOWER[Math.min(this.step, TOWER.length - 1)];
      return { team: floor.team, scale: floor.scale, name: `FLOOR ${floor.floor} - ${floor.name}` };
    }
    if (this.mode === 'story') {
      const chapter = STORY[Math.min(this.step, STORY.length - 1)];
      return { team: chapter.team, scale: chapter.scale, name: chapter.name, before: chapter.before };
    }
    const ids = FIGHTERS.map((f) => f.id);
    const pick = () => ids[Math.floor(Math.random() * ids.length)];
    return { team: [pick(), pick(), pick()], scale: 1, name: 'Whoever turns up' };
  }

  startFight() {
    this.foe = this.opponent();
    this.fight = createFight({
      a: this.team,
      b: this.foe.team,
      scaleB: this.foe.scale,
      random: seededRandom(Math.floor(Math.random() * 1e9)),
      asks: true,         // Gojo's Domain Expansion asks the player
    });
    this.closeQuestion();
    this.voidLeft = 0;
    this.voidText = '';
    // Tower and story carry wounds from one fight to the next.
    if (this.carry) {
      const lane = this.fight.sides.a;
      lane.team.forEach((who, i) => { who.hp = clamp(this.carry[i].hp, 0, who.maxHp); who.dodgesLeft = this.carry[i].dodges; });
      lane.front = lane.team.findIndex((who) => who.hp > 0);
      if (lane.front < 0) lane.front = lane.team.length;
    }
    this.popups = [];
    this.sparks = [];
    this.slashes = [];
    this.flash = {};
    this.trails = {};
    this.stage = 'countdown';
    this.timer = COUNTDOWN;
    this.verdict = null;
  }

  update(dt, input) {
    this.clock += dt;
    this.decay(dt);
    if (this.stage === 'select') return;
    this.voidLeft = Math.max(0, (this.voidLeft || 0) - dt);
    // Inside Gojo's Domain everything waits on the player's answer.
    if (this.fight?.pending) {
      this.ask();
      return;
    }
    if (this.voidLeft > 0) return;   // a moment to read how it went
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

    // Small steps at high speed, so the trail and popups keep up.
    const steps = this.speed;
    for (let i = 0; i < steps && !this.fight.over; i += 1) {
      stepFight(this.fight, dt);
      this.absorb();
    }
    for (const side of ['a', 'b']) {
      const who = frontOf(this.fight, side);
      if (!who) continue;
      const trail = (this.trails[who.uid] ||= []);
      trail.push({ x: who.x, y: who.y });
      if (trail.length > TRAIL) trail.shift();
    }
    if (this.fight.over) {
      this.verdict = this.fight.over;
      if (this.verdict.winner === 'a') this.wins += 1;
      this.stage = 'between';
      this.timer = AFTER;
    }
  }

  whereIs(uid) {
    for (const side of ['a', 'b']) {
      const who = frontOf(this.fight, side);
      if (who && who.uid === uid) return { x: who.x, y: who.y - 36 };
    }
    return { x: BOX.x + BOX.w / 2, y: BOX.y + 40 };
  }

  /** In Story, knocking out a new character unlocks them - win or lose. */
  unlockDefeated(uid) {
    if (this.mode !== 'story') return;
    const who = this.fight.sides.b.team.find((f) => f.uid === uid);
    if (!who || !UNLOCKABLES.some((f) => f.id === who.id)) return;
    for (const id of unlock([who.id])) {
      const name = UNLOCKABLES.find((f) => f.id === id).name;
      this.unlockedNow.push(name);
      this.popups.push({ x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2, text: `UNLOCKED: ${name.toUpperCase()}`, colour: '#ffd84a', size: 22, life: 2.4, maxLife: 2.4 });
    }
  }

  absorb() {
    for (const event of this.fight.events) {
      if (event.kind === 'down') this.unlockDefeated(event.uid);
      if (event.kind === 'damage') {
        this.flash[event.uid] = 1;
        const colour = { zone: '#b46aff', table: '#d9a35a', dash: '#96d2ff', beam: '#6ac8ff', fireball: '#ff8a1a', burn: '#f93', slam: '#4aa8ff', instakill: '#ff0', whis: '#9cc4e8', shot: '#ff2a2a', slash: '#ff3355', blaster: '#fff', bones: '#fff', blade: '#fff', sword: '#fff' }[event.source] || '#f44';
        const big = event.source === 'instakill' || event.source === 'sword';
        this.popups.push({ ...this.whereIs(event.uid), text: big ? (event.source === 'sword' ? 'ONE HIT' : 'ONE PUNCH') : `${Math.round(event.amount)}`, colour, size: big ? 28 : event.source === 'burn' || event.source === 'blaster' || event.source === 'bones' ? 14 : 20, life: big ? 1.4 : 0.8, maxLife: big ? 1.4 : 0.8 });
      } else if (event.kind === 'ability') {
        const at = this.whereIs(event.uid);
        this.popups.push({ x: at.x, y: at.y - 22, text: event.name.toUpperCase(), colour: '#ff0', size: 14, life: 1.1, maxLife: 1.1 });
      } else if (event.kind === 'undying') {
        this.popups.push({ ...this.whereIs(event.uid), text: 'UNDYNE THE UNDYING', colour: '#ffd84a', size: 22, life: 1.6, maxLife: 1.6 });
      } else if (event.kind === 'teleport') {
        this.trails[event.uid] = [];
      } else if (event.kind === 'miss') {
        this.popups.push({ ...this.whereIs(event.uid), text: 'MISS', colour: '#ccc', size: 18, life: 0.8, maxLife: 0.8 });
      } else if (event.kind === 'heal') {
        this.popups.push({ ...this.whereIs(event.uid), text: `+${Math.round(event.amount)}`, colour: '#4f4', size: 18, life: 0.8, maxLife: 0.8 });
      } else if (event.kind === 'slash') {
        const at = this.whereIs(event.uid);
        this.slashes.push({ x: at.x, y: at.y + 36, life: 0.45, maxLife: 0.45 });
      } else if (event.kind === 'shot-hit') {
        for (let i = 0; i < 14; i += 1) {
          const a = Math.random() * Math.PI * 2;
          const v = 80 + Math.random() * 200;
          this.sparks.push({ x: event.x, y: event.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4, maxLife: 0.4 });
        }
      } else if (event.kind === 'bump') {
        for (let i = 0; i < 8; i += 1) {
          const a = Math.random() * Math.PI * 2;
          const v = 60 + Math.random() * 140;
          this.sparks.push({ x: event.x, y: event.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35, maxLife: 0.35 });
        }
      }
    }
  }

  decay(dt) {
    for (const uid of Object.keys(this.flash)) {
      this.flash[uid] -= dt * 4;
      if (this.flash[uid] <= 0) delete this.flash[uid];
    }
    for (const p of this.popups) p.life -= dt;
    for (const s of this.sparks) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; }
    this.popups = this.popups.filter((p) => p.life > 0);
    for (const slash of this.slashes || []) slash.life -= dt;
    this.slashes = (this.slashes || []).filter((slash) => slash.life > 0);
    this.sparks = this.sparks.filter((s) => s.life > 0);
  }

  advance() {
    const won = this.verdict.winner === 'a';
    if (this.mode === 'sandbox' || !won) return this.finish(won && this.mode === 'sandbox');
    this.step += 1;
    const runs = this.mode === 'tower' ? TOWER.length : STORY.length;
    if (this.step >= runs) return this.finish(true);
    const back = this.mode === 'tower' ? TOWER_RECOVERY : STORY_RECOVERY;
    this.carry = this.fight.sides.a.team.map((who) => ({
      hp: who.hp <= 0 ? 0 : Math.min(who.maxHp, who.hp + (who.maxHp - who.hp) * back),
      dodges: who.dodgesLeft,
    }));
    this.startFight();
  }

  finish(cleared) {
    const mine = this.fight.sides.a;
    const left = Math.round(healthShare(mine) * 100);
    const runs = this.mode === 'tower' ? TOWER.length : this.mode === 'story' ? STORY.length : 1;
    const score = this.mode === 'sandbox' ? (cleared ? 1000 + left * 10 : left * 5) : this.wins * 1000 + (cleared ? 750 : 0) + left * 8;
    this.context.finish({
      score,
      survived: cleared,
      title: this.mode === 'sandbox' ? (cleared ? 'Your three won' : 'Your three lost')
        : cleared ? (this.mode === 'tower' ? 'You reached the top' : 'Story complete')
          : `${this.mode === 'tower' ? 'Floor' : 'Chapter'} ${this.step + 1} beat you`,
      detailTitle: `${this.wins} of ${runs} won - ${this.verdict.reason}${this.unlockedNow.length ? ` - unlocked ${this.unlockedNow.join(', ')}` : ''}`,
      collected: mine.team.map((who) => ({
        name: who.name,
        color: who.hp > 0 ? who.spec.colour : 'rgba(255, 255, 255, 0.2)',
        label: who.hp > 0 ? `${Math.ceil(who.hp)} HP left` : 'out',
      })),
    });
    this.stage = 'over';
  }

  render(ctx) {
    drawScreen(ctx, this.width, this.height);
    if (this.stage === 'select' || !this.fight) { drawBox(ctx); return; }

    const mode = MODE_BY_ID.get(this.mode);
    const where = this.mode === 'tower' ? `FLOOR ${this.step + 1}/${TOWER.length}`
      : this.mode === 'story' ? STORY[Math.min(this.step, STORY.length - 1)].name.toUpperCase()
        : this.foe.name.toUpperCase();
    drawText(ctx, `${mode.name.toUpperCase()} - ${where}`, this.width / 2, 30, { size: 16 });
    drawText(ctx, this.stage === 'fighting' ? `${this.speed}x - click to watch faster` : '', this.width / 2, 58, { size: 12, colour: '#888' });

    drawBox(ctx, pressureAt(this.fight.time), this.clock);
    const a = frontOf(this.fight, 'a');
    const b = frontOf(this.fight, 'b');
    for (const [who, foe] of [[a, b], [b, a]]) {
      if (who && foe) drawInfinity(ctx, who, inInfinity(foe, who), this.clock);
    }
    for (const summon of this.fight.summons) drawBall(ctx, { ...summon, spec: { colour: '#9cc4e8' } });
    for (const zone of this.fight.zones) drawZone(ctx, zone, this.clock);
    for (const wave of this.fight.waves) drawBones(ctx, wave);
    for (const spike of this.fight.spikes) drawSpikes(ctx, spike);
    for (const beam of this.fight.beams) {
      drawBeam(ctx, beam, beam.owner, frontOf(this.fight, beam.side === 'a' ? 'b' : 'a'), this.clock);
    }
    for (const shot of this.fight.shots) drawShot(ctx, shot);
    for (const c of this.fight.converges) drawConverge(ctx, c, this.clock);
    for (const sword of this.fight.swords) drawSword(ctx, sword, this.clock);
    for (const blaster of this.fight.blasters) {
      drawBlaster(ctx, blaster, this.clock);
    }
    if (this.fight.pending || this.voidLeft > 0) drawVoid(ctx, this.clock, this.fight.pending ? '' : this.voidText);
    for (const helper of this.fight.helpers) drawBall(ctx, helper, { flash: this.flash[helper.uid] || 0 });
    for (const [who, foe] of [[a, b], [b, a]]) {
      if (!who) continue;
      drawBall(ctx, who, { flash: this.flash[who.uid] || 0, trail: this.trails[who.uid] || [] });
      if (foe && inInfinity(who, foe)) drawSlowed(ctx, who);
      drawWindup(ctx, who);
    }
    for (const s of this.sparks) drawSpark(ctx, s);
    for (const slash of this.slashes || []) drawSlash(ctx, slash);
    for (const p of this.popups) drawPopup(ctx, p);

    const helperOf = (side) => this.fight.helpers.find((h) => h.side === side && h.hp > 0) || null;
    drawStatus(ctx, frontOf(this.fight, 'a'), BOX.x, BOX.y + BOX.h + 34, 'left', helperOf('a'));
    drawStatus(ctx, frontOf(this.fight, 'b'), BOX.x + BOX.w, BOX.y + BOX.h + 34, 'right', helperOf('b'));
    drawBench(ctx, this.fight.sides.a, BOX.x, BOX.y + BOX.h + 92, 'left');
    drawBench(ctx, this.fight.sides.b, BOX.x + BOX.w, BOX.y + BOX.h + 92, 'right');

    if (pressureAt(this.fight.time) > 1.01) drawText(ctx, 'EVERYTHING HITS HARDER NOW', this.width / 2, BOX.y - 14, { size: 12, colour: '#f88' });
    if (this.stage === 'countdown') drawBanner(ctx, '* FACEOFF', this.foe.before || this.foe.name);
    else if (this.stage === 'between' && this.verdict) {
      const won = this.verdict.winner === 'a';
      drawBanner(ctx, this.verdict.winner === 'draw' ? '* A DRAW' : won ? '* YOU WON' : '* YOU LOST', this.verdict.reason);
    }
  }

  /** Gojo's question, over the frozen fight: type an answer, press Enter. */
  ask() {
    if (this.question) return;
    const { gojo, foe } = this.fight.pending;
    const root = document.createElement('div');
    root.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,90%);'
      + 'background:#05050f;border:3px solid #fff;padding:18px 20px;color:#fff;font:16px "Courier New",monospace;'
      + 'text-align:center;z-index:5;box-shadow:0 0 40px rgba(120,160,255,.5)';
    const title = document.createElement('div');
    title.textContent = 'DOMAIN EXPANSION: INFINITE VOID';
    title.style.cssText = 'color:#9fd8ff;font-weight:bold;margin-bottom:10px;letter-spacing:1px';
    const lead = document.createElement('div');
    lead.textContent = `${foe.name} is frozen. Get it right and ${foe.name} is beaten. Get it wrong and ${gojo.name} heals to full.`;
    lead.style.cssText = 'font-size:13px;color:#bbc;margin-bottom:12px';
    const q = document.createElement('div');
    q.textContent = CHESS_QUESTION;
    q.style.cssText = 'font-weight:bold;margin-bottom:12px';
    const form = document.createElement('form');
    const field = document.createElement('input');
    field.type = 'text';
    field.placeholder = 'Your answer';
    field.autocomplete = 'off';
    field.style.cssText = 'width:100%;box-sizing:border-box;padding:8px;font:16px "Courier New",monospace;background:#000;color:#fff;border:2px solid #9fd8ff;margin-bottom:10px';
    const go = document.createElement('button');
    go.type = 'submit';
    go.textContent = 'Answer';
    go.className = 'btn btn--primary';
    form.append(field, go);
    // Keys typed here are for the answer, not the game.
    for (const kind of ['keydown', 'keyup']) form.addEventListener(kind, (event) => event.stopPropagation());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.answer(field.value);
    });
    root.append(title, lead, q, form);
    this.context.ui.append(root);
    this.question = root;
    setTimeout(() => field.focus(), 0);
  }

  answer(text) {
    if (!this.fight?.pending) return;
    const { gojo, foe } = this.fight.pending;
    const correct = isChessAnswer(text);
    resolveDomain(this.fight, correct);
    this.absorb();
    this.closeQuestion();
    this.voidLeft = 2.6;
    this.voidText = correct
      ? `Correct! ${foe.name} is beaten.`
      : `Wrong - it's ${CHESS_ANSWER.toLowerCase()}. ${gojo.name} heals to full.`;
  }

  closeQuestion() {
    this.question?.remove();
    this.question = null;
  }

  destroy() {
    this.closeQuestion();
    this.panel?.destroy();
    this.panel = null;
  }
}

export const createFaceoff = (context) => new FaceoffGame(context);
