import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, makeRng } from '../src/games/catchmon/battle.js';
import { ROSTER, getCharacter } from '../src/games/catchmon/roster.js';
import { drawCharacter, drawPortrait, paletteFor } from '../src/games/catchmon/art.js';
import {
  drawArena,
  drawBanner,
  drawFighter,
  drawPanels,
  drawParticles,
  drawPopups,
  drawTurnBadge,
} from '../src/games/catchmon/scene.js';
import { createFakeContext } from './helpers.js';

const display = () => ({
  hpShown: 80, hpTarget: 80, flash: 0.5, shake: 0.5, lunge: 0.4, hop: 3, alpha: 1, entering: 0.3,
});

test('every fighter in the roster draws without producing NaN coordinates', () => {
  const ctx = createFakeContext();
  for (const character of ROSTER) {
    drawCharacter(ctx, character, { x: 300, y: 400, scale: 1.1, facing: -1, time: 1.7, flash: 0.4 });
    drawPortrait(ctx, character, 74);
  }
  assert.ok(ctx.calls > ROSTER.length * 10, 'each fighter actually drew something');
});

test('palettes stay valid CSS colours', () => {
  for (const character of ROSTER) {
    const palette = paletteFor(character);
    assert.match(palette.light, /^rgb\(\d+, \d+, \d+\)$/);
    assert.match(palette.shade, /^rgb\(\d+, \d+, \d+\)$/);
    assert.equal(palette.body, character.color);
  }
});

test('a full battle scene renders, statuses and stat chips included', () => {
  const ctx = createFakeContext();
  const battle = new Battle({
    playerTeam: [getCharacter('pyrothane'), getCharacter('coralynx'), getCharacter('geodon')],
    enemyTeam: [getCharacter('thornmaw'), getCharacter('frostfin'), getCharacter('hexaraven')],
    rng: makeRng(3),
  });
  battle.activeOf('player').status = { id: 'burn', turns: 2 };
  battle.activeOf('player').stages = { atk: 2, def: -1, spd: 0 };
  battle.activeOf('enemy').shielded = true;
  battle.teams.enemy[2].fainted = true;

  const display2 = { player: display(), enemy: display() };
  drawArena(ctx, 2.5);
  drawFighter(ctx, 'enemy', battle.activeOf('enemy'), display2.enemy, 2.5);
  drawFighter(ctx, 'player', battle.activeOf('player'), display2.player, 2.5);
  drawParticles(ctx, [{ x: 100, y: 100, size: 4, color: '#fff', life: 0.3, maxLife: 0.7 }]);
  drawPanels(ctx, battle, display2);
  drawTurnBadge(ctx, 12, 40);
  drawPopups(ctx, [{ x: 200, y: 200, text: '-42', color: '#ff8080', size: 28, life: 0.5, maxLife: 0.9 }]);
  drawBanner(ctx, 'Victory!', 0.8);
  assert.ok(ctx.calls > 200);
});
