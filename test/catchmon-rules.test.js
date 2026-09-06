import test from 'node:test';
import assert from 'node:assert/strict';
import { catchChance, spawnWeight, streakMultiplier } from '../src/games/catchmon/game.js';
import { SPECIES, SPECIES_BY_ID } from '../src/games/catchmon/species.js';

const base = { baseRate: 0.5, accuracy: 0.5, focus: 0, fleeing: false };

test('catch chance stays inside the 5%-95% band', () => {
  assert.ok(catchChance({ ...base, baseRate: 0.001, accuracy: 0 }) >= 0.05);
  assert.ok(catchChance({ ...base, baseRate: 1, accuracy: 1, focus: 1 }) <= 0.95);
});

test('a centred throw beats a grazing one', () => {
  assert.ok(catchChance({ ...base, accuracy: 1 }) > catchChance({ ...base, accuracy: 0 }));
});

test('charging the throw improves the odds', () => {
  assert.ok(catchChance({ ...base, focus: 1 }) > catchChance({ ...base, focus: 0 }));
});

test('a fleeing mon is harder to catch', () => {
  assert.ok(catchChance({ ...base, fleeing: true }) < catchChance({ ...base, fleeing: false }));
});

test('streak multiplier grows then caps', () => {
  assert.equal(streakMultiplier(0), 1);
  assert.equal(streakMultiplier(1), 1);
  assert.equal(streakMultiplier(2), 1.25);
  assert.equal(streakMultiplier(9), 3);
  assert.equal(streakMultiplier(50), 3);
});

test('spawn weights drift from early to late game', () => {
  const prismon = SPECIES_BY_ID.get('prismon');
  const sproutle = SPECIES_BY_ID.get('sproutle');
  assert.equal(spawnWeight(prismon, 0), prismon.weight);
  assert.equal(spawnWeight(prismon, 1), prismon.lateWeight);
  assert.ok(spawnWeight(prismon, 1) > spawnWeight(prismon, 0), 'rares get commoner late');
  assert.ok(spawnWeight(sproutle, 1) < spawnWeight(sproutle, 0), 'commons thin out late');
});

test('rarer species are worth more and are harder to catch', () => {
  const byRarity = [...SPECIES].sort((a, b) => a.rarity - b.rarity);
  for (let i = 1; i < byRarity.length; i += 1) {
    assert.ok(byRarity[i].points > byRarity[i - 1].points, `${byRarity[i].id} scores more`);
    assert.ok(byRarity[i].catchRate < byRarity[i - 1].catchRate, `${byRarity[i].id} is harder`);
  }
});

test('species ids are unique and colours are hex', () => {
  const ids = new Set(SPECIES.map((s) => s.id));
  assert.equal(ids.size, SPECIES.length);
  for (const species of SPECIES) {
    assert.match(species.color, /^#[0-9a-f]{6}$/i, `${species.id} colour`);
    assert.match(species.accent, /^#[0-9a-f]{6}$/i, `${species.id} accent`);
  }
});
