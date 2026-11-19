import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import { checkFiles, checkText, inScope, loadPrimitives } from './token-usage.mjs';

const found = (text, options) => checkText(text, options).map((violation) => violation.found);

/** Builds a throwaway repo layout and returns its root. */
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'token-usage-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

test('flags hex colors of every length', () => {
  const css = '.a{color:#fff;background:#0260FD;border-color:#0260fd80;outline-color:#abcd}';
  assert.deepEqual(found(css, { extension: '.css' }), ['#fff', '#0260FD', '#0260fd80', '#abcd']);
});

test('reports the line and column of a violation', () => {
  const [violation] = checkText('a {\n  color: #030303;\n}\n', { extension: '.css' });
  assert.deepEqual([violation.line, violation.column, violation.rule], [2, 10, 'color-literal']);
});

test('does not read fragments, entities or SVG references as colors', () => {
  const html = [
    '<a href="#faq">FAQ</a>',
    '<a href="#cafe">menu</a>',
    '<a href="/pricing#abc">plans</a>',
    '<p>&#8212; &#x2014;</p>',
    '<g clip-path="url(#abc)"></g>',
    '<a href={"#feed"}>feed</a>',
    'this.#bad = 1;',
    '<a href="#add-on">add-on</a>',
  ].join('\n');
  assert.deepEqual(found(html, { extension: '.astro' }), []);
});

test('flags color functions with literal arguments only', () => {
  const css = [
    '.a{background:rgba(2,96,253,.14)}',
    '.b{color:hsl(217 98% 50%)}',
    '.c{color:oklch(0.6 0.2 260)}',
    '.d{color:color(display-p3 0 0.4 1)}',
    '.e{color:rgb(from var(--text-brand) r g b / 50%)}',
    '.f{background:color-mix(in srgb, var(--bg-primary) 60%, transparent)}',
    '.g{color:rgb(var(--channels) / 0.5)}',
  ].join('\n');
  assert.deepEqual(found(css, { extension: '.css' }), ['rgba()', 'hsl()', 'oklch()', 'color()']);
});

test('flags named colors in stylesheets and <style> blocks, not in copy', () => {
  assert.deepEqual(found('.a{color:white;border:1px solid black}', { extension: '.css' }), ['white', 'black']);

  const astro = [
    '<p>Trade the white-label way: black box, red flags.</p>',
    '<style>',
    '  .note { white-space: nowrap; color: var(--text-primary); }',
    '  .warn { color: red; }',
    '  .name { font-family: "Arial Black", sans-serif; content: "black"; }',
    '  .token { color: var(--card-black); }',
    '</style>',
  ].join('\n');
  assert.deepEqual(found(astro, { extension: '.astro' }), ['red']);
});

test('named colors are not checked in script files', () => {
  assert.deepEqual(found("const tone = { color: 'white' };", { extension: '.ts' }), []);
});

test('classifies tokens: literals are primitives, aliases are not', () => {
  const tokens = `
    /* primitives */
    :root { --dark-900: #030303; --blue-600: #0260FD; --space-2: 0.5rem; --font-display: 'Lato', sans-serif; }
    /* semantic */
    :root { --bg-primary: var(--dark-900); --card-bg-translucent: color-mix(in srgb, var(--dark-900) 60%, transparent); }
  `;
  assert.deepEqual([...loadPrimitives(tokens)].sort(), ['blue-600', 'dark-900']);
});

test('flags primitive references and allows semantic ones', () => {
  const primitives = new Set(['dark-900', 'blue-600']);
  const css = '.a{background:var(--dark-900);color:var(--text-primary)} .btn--dark-900{--blue-600:inherit}';
  assert.deepEqual(found(css, { extension: '.css', primitives }), ['--dark-900', '--blue-600']);
});

test('only product code is in scope', () => {
  assert.equal(inScope('src/components/Hero.astro'), true);
  assert.equal(inScope('public/site.webmanifest'), true);
  assert.equal(inScope('tokens/tokens.css'), false);
  assert.equal(inScope('docs/brand-notes.md'), false);
  assert.equal(inScope('src/assets/hero.png'), false);
});

test('scans a repo and reads primitives from the generated stylesheet', (t) => {
  const root = fixture({
    'tokens/tokens.css': ':root{--dark-900:#030303;--bg-primary:var(--dark-900)}',
    'src/styles/global.css': 'body{background:var(--bg-primary)}',
    'src/components/Bad.astro': '<div style="background:var(--dark-900)"></div>\n<style>.x{color:#fff}</style>',
    'docs/notes.md': 'The ground is #030303.',
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = checkFiles({ root });
  assert.equal(result.checked, 2);
  assert.equal(result.primitiveRuleActive, true);
  assert.deepEqual(
    result.violations.map(({ file, rule, found: literal }) => [file, rule, literal]),
    [
      ['src/components/Bad.astro', 'primitive-token', '--dark-900'],
      ['src/components/Bad.astro', 'color-literal', '#fff'],
    ],
  );
});

test('checks only the given files and ignores out-of-scope ones', (t) => {
  const root = fixture({
    'src/a.css': '.a{color:#fff}',
    'src/b.css': '.b{color:#000}',
    'README.md': 'Electric Blue is #0260FD.',
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = checkFiles({ root, files: ['src/a.css', 'README.md', 'src/missing.css'] });
  assert.equal(result.checked, 1);
  assert.equal(result.primitiveRuleActive, false);
  assert.deepEqual(result.violations.map((violation) => violation.found), ['#fff']);
});
