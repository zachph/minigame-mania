import test from 'node:test';
import assert from 'node:assert/strict';
import { approach, clamp, formatTime, lerp, weightedPick } from '../src/core/utils.js';

test('clamp keeps values inside the range', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(42, 0, 10), 10);
});

test('lerp interpolates end points', () => {
  assert.equal(lerp(0, 10, 0), 0);
  assert.equal(lerp(0, 10, 1), 10);
  assert.equal(lerp(0, 10, 0.25), 2.5);
});

test('approach never overshoots the target', () => {
  assert.equal(approach(0, 10, 3), 3);
  assert.equal(approach(0, 2, 3), 2);
  assert.equal(approach(10, 0, 3), 7);
  assert.equal(approach(1, 0, 3), 0);
});

test('formatTime renders m:ss and floors at zero', () => {
  assert.equal(formatTime(60), '1:00');
  assert.equal(formatTime(9.2), '0:10');
  assert.equal(formatTime(-5), '0:00');
});

test('weightedPick honours the weights', () => {
  const items = [{ id: 'a', w: 0 }, { id: 'b', w: 1 }, { id: 'c', w: 0 }];
  for (let i = 0; i < 50; i += 1) {
    assert.equal(weightedPick(items, (item) => item.w).id, 'b');
  }
});

test('weightedPick falls back when every weight is zero', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  assert.equal(weightedPick(items, () => 0).id, 'a');
});
