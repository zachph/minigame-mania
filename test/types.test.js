import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESISTED,
  SUPER_EFFECTIVE,
  TYPES,
  TYPE_IDS,
  effectiveness,
  strongAgainst,
  weakTo,
} from '../src/games/catchmon/types.js';

test('there are exactly six types with unique ids and hex colours', () => {
  assert.equal(TYPES.length, 6);
  assert.equal(new Set(TYPE_IDS).size, 6);
  for (const type of TYPES) {
    assert.match(type.color, /^#[0-9a-f]{6}$/i, `${type.id} colour`);
    assert.match(type.accent, /^#[0-9a-f]{6}$/i, `${type.id} accent`);
  }
});

test('every type beats two, is resisted by two and is neutral against one', () => {
  for (const attack of TYPE_IDS) {
    const others = TYPE_IDS.filter((id) => id !== attack);
    const supers = others.filter((defend) => effectiveness(attack, defend) === SUPER_EFFECTIVE);
    const resists = others.filter((defend) => effectiveness(attack, defend) === RESISTED);
    const neutral = others.filter((defend) => effectiveness(attack, defend) === 1);
    assert.equal(supers.length, 2, `${attack} hits two types hard`);
    assert.equal(resists.length, 2, `${attack} is resisted by two types`);
    assert.equal(neutral.length, 1, `${attack} is neutral against one type`);
  }
});

test('the chart is symmetric: what beats you, you resist', () => {
  for (const attack of TYPE_IDS) {
    for (const defend of TYPE_IDS) {
      if (attack === defend) continue;
      const forward = effectiveness(attack, defend);
      const back = effectiveness(defend, attack);
      if (forward === SUPER_EFFECTIVE) assert.equal(back, RESISTED, `${defend} should resist ${attack}`);
      if (forward === RESISTED) assert.equal(back, SUPER_EFFECTIVE, `${defend} should beat ${attack}`);
      if (forward === 1) assert.equal(back, 1, `${attack}/${defend} should be mutually neutral`);
    }
  }
});

test('a type is neutral against itself', () => {
  for (const type of TYPE_IDS) assert.equal(effectiveness(type, type), 1);
});

test('strongAgainst and weakTo agree with the chart', () => {
  for (const type of TYPE_IDS) {
    for (const target of strongAgainst(type)) {
      assert.equal(effectiveness(type, target), SUPER_EFFECTIVE);
    }
    for (const threat of weakTo(type)) {
      assert.equal(effectiveness(threat, type), SUPER_EFFECTIVE);
    }
    assert.equal(new Set([...strongAgainst(type), ...weakTo(type)]).size, 4);
  }
});

test('an unknown type is treated as neutral', () => {
  assert.equal(effectiveness('ember', 'nonsense'), 1);
  assert.equal(effectiveness(null, 'ember'), 1);
});
