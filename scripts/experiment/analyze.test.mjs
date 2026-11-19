import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { analyze, render, run } from './analyze.mjs';

/** Asserts |actual - expected| <= tolerance, with both values in the message. */
function near(actual, expected, tolerance, label = '') {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label} expected ${expected} ± ${tolerance}, got ${actual}`,
  );
}

/**
 * A fabricated results file: a clear win with every guardrail comfortable. Each test changes
 * only what it is about.
 *
 *   control: 10000 exposed, 1000 signups (10%), 460 profiles (46%), 69 / 1150 failed (6%)
 *   variant: 10000 exposed, 1200 signups (12%), 540 profiles (45%), 83 / 1380 failed (6.01%)
 */
function results({ control = {}, variant = {}, period = {}, ...top } = {}) {
  return {
    experiment: 'hero_signup',
    period: { start: '2026-12-01', end: '2026-12-14', whole_weeks: 2, ...period },
    arms: {
      cta_button: {
        exposed: 10000,
        signups: 1000,
        profiles: 460,
        submitted: 1150,
        failed: 69,
        vitals_p75: { lcp_ms: 1800, inp_ms: 120, cls: 0.02 },
        ...control,
      },
      inline_email: {
        exposed: 10000,
        signups: 1200,
        profiles: 540,
        submitted: 1380,
        failed: 83,
        vitals_p75: { lcp_ms: 1850, inp_ms: 130, cls: 0.02 },
        ...variant,
      },
    },
    ...top,
  };
}

const VITALS = { lcp_ms: 1800, inp_ms: 120, cls: 0.02 };

test('a clear win: the ship row holds, and only it', () => {
  // 1000/10000 = 10% vs 1200/10000 = 12%: difference 0.02, lift 0.02 / 0.10 = +20% >= 15%.
  // Unpooled SE = √(0.10·0.90/10000 + 0.12·0.88/10000) = √(0.1956/10000) = 0.00442267
  // 95% interval = 0.02 ± 1.959964 · 0.00442267 = 0.02 ± 0.00866827 = [0.0113317, 0.0286683]
  // Pooled rate = 2200/20000 = 0.11, pooled SE = √(0.11·0.89·0.0002) = 0.00442493
  // z = 0.02 / 0.00442493 = 4.51985. Sample ratio 10000 vs 10000: χ² = 0, p = 1.
  // Guardrails: profiles 540/1200 = 45% vs 46%, (0.45 - 0.46)/0.46 = -2.17%, not below -10%;
  // failures 83/1380 = 6.0145% vs 69/1150 = 6%, +0.0145 points, not above +2; vitals all meet.
  const analysis = analyze(results());
  near(analysis.primary.control.rate, 0.1, 1e-15, 'control rate');
  near(analysis.primary.variant.rate, 0.12, 1e-15, 'variant rate');
  near(analysis.primary.absoluteDifference, 0.02, 1e-15, 'difference');
  near(analysis.primary.relativeLift, 0.2, 1e-12, 'lift');
  near(analysis.primary.interval.low, 0.0113317, 1e-7, 'interval.low');
  near(analysis.primary.interval.high, 0.0286683, 1e-7, 'interval.high');
  near(analysis.primary.z, 4.51985, 1e-5, 'z');
  assert.equal(analysis.primary.intervalExcludesZero, true);
  assert.equal(analysis.primary.reachesMde, true);
  assert.equal(analysis.primary.direction, 'up');
  assert.equal(analysis.validity.sampleRatio.chiSquare, 0);
  assert.equal(analysis.validity.sampleRatio.mismatch, false);
  assert.equal(analysis.validity.plannedSample.reached, true);
  assert.equal(analysis.validity.wholeWeeks.reached, true);
  near(analysis.guardrails[0].relativeChange, -0.0217391, 1e-7, 'profile change');
  near(analysis.guardrails[1].difference, 0.000144928, 1e-9, 'failure difference');
  assert.deepEqual(
    analysis.guardrails.map((guardrail) => guardrail.breached),
    [false, false, false],
  );
  assert.deepEqual(analysis.matchingRows, [3]);
  assert.equal(analysis.rows.length, 7, 'every row of the table is evaluated');
});

test('a lift of exactly the MDE reaches it, despite floating-point noise', () => {
  // 1150/10000 = 11.5% vs 10%: lift 0.015 / 0.10 = 0.15 (computed as 0.1499999...).
  // The interval is [0.0064169, 0.0235831] (stats.test.mjs), it excludes zero: row 3.
  const analysis = analyze(results({ variant: { signups: 1150, profiles: 520, submitted: 1320 } }));
  assert.equal(analysis.primary.reachesMde, true);
  assert.deepEqual(analysis.matchingRows, [3]);
});

test('a win below the MDE: the smaller-effect row holds', () => {
  // 1100/10000 = 11% vs 10%: difference 0.01, lift +10% < 15%.
  // Unpooled SE = √((0.09 + 0.11·0.89)/10000) = √(0.1879/10000) = 0.00433474
  // 95% interval = 0.01 ± 1.959964 · 0.00433474 = 0.01 ± 0.00849594 = [0.0015041, 0.0184959]
  // It excludes zero. Profiles 495/1100 = 45%; failures 76/1265 = 6.008%: no breach.
  const analysis = analyze(
    results({ variant: { signups: 1100, profiles: 495, submitted: 1265, failed: 76 } }),
  );
  near(analysis.primary.relativeLift, 0.1, 1e-12, 'lift');
  near(analysis.primary.interval.low, 0.0015041, 1e-7, 'interval.low');
  near(analysis.primary.interval.high, 0.0184959, 1e-7, 'interval.high');
  assert.equal(analysis.primary.reachesMde, false);
  assert.deepEqual(analysis.matchingRows, [4]);
});

test('a null result: the interval includes zero, the keep-control row holds', () => {
  // 1020/10000 = 10.2% vs 10%: difference 0.002, interval [-0.0063522, 0.0103522]
  // (stats.test.mjs), z = 0.46933, p = 0.638837. The point estimate is up, but with no
  // guardrail breached the do-not-ship row does not hold either.
  const analysis = analyze(
    results({ variant: { signups: 1020, profiles: 460, submitted: 1173, failed: 70 } }),
  );
  near(analysis.primary.interval.low, -0.0063522, 1e-7, 'interval.low');
  near(analysis.primary.interval.high, 0.0103522, 1e-7, 'interval.high');
  near(analysis.primary.pValue, 0.638837, 1e-6, 'pValue');
  assert.equal(analysis.primary.intervalExcludesZero, false);
  assert.deepEqual(analysis.matchingRows, [6]);
});

test('a loss: the interval excludes zero below it, the last row holds', () => {
  // 850/10000 = 8.5% vs 10%: difference -0.015, lift -15%.
  // Unpooled SE = √((0.09 + 0.085·0.915)/10000) = √(0.167775/10000) = 0.00409603
  // 95% interval = -0.015 ± 1.959964 · 0.00409603 = -0.015 ± 0.00802808 = [-0.0230281, -0.0069719]
  const analysis = analyze(
    results({ variant: { signups: 850, profiles: 391, submitted: 978, failed: 59 } }),
  );
  near(analysis.primary.interval.low, -0.0230281, 1e-7, 'interval.low');
  near(analysis.primary.interval.high, -0.0069719, 1e-7, 'interval.high');
  assert.equal(analysis.primary.direction, 'down');
  assert.deepEqual(analysis.matchingRows, [7]);
});

test('a sample-ratio mismatch: the invalid row holds and is listed first', () => {
  // 10000 vs 10600 on a 50/50 plan: expected 10300 per arm.
  // χ² = 2 · 300² / 10300 = 17.475728, p = 2 · (1 - Φ(√17.475728)) = 2.9100e-5 < 0.001.
  // The win (1200/10600 = 11.32%, lift +13.2%, interval [0.00478, 0.02163]) also matches
  // row 4: the mismatch row comes first, and the table is read top-down.
  const analysis = analyze(results({ variant: { exposed: 10600 } }));
  near(analysis.validity.sampleRatio.chiSquare, 17.475728, 1e-6, 'chiSquare');
  near(analysis.validity.sampleRatio.pValue, 2.91e-5, 1e-8, 'pValue');
  assert.equal(analysis.validity.sampleRatio.mismatch, true);
  assert.equal(analysis.matchingRows[0], 1);
  assert.deepEqual(analysis.matchingRows, [1, 4]);
  assert.match(render(analysis), /Sample ratio: .*MISMATCH/);
});

test('the planned sample not reached: the continue row holds', () => {
  // 6000 per arm against 6690 planned: neither arm reached it. 600 vs 720 signups is the same
  // 10% vs 12% win, which also matches row 3; the continue row comes before it.
  const small = results({
    control: { exposed: 6000, signups: 600, profiles: 276, submitted: 690, failed: 41 },
    variant: { exposed: 6000, signups: 720, profiles: 324, submitted: 828, failed: 50 },
  });
  const analysis = analyze(small);
  assert.equal(analysis.validity.plannedSample.control.reached, false);
  assert.equal(analysis.validity.plannedSample.reached, false);
  assert.equal(analysis.matchingRows[0], 2);

  // One arm short by one visitor is enough: 10001 planned, the control has 10001, the
  // variant 10000.
  const oneShort = analyze(results({ control: { exposed: 10001 } }), { plannedPerArm: 10001 });
  assert.equal(oneShort.validity.plannedSample.control.reached, true);
  assert.equal(oneShort.validity.plannedSample.variant.reached, false);
  assert.equal(oneShort.validity.plannedSample.reached, false);
  assert.ok(oneShort.matchingRows.includes(2));

  // With a planned sample of 6000 the same file is past it.
  assert.equal(analyze(small, { plannedPerArm: 6000 }).validity.plannedSample.reached, true);
});

test('fewer than two whole weeks: the continue row holds', () => {
  // 2026-12-01 to 2026-12-07 is 7 days, 1 whole week < 2.
  const analysis = analyze(results({ period: { end: '2026-12-07', whole_weeks: 1 } }));
  assert.equal(analysis.period.days, 7);
  assert.equal(analysis.validity.wholeWeeks.reached, false);
  assert.deepEqual(analysis.matchingRows, [2, 3]);
});

test('profile completion more than 10% lower, alone: the do-not-ship row holds', () => {
  // Variant 490/1200 = 40.83% vs 46%: (0.408333 - 0.46) / 0.46 = -11.23% < -10%: breached.
  const breached = analyze(results({ variant: { profiles: 490 } }));
  near(breached.guardrails[0].relativeChange, -0.1123188, 1e-7, 'relative change');
  assert.deepEqual(
    breached.guardrails.map((guardrail) => guardrail.breached),
    [true, false, false],
  );
  assert.deepEqual(breached.matchingRows, [5]);

  // 497/1200 = 41.42%: (0.414167 - 0.46) / 0.46 = -9.96%, inside the threshold.
  const inside = analyze(results({ variant: { profiles: 497 } }));
  near(inside.guardrails[0].relativeChange, -0.0996377, 1e-7, 'relative change');
  assert.equal(inside.guardrails[0].breached, false);
  assert.deepEqual(inside.matchingRows, [3]);
});

test('failures more than 2 points higher, alone: the do-not-ship row holds', () => {
  // Variant 115/1380 = 8.333% vs 69/1150 = 6%: +2.333 points > 2: breached.
  const analysis = analyze(results({ variant: { failed: 115 } }));
  near(analysis.guardrails[1].difference, 0.0233333, 1e-7, 'difference');
  assert.deepEqual(
    analysis.guardrails.map((guardrail) => guardrail.breached),
    [false, true, false],
  );
  assert.deepEqual(analysis.matchingRows, [5]);
});

test('a field target the variant misses and the control meets, alone: do not ship', () => {
  // Variant LCP 2600 ms > 2500 ms, control 1800 ms <= 2500 ms: breached.
  const analysis = analyze(
    results({ variant: { vitals_p75: { lcp_ms: 2600, inp_ms: 130, cls: 0.02 } } }),
  );
  const lcp = analysis.guardrails[2].metrics.find((metric) => metric.metric === 'lcp_ms');
  assert.deepEqual(
    { controlMeets: lcp.controlMeets, variantMeets: lcp.variantMeets, breached: lcp.breached },
    { controlMeets: true, variantMeets: false, breached: true },
  );
  assert.deepEqual(
    analysis.guardrails.map((guardrail) => guardrail.breached),
    [false, false, true],
  );
  assert.deepEqual(analysis.matchingRows, [5]);

  // CLS 0.12 misses 0.1 in the variant: the same breach on another metric.
  const cls = analyze(results({ variant: { vitals_p75: { ...VITALS, cls: 0.12 } } }));
  assert.equal(cls.guardrails[2].breached, true);
});

test('a field target the control also misses is not a breach', () => {
  // Control LCP 2700 ms and variant 2900 ms both miss 2500 ms: the variant misses nothing the
  // control meets. INP at exactly 200 ms meets its target.
  const analysis = analyze(
    results({
      control: { vitals_p75: { lcp_ms: 2700, inp_ms: 120, cls: 0.02 } },
      variant: { vitals_p75: { lcp_ms: 2900, inp_ms: 200, cls: 0.02 } },
    }),
  );
  const [lcp, inp] = analysis.guardrails[2].metrics;
  assert.equal(lcp.controlMeets, false);
  assert.equal(lcp.variantMeets, false);
  assert.equal(lcp.breached, false);
  assert.equal(inp.variantMeets, true);
  assert.equal(analysis.guardrails[2].breached, false);
  assert.deepEqual(analysis.matchingRows, [3]);
});

test('synthetic data is labelled on the first line of the text and in the first JSON key', () => {
  const note = 'Synthetic data generated for a test. Not a measurement of anything.';
  const analysis = analyze(results({ synthetic: true, note }));
  assert.equal(Object.keys(analysis)[0], 'label');
  assert.equal(analysis.label, `SYNTHETIC DATA. ${note}`);
  assert.equal(render(analysis).split('\n')[0], `SYNTHETIC DATA. ${note}`);

  // Through the command, with --json: the label is the first key of the printed object.
  const dir = mkdtempSync(join(tmpdir(), 'analyze-'));
  try {
    const file = join(dir, 'results.json');
    writeFileSync(file, JSON.stringify(results({ synthetic: true, note })));
    const { code, stdout } = run(['--results', file, '--json']);
    assert.equal(code, 0);
    assert.match(stdout, /^\{\n {2}"label": "SYNTHETIC DATA\. /);
    assert.equal(Object.keys(JSON.parse(stdout))[0], 'label');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // A file that does not say it is synthetic is not labelled synthetic.
  const unmarked = analyze(results());
  assert.equal(unmarked.synthetic, false);
  assert.doesNotMatch(render(unmarked), /SYNTHETIC/);

  // A synthetic file must explain itself.
  assert.throws(() => analyze(results({ synthetic: true })), /^RangeError: note /);
});

test('the text output follows the table order and states no verdict', () => {
  const text = render(analyze(results()));
  const order = ['Validity', 'Primary metric', 'Guardrails', 'Rows of the decision table'].map(
    (heading) => text.indexOf(`\n${heading}`),
  );
  assert.ok(
    order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])),
    `${order}`,
  );
  assert.match(text, /Row 3\. Rate up by 15% relative or more/);
  assert.doesNotMatch(text, /Decision:|Verdict/i);
});

test('a malformed file is rejected with a message that names the field', () => {
  const missing = results();
  delete missing.arms.inline_email.signups;
  assert.throws(
    () => analyze(missing),
    (error) =>
      error instanceof RangeError && error.message === 'arms.inline_email.signups is missing',
  );

  const cases = [
    [{ experiment: 'other' }, /^experiment must be "hero_signup"/],
    [{ period: { start: '2026-02-30' } }, /^period\.start must be a date/],
    [{ period: { whole_weeks: 3 } }, /^period\.whole_weeks must be an integer from 0 to/],
    [{ period: { end: '2026-11-30' } }, /^period\.end must not be before period\.start/],
    [{ control: { profiles: 1001 } }, /^arms\.cta_button\.profiles must be an integer from 0 to/],
    [{ variant: { failed: -1 } }, /^arms\.inline_email\.failed must be/],
    [
      { variant: { vitals_p75: { lcp_ms: 1 } } },
      /^arms\.inline_email\.vitals_p75\.inp_ms is missing/,
    ],
    [{ synthetic: 'yes' }, /^synthetic must be true or false/],
  ];
  for (const [change, message] of cases) {
    assert.throws(
      () => analyze(results(change)),
      (error) => error instanceof RangeError && message.test(error.message),
      JSON.stringify(change),
    );
  }
  const threeArms = results();
  threeArms.arms.third = threeArms.arms.cta_button;
  assert.throws(() => analyze(threeArms), /^RangeError: arms must have exactly two arms/);
});

test('the command: exit 2 with a one-line message for a malformed file or bad usage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'analyze-'));
  try {
    const missing = results();
    delete missing.arms.inline_email.signups;
    const malformed = join(dir, 'malformed.json');
    writeFileSync(malformed, JSON.stringify(missing));
    const notJson = join(dir, 'not.json');
    writeFileSync(notJson, '{ "synthetic": tru');

    const cases = [
      [['--results', malformed], /arms\.inline_email\.signups is missing/],
      [['--results', notJson], /not\.json is not valid JSON/],
      [['--results', join(dir, 'absent.json')], /absent\.json cannot be read/],
      [[], /--results is required/],
      [['--results', malformed, '--mde', '0'], /--mde must be a positive number/],
      [['--results', malformed, '--planned-per-arm', '10.5'], /--planned-per-arm must be/],
      [['--bogus'], /Unknown option '--bogus'/],
    ];
    for (const [argv, message] of cases) {
      const { code, stdout, stderr } = run(argv);
      assert.equal(code, 2, argv.join(' '));
      assert.equal(stdout, '');
      assert.match(stderr, /^analyze: [^\n]+\n$/, `one line for ${argv.join(' ')}`);
      assert.match(stderr, message, argv.join(' '));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the command runs on the committed synthetic fixture and exits 0', () => {
  const script = fileURLToPath(new URL('./analyze.mjs', import.meta.url));
  const fixture = fileURLToPath(
    new URL('../../docs/experiments/fixtures/hero_signup.synthetic.json', import.meta.url),
  );
  const result = spawnSync(process.execPath, [script, '--results', fixture], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^SYNTHETIC DATA\. /);
  assert.match(result.stdout, /Rows of the decision table whose conditions hold/);
});
