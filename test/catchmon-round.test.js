import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatchmon } from '../src/games/catchmon/game.js';
import { FIELD, ROUND_TIME, START_BALLS } from '../src/games/catchmon/constants.js';
import { createFakeContext, FakeInput, runFrames } from './helpers.js';

function newGame() {
  const results = [];
  const game = createCatchmon({
    width: 960,
    height: 540,
    highScore: 0,
    finish: (result) => results.push(result),
  });
  return { game, results, input: new FakeInput() };
}

/** Skips past the "Catch!" intro so updates actually advance the round. */
function skipIntro(game, input) {
  runFrames(game, input, 100);
}

test('the round counts down and reports a result exactly once', () => {
  const { game, results, input } = newGame();
  skipIntro(game, input);
  assert.ok(game.timeLeft < ROUND_TIME);

  runFrames(game, input, 60 * (ROUND_TIME + 3));
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Time's up!");
  assert.ok(Number.isFinite(results[0].score));
  assert.ok(Array.isArray(results[0].collected));
});

test('mons spawn, wander and stay inside the field', () => {
  const { game, input } = newGame();
  skipIntro(game, input);
  runFrames(game, input, 60 * 10);
  assert.ok(game.mons.length > 0, 'mons appear');
  for (const mon of game.mons) {
    if (mon.state === 'leaving') continue;
    assert.ok(mon.x >= FIELD.left && mon.x <= FIELD.right, `x in field: ${mon.x}`);
    assert.ok(mon.y >= FIELD.top && mon.y <= FIELD.bottom, `y in field: ${mon.y}`);
  }
});

test('a tap throws one ball; a hold charges before throwing', () => {
  const { game, input } = newGame();
  skipIntro(game, input);

  input.press();
  input.release();
  game.update(1 / 60, input);
  input.endFrame();
  assert.equal(game.balls, START_BALLS - 1, 'a tap spends one ball');
  assert.equal(game.balls3d.length, 1);
  assert.equal(game.balls3d[0].focus, 0, 'a tap is an unfocused throw');

  input.press();
  runFrames(game, input, 60); // hold for a second
  assert.equal(game.charging, true);
  assert.equal(game.charge, 1, 'charge maxes out');
  input.release();
  game.update(1 / 60, input);
  input.endFrame();
  assert.equal(game.balls, START_BALLS - 2);
  assert.equal(game.balls3d.at(-1).focus, 1, 'the held throw is fully focused');
});

test('the round ends early once the balls run out', () => {
  const { game, results, input } = newGame();
  skipIntro(game, input);

  for (let i = 0; i < START_BALLS + 40 && results.length === 0; i += 1) {
    input.aimAt(60, 480); // a corner of the field, away from most mons
    input.press();
    input.release();
    runFrames(game, input, 40);
  }

  assert.equal(results.length, 1);
  assert.ok(game.timeLeft > 0, 'ended before the clock ran out');
  assert.equal(results[0].title, 'Out of balls!');
});

test('a guaranteed catch scores points, refunds a ball and builds a streak', () => {
  const { game, input } = newGame();
  skipIntro(game, input);

  const random = Math.random;
  Math.random = () => 0; // every capture roll succeeds
  try {
    for (let catches = 0; catches < 2; catches += 1) {
      let mon = null;
      for (let waited = 0; !mon && waited < 300; waited += 1) {
        mon = game.mons.find((m) => m.state === 'wander') || null;
        if (!mon) runFrames(game, input, 1);
      }
      assert.ok(mon, 'a mon is available to catch');
      input.aimAt(mon.x, mon.y);
      input.press();
      input.release();
      runFrames(game, input, 6, 1 / 60, (frame, g, i) => {
        i.aimAt(mon.x, mon.y); // the mon barely moves over six frames
      });
      runFrames(game, input, 180); // let the ball land and wobble out
    }
  } finally {
    Math.random = random;
  }

  assert.ok(game.score > 0, 'points were scored');
  assert.equal(game.streak, 2, 'consecutive catches build the streak');
  assert.ok(game.balls > START_BALLS - 2, 'catches refund balls');
  assert.equal(Object.values(game.caught).reduce((a, b) => a + b, 0), 2);
});

test('rendering a live round touches the canvas without producing NaN', () => {
  const { game, input } = newGame();
  const ctx = createFakeContext();
  game.render(ctx);          // intro frame
  skipIntro(game, input);
  input.press();
  runFrames(game, input, 90);
  input.release();
  runFrames(game, input, 90);
  game.render(ctx);
  assert.ok(ctx.calls > 100, 'the scene actually drew something');
});
