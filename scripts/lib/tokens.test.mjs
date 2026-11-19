import assert from 'node:assert/strict';
import { test } from 'node:test';

import { composite, contrastRatio, parseHex } from './color.mjs';
import { KIT, tokenFixture } from './fixtures.mjs';
import { cssName, loadTokens, paintedColor, resolveToken } from './tokens.mjs';

const ratio = (first, second) => contrastRatio(parseHex(first), parseHex(second));

test('contrast ratio follows the WCAG formula', () => {
  assert.equal(ratio('#000000', '#FFFFFF'), 21);
  assert.equal(ratio('#FFF', '#ffffff'), 1);
  assert.ok(Math.abs(ratio('#0260FD', '#030303') - 4.021) < 0.001);
  assert.ok(Math.abs(ratio('#6A6A6A', '#030303') - 3.813) < 0.001);
  assert.equal(ratio('#030303', '#0260FD'), ratio('#0260FD', '#030303'));
});

test('hex parsing covers every length and rejects the rest', () => {
  assert.deepEqual(parseHex('#0260FD80').a.toFixed(3), '0.502');
  assert.equal(parseHex('#abcd').a.toFixed(3), '0.867');
  assert.throws(() => parseHex('blue'), /Not a hex color/);
  assert.throws(() => parseHex('#12345'), /Not a hex color/);
});

test('a translucent color is composited over its backdrop', () => {
  const painted = composite({ ...parseHex('#000000'), a: 0.6 }, parseHex('#FFFFFF'));
  assert.deepEqual([painted.r, painted.g, painted.b].map((channel) => channel.toFixed(2)), ['0.40', '0.40', '0.40']);
});

test('one naming rule gives every token its CSS name', () => {
  assert.equal(cssName('bg-primary'), '--bg-primary');
  assert.equal(cssName('Electric Blue'), '--electric-blue');
});

test('tokens load in tiers and resolve through their aliases', (t) => {
  const root = tokenFixture(t, {
    kit: KIT,
    extensions: { color: { 'border-field': { $value: '{primitive.Dark.dark-200}' } } },
  });
  const { tokens, byName } = loadTokens(root);
  assert.deepEqual(
    Object.fromEntries(['dark-900', 'bg-primary', 'border-field'].map((name) => [name, byName.get(name).tier])),
    { 'dark-900': 'primitive', 'bg-primary': 'semantic', 'border-field': 'extension' },
  );
  assert.equal(tokens.length, 10);
  assert.deepEqual(resolveToken(byName, 'bg-primary'), { hex: '#030303', alpha: 1, chain: ['bg-primary', 'dark-900'] });
  assert.equal(resolveToken(byName, 'card-bg-translucent').alpha, 0.6);
  assert.throws(() => resolveToken(byName, 'no-such-token'), /Unknown token/);
});

test('a translucent token needs a backdrop to be measured', (t) => {
  const { byName } = loadTokens(tokenFixture(t, { kit: KIT }));
  assert.throws(() => paintedColor(byName, 'card-bg-translucent'), /translucent/);
  const painted = paintedColor(byName, 'card-bg-translucent', 'text-primary');
  assert.equal(painted.a, 1);
  assert.ok(painted.r > 0.3 && painted.r < 0.5);
});

test('broken token files are rejected with the reason', (t) => {
  const withSemantic = (semantic) => ({ ...KIT, semantic: { $type: 'color', Bad: semantic } });
  assert.throws(
    () => loadTokens(tokenFixture(t, { kit: withSemantic({ 'bg-x': { $value: '{primitive.Blue.blue-950}' } }) })),
    /bg-x points at blue-950, which is not defined/,
  );
  assert.throws(
    () => loadTokens(tokenFixture(t, { kit: withSemantic({ 'bg-x': { $value: '#123456' } }) })),
    /must alias another token/,
  );
  assert.throws(
    () => loadTokens(tokenFixture(t, { kit: withSemantic({ 'dark-900': { $value: '{primitive.Dark.dark-200}' } }) })),
    /Duplicate token name: dark-900/,
  );
  assert.throws(
    () => loadTokens(tokenFixture(t, { kit: KIT, extensions: { color: { 'electric blue': { $value: '{primitive.Dark.dark-200}' } } } })),
    /share the CSS name --electric-blue/,
  );
});
