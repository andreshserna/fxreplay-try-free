import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import {
  ANALYTICS_REGISTRY,
  DOCS_FILE,
  EXPERIMENTS_REGISTRY,
  describeType,
  escapeCell,
  renderContext,
  renderEvents,
  renderExperiments,
  replaceRegion,
  run,
} from './analytics-docs.mjs';

const EVENTS = {
  page_viewed: {
    source: 'client',
    trigger: 'Once per load.',
    decision: 'Whether traffic is worth buying.',
    properties: {},
  },
  thing_done: {
    source: 'server',
    trigger: 'A row is committed.',
    decision: 'The conversion.',
    properties: {
      kind: { type: 'enum', values: ['a', 'b'], description: 'Which kind.' },
      tries: { type: 'integer', min: 1, max: 5, optional: true, description: 'How many.' },
    },
  },
};
const CONTEXT = {
  event_id: { type: 'id', description: 'Unique per event.' },
  page_path: { type: 'path', optional: true, description: 'The page.' },
};
const EXPERIMENTS = {
  hero_test: { variants: ['control', 'bold'], enabled: true, spec: 'docs/experiments/hero.md' },
  old_test: { variants: ['a', 'b', 'c'], enabled: false, spec: 'docs/experiments/old.md' },
};

const EMPTY_DOC = [
  '# Plan',
  '',
  'Hand-written intro.',
  '',
  '<!-- events:start -->',
  '<!-- events:end -->',
  '',
  'Between the regions.',
  '',
  '<!-- context:start -->',
  '<!-- context:end -->',
  '',
  '<!-- experiments:start -->',
  '<!-- experiments:end -->',
  '',
  'Closing prose.',
  '',
].join('\n');

const tableRows = (text) => text.split('\n').filter((line) => line.startsWith('| '));

test('the events table has one row per event in registry order, with plain-word types', () => {
  const rows = tableRows(renderEvents({ EVENTS }));
  assert.deepEqual(rows, [
    '| Event | Fires | Trigger | Properties | Decision it informs |',
    '| --- | --- | --- | --- | --- |',
    '| `page_viewed` | browser | Once per load. | none | Whether traffic is worth buying. |',
    '| `thing_done` | server | A row is committed. | `kind`: `a`, `b`<br>`tries`: integer, 1 to 5, optional | The conversion. |',
  ]);
});

test('each region says where it is generated from and by which command', () => {
  const first = (text) => text.split('\n')[0];
  assert.match(
    first(renderEvents({ EVENTS })),
    /^<!-- Generated from src\/lib\/analytics\/registry\.ts by `npm run gen`/,
  );
  assert.match(first(renderContext({ CONTEXT })), /src\/lib\/analytics\/registry\.ts/);
  assert.match(first(renderExperiments({ EXPERIMENTS })), /src\/lib\/experiments\/registry\.ts/);
});

test('the context table lists each field with its type and meaning', () => {
  assert.deepEqual(tableRows(renderContext({ CONTEXT })).slice(2), [
    '| `event_id` | opaque id | Unique per event. |',
    '| `page_path` | site path, optional | The page. |',
  ]);
});

test('the experiments table shows the control, the status and a link relative to docs/', () => {
  assert.deepEqual(tableRows(renderExperiments({ EXPERIMENTS })), [
    '| Key | Control | Variants | Status | Plan |',
    '| --- | --- | --- | --- | --- |',
    '| `hero_test` | `control` | `control`, `bold` | assigning | [experiments/hero.md](experiments/hero.md) |',
    '| `old_test` | `a` | `a`, `b`, `c` | off | [experiments/old.md](experiments/old.md) |',
  ]);
});

test('types read in plain words, and an unknown type is an error', () => {
  assert.equal(describeType({ type: 'number', min: 0, max: 1 }), 'number, 0 to 1');
  assert.equal(describeType({ type: 'boolean', optional: true }), 'boolean, optional');
  assert.equal(describeType({ type: 'label' }), 'label (lowercase slug)');
  assert.throws(() => describeType({ type: 'string' }), /Unknown property type "string"/);
});

test('a pipe in cell text is escaped so it cannot split a column', () => {
  assert.equal(escapeCell('a | b'), 'a \\| b');
  const events = { x_done: { ...EVENTS.page_viewed, trigger: 'Either A | B.' } };
  const [, , row] = tableRows(renderEvents({ EVENTS: events }));
  assert.equal(
    row,
    '| `x_done` | browser | Either A \\| B. | none | Whether traffic is worth buying. |',
  );
});

test('replacing a region leaves the text outside the markers untouched', () => {
  const once = replaceRegion(EMPTY_DOC, 'context', 'NEW');
  assert.equal(
    once,
    EMPTY_DOC.replace(
      '<!-- context:start -->\n<!-- context:end -->',
      '<!-- context:start -->\nNEW\n\n<!-- context:end -->',
    ),
  );
  const again = replaceRegion(once, 'context', 'NEWER');
  assert.equal(again, once.replace('NEW\n', 'NEWER\n'));
});

test('a missing marker is an error that names it', () => {
  const noStart = EMPTY_DOC.replace('<!-- events:start -->\n', '');
  assert.throws(() => replaceRegion(noStart, 'events', 'x'), /<!-- events:start -->/);
  const noEnd = EMPTY_DOC.replace('<!-- experiments:end -->', '');
  assert.throws(() => replaceRegion(noEnd, 'experiments', 'x'), /<!-- experiments:end -->/);
});

function repository(t, document = EMPTY_DOC) {
  const root = mkdtempSync(join(tmpdir(), 'analytics-docs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, content) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  };
  write('package.json', '{ "type": "module" }');
  write(
    ANALYTICS_REGISTRY,
    `export const EVENTS: Record<string, unknown> = ${JSON.stringify(EVENTS)};\nexport const CONTEXT = ${JSON.stringify(CONTEXT)};\n`,
  );
  write(EXPERIMENTS_REGISTRY, `export const EXPERIMENTS = ${JSON.stringify(EXPERIMENTS)};\n`);
  write(DOCS_FILE, document);
  return { root, read: () => readFileSync(join(root, DOCS_FILE), 'utf8') };
}

const quietly = async (t, action) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  return action();
};

test('--check fails on stale tables and changes nothing', async (t) => {
  const { root, read } = repository(t);
  assert.equal(await quietly(t, () => run(['--check'], { root })), 1);
  assert.equal(read(), EMPTY_DOC);
});

test('writing fills every region, keeps the prose, and then --check passes', async (t) => {
  const { root, read } = repository(t);
  assert.equal(await quietly(t, () => run([], { root })), 0);
  const written = read();
  for (const prose of ['Hand-written intro.', 'Between the regions.', 'Closing prose.']) {
    assert.ok(written.includes(prose), prose);
  }
  assert.ok(written.includes('| `thing_done` | server |'));
  assert.ok(written.includes('| `page_path` | site path, optional |'));
  assert.ok(written.includes('| `old_test` | `a` |'));
  assert.equal(await quietly(t, () => run(['--check'], { root })), 0);
  assert.equal(await quietly(t, () => run([], { root })), 0);
  assert.equal(read(), written);
});

test('a document without a region marker is an error, in either mode', async (t) => {
  const { root, read } = repository(t, EMPTY_DOC.replace('<!-- context:end -->', ''));
  await assert.rejects(run(['--check'], { root }), /<!-- context:end -->/);
  await assert.rejects(run([], { root }), /<!-- context:end -->/);
  assert.equal(read(), EMPTY_DOC.replace('<!-- context:end -->', ''));
});
