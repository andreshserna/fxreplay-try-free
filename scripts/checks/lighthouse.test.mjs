import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assign, EXPERIMENTS } from '../../src/lib/experiments/registry.ts';
import {
  BUDGETS,
  EXPERIMENT,
  calibratedSlowdown,
  contributors,
  extract,
  findVisitorIds,
  judge,
  median,
  medianIndex,
  render,
  summarize,
} from './lighthouse.mjs';

/** A run that meets every budget, with room to spare. */
const GOOD = {
  lcp: 1500,
  cls: 0.01,
  tbt: 50,
  performance: 99,
  accessibility: 100,
  bestPractices: 100,
  seo: 100,
};

const resultOf = (rows, metric) => rows.find((row) => row.metric === metric).result;
const failing = (rows) => rows.filter((row) => row.result === 'fail').map((row) => row.metric);

test('the median of an odd number of runs is the middle value', () => {
  assert.equal(median([2400, 1800, 1900]), 1900);
  assert.equal(medianIndex([2400, 1800, 1900]), 2);
});

test('the median of an even number of runs averages the two middle values', () => {
  assert.equal(median([10, 40, 20, 30]), 25);
  // The report kept for an even count is the lower middle run.
  assert.equal(medianIndex([10, 40, 20, 30]), 2);
});

test('summarize takes the median of every metric across the runs', () => {
  const runs = [
    { ...GOOD, lcp: 2100, tbt: 10, performance: 90 },
    { ...GOOD, lcp: 1700, tbt: 300, performance: 97 },
    { ...GOOD, lcp: 1900, tbt: 90, performance: 96 },
  ];
  assert.deepEqual(summarize(runs), { ...GOOD, lcp: 1900, tbt: 90, performance: 96 });
});

test('a value exactly on each budget passes', () => {
  const onBudget = {
    lcp: 2000,
    cls: 0.05,
    tbt: 150,
    performance: 95,
    accessibility: 100,
    bestPractices: 100,
    seo: 100,
  };
  assert.deepEqual(failing(judge(onBudget, BUDGETS, { seo: true })), []);
});

test('each budget fails on its own', () => {
  const misses = {
    lcp: 2001,
    cls: 0.051,
    tbt: 151,
    performance: 94,
    accessibility: 99,
    bestPractices: 96,
    seo: 92,
  };
  for (const [metric, value] of Object.entries(misses)) {
    const rows = judge({ ...GOOD, [metric]: value }, BUDGETS, { seo: true });
    assert.deepEqual(failing(rows), [metric], `${metric} = ${value}`);
  }
});

test('SEO is reported but not judged without --seo, and the output says why', () => {
  const rows = judge({ ...GOOD, seo: 61 }, BUDGETS);
  assert.equal(resultOf(rows, 'seo'), 'not judged');
  assert.deepEqual(failing(rows), []);
  const text = render(rows);
  assert.match(text, /^SEO\s+61\s+= 100\s+not judged$/m);
  assert.match(text, /noindex/);
  assert.match(text, /--seo/);
});

test('SEO is judged with --seo', () => {
  assert.equal(resultOf(judge({ ...GOOD, seo: 61 }, BUDGETS, { seo: true }), 'seo'), 'fail');
  assert.equal(resultOf(judge(GOOD, BUDGETS, { seo: true }), 'seo'), 'pass');
});

test('TBT is judged on four cores or more, and only reported below that', () => {
  const slow = { ...GOOD, tbt: 190 };
  assert.equal(resultOf(judge(slow, BUDGETS, { cores: 12 }), 'tbt'), 'fail');
  assert.equal(resultOf(judge(slow, BUDGETS, { cores: 4 }), 'tbt'), 'fail');
  assert.equal(resultOf(judge(slow, BUDGETS), 'tbt'), 'fail');

  const rows = judge(slow, BUDGETS, { cores: 2 });
  assert.equal(resultOf(rows, 'tbt'), 'not judged');
  assert.deepEqual(failing(rows), []);
  assert.match(render(rows), /TBT is reported, not judged: this host has 2 core\(s\)/);

  // Every other budget still fails on two cores.
  assert.deepEqual(failing(judge({ ...slow, lcp: 2400 }, BUDGETS, { cores: 2 })), ['lcp']);
});

test('the table shows a passing and a failing row', () => {
  const budgets = { lcp: BUDGETS.lcp, tbt: BUDGETS.tbt };
  const rows = judge({ lcp: 1234.2, tbt: 312 }, budgets);
  assert.equal(
    render(rows),
    [
      'Metric   Median  Budget      Result',
      'LCP     1235 ms  <= 2000 ms  pass',
      'TBT      312 ms  <= 150 ms   FAIL',
    ].join('\n'),
  );
});

test('the table rounds against the budget, never in its favor', () => {
  const rows = judge(
    { lcp: 2000.4, cls: 0.0501, performance: 94.5 },
    {
      lcp: BUDGETS.lcp,
      cls: BUDGETS.cls,
      performance: BUDGETS.performance,
    },
  );
  assert.deepEqual(
    rows.map((row) => [row.shown, row.result]),
    [
      ['2001 ms', 'fail'],
      ['0.051', 'fail'],
      ['94', 'fail'],
    ],
  );
});

test('every arm gets a fixed visitor id that the registry assigns to it', () => {
  const { variants } = EXPERIMENTS[EXPERIMENT];
  const arms = findVisitorIds(assign, EXPERIMENT, variants);
  assert.deepEqual(
    arms.map(([variant]) => variant),
    [...variants],
  );
  for (const [variant, id] of arms) {
    assert.match(id, /^lighthouse-\d+$/);
    assert.equal(assign(EXPERIMENT, id), variant);
  }
  assert.deepEqual(findVisitorIds(assign, EXPERIMENT, variants), arms);
});

test('extract reads the judged values from a report and refuses an incomplete one', () => {
  const lhr = {
    audits: {
      'largest-contentful-paint': { numericValue: 1800 },
      'cumulative-layout-shift': { numericValue: 0.02 },
      'total-blocking-time': { numericValue: 40 },
    },
    categories: {
      performance: { score: 0.97 },
      accessibility: { score: 1 },
      'best-practices': { score: 1 },
      seo: { score: 0.69 },
    },
  };
  const values = extract(lhr);
  assert.equal(values.lcp, 1800);
  assert.equal(Math.round(values.performance), 97);
  assert.equal(values.seo, 69);
  assert.throws(
    () => extract({ ...lhr, categories: { ...lhr.categories, seo: { score: null } } }),
    /no seo score/,
  );
});

test('contributors lists the LCP element and its phases, and the top three scripts', () => {
  const lhr = {
    audits: {
      'lcp-breakdown-insight': {
        details: {
          type: 'list',
          items: [
            {
              type: 'table',
              items: [
                { subpart: 'timeToFirstByte', label: 'Time to first byte', duration: 600 },
                { subpart: 'elementRenderDelay', label: 'Element render delay', duration: 900 },
              ],
            },
            { type: 'node', selector: 'main > h1' },
          ],
        },
      },
      'bootup-time': {
        details: {
          items: [
            { url: 'a.js', total: 120.4 },
            { url: 'b.js', total: 80 },
            { url: 'c.js', total: 30 },
            { url: 'd.js', total: 10 },
          ],
        },
      },
    },
  };
  assert.deepEqual(contributors(lhr), [
    'LCP element: main > h1',
    'LCP phases: Element render delay 900 ms, Time to first byte 600 ms',
    'Main-thread time by script (bootup-time):',
    '  120 ms  a.js',
    '  80 ms  b.js',
    '  30 ms  c.js',
  ]);
  assert.deepEqual(contributors({ audits: {} }), []);
});

test('the slowdown is 4x on the reference host and scales with the host elsewhere', () => {
  assert.equal(calibratedSlowdown(1750), 4);
  // A slower runner needs less slowdown to simulate the same phone, a faster laptop more.
  assert.equal(calibratedSlowdown(1300), 3);
  assert.equal(calibratedSlowdown(2800), 6.4);
});

test('the slowdown stays within what Lighthouse lists, and falls back to its default', () => {
  assert.equal(calibratedSlowdown(100), 1);
  assert.equal(calibratedSlowdown(9000), 10);
  assert.equal(calibratedSlowdown(undefined), 4);
  assert.equal(calibratedSlowdown(Number.NaN), 4);
});
