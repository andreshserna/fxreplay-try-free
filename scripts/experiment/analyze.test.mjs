import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { analyze, PLAN, render, run, WITHHELD } from './analyze.mjs';

/** Asserts |actual - expected| <= tolerance, with both values in the message. */
function near(actual, expected, tolerance, label = '') {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label} expected ${expected} ± ${tolerance}, got ${actual}`,
  );
}

const SCRIPT = fileURLToPath(new URL('./analyze.mjs', import.meta.url));
const FIXTURE_PATH = fileURLToPath(
  new URL('../../docs/experiments/fixtures/hero_signup.synthetic.json', import.meta.url),
);
/** The committed synthetic fixture, parsed afresh for each use. */
const fixture = () => JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

/** The fixture with some of the variant's counts replaced. */
function fixtureWith(variant) {
  const changed = fixture();
  Object.assign(changed.arms.inline_email, variant);
  return changed;
}

/**
 * The date of the analysis in these tests. The fabricated files below are not marked
 * synthetic, so their period must end by this date.
 */
const TODAY = '2026-12-31';
const analyzeAt = (results, options = {}) => analyze(results, { today: TODAY, ...options });

/**
 * A fabricated results file: a clear win with every guardrail comfortable, over 14 days. Each
 * test changes only what it is about.
 *
 *   control: 10000 exposed, 1000 signups (10%), 460 profiles (46%), 69 / 1150 failed (6%)
 *   variant: 10000 exposed, 1200 signups (12%), 540 profiles (45%), 83 / 1380 failed (6.01%)
 */
function results({ control = {}, variant = {}, period = {}, ...top } = {}) {
  return {
    experiment: 'hero_signup',
    period: { start: '2026-12-01', end: '2026-12-14', ...period },
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

/** Writes each results object to a temporary file and passes the paths to `use`. */
function withFiles(files, use) {
  const dir = mkdtempSync(join(tmpdir(), 'analyze-'));
  try {
    const paths = Object.fromEntries(
      Object.entries(files).map(([name, content]) => {
        const path = join(dir, name);
        writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
        return [name, path];
      }),
    );
    return use(paths, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a clear win: row 3 applies, and no other row holds', () => {
  // 1000/10000 = 10% vs 1200/10000 = 12%: difference 0.02, lift 0.02 / 0.10 = +20% >= 15%.
  // Unpooled SE = √(0.10·0.90/10000 + 0.12·0.88/10000) = √(0.1956/10000) = 0.00442267
  // 95% interval = 0.02 ± 1.959964 · 0.00442267 = 0.02 ± 0.00866827 = [0.0113317, 0.0286683]
  // Pooled rate = 2200/20000 = 0.11, pooled SE = √(0.11·0.89·0.0002) = 0.00442493
  // z = 0.02 / 0.00442493 = 4.51985. Sample ratio 10000 vs 10000: χ² = 0, p = 1.
  // Guardrails: profiles 540/1200 = 45% vs 46%, (0.45 - 0.46)/0.46 = -2.17%, not below -10%;
  // failures 83/1380 = 6.0145% vs 69/1150 = 6%, +0.0145 points, not above +2; vitals all meet,
  // LCP +2.78% and INP +8.33%, both within 10% of the control.
  const analysis = analyzeAt(results());
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
  assert.deepEqual(analysis.validity.wholeWeeks, {
    days: 14,
    wholeWeeks: 2,
    required: 2,
    reached: true,
  });
  near(analysis.guardrails[0].relativeChange, -0.0217391, 1e-7, 'profile change');
  near(analysis.guardrails[1].difference, 0.000144928, 1e-9, 'failure difference');
  assert.deepEqual(
    analysis.guardrails.map((guardrail) => guardrail.breached),
    [false, false, false],
  );
  assert.equal(analysis.withheld, null);
  assert.deepEqual(analysis.deviations, []);
  assert.equal(analysis.appliedRow, 3);
  assert.deepEqual(analysis.alsoHold, []);
  assert.equal(analysis.rows.length, 7, 'every row of the table is evaluated');
});

test('a lift of exactly the MDE reaches it, despite floating-point noise', () => {
  // 1150/10000 = 11.5% vs 10%: lift 0.015 / 0.10 = 0.15 (computed as 0.1499999...).
  // The interval is [0.0064169, 0.0235831] (stats.test.mjs), it excludes zero: row 3.
  const analysis = analyzeAt(
    results({ variant: { signups: 1150, profiles: 520, submitted: 1320 } }),
  );
  assert.equal(analysis.primary.reachesMde, true);
  assert.equal(analysis.appliedRow, 3);
});

test('a win below the MDE: row 4 applies', () => {
  // 1100/10000 = 11% vs 10%: difference 0.01, lift +10% < 15%.
  // Unpooled SE = √((0.09 + 0.11·0.89)/10000) = √(0.1879/10000) = 0.00433474
  // 95% interval = 0.01 ± 1.959964 · 0.00433474 = 0.01 ± 0.00849594 = [0.0015041, 0.0184959]
  // It excludes zero. Profiles 495/1100 = 45%; failures 76/1265 = 6.008%: no breach.
  const analysis = analyzeAt(
    results({ variant: { signups: 1100, profiles: 495, submitted: 1265, failed: 76 } }),
  );
  near(analysis.primary.relativeLift, 0.1, 1e-12, 'lift');
  near(analysis.primary.interval.low, 0.0015041, 1e-7, 'interval.low');
  near(analysis.primary.interval.high, 0.0184959, 1e-7, 'interval.high');
  assert.equal(analysis.primary.reachesMde, false);
  assert.equal(analysis.appliedRow, 4);
  assert.deepEqual(analysis.alsoHold, []);
});

test('row 4 is the amended one: a smaller win with a breached guardrail does not ship', () => {
  // The report's case on the fixture: the variant at 1190 signups and 480 profiles.
  // 1190/10470 = 11.366% vs 1065/10530 = 10.114%: lift +12.38%, interval +0.41 to +2.09 points.
  // Profiles 480/1190 = 40.34% vs 500/1065 = 46.95%: -14.08%, breached. In the plan's first
  // wording rows 4 and 5 both held. As amended, only row 5 does.
  const analysis = analyze(fixtureWith({ signups: 1190, profiles: 480 }));
  near(analysis.primary.relativeLift, 0.1237742, 1e-7, 'lift');
  near(analysis.primary.interval.low, 0.0041443, 1e-7, 'interval.low');
  near(analysis.primary.interval.high, 0.0208926, 1e-7, 'interval.high');
  near(analysis.guardrails[0].relativeChange, -0.1408403, 1e-7, 'profile change');
  assert.equal(analysis.guardrails[0].breached, true);
  const row4 = analysis.rows.find((row) => row.row === 4);
  assert.equal(
    row4.condition,
    'Rate up, interval excludes zero, effect below 15%, no guardrail breached',
  );
  assert.equal(row4.holds, false);
  assert.equal(analysis.appliedRow, 5);
  assert.deepEqual(analysis.alsoHold, []);
  assert.match(render(analysis), /Applies: +Row 5\. Rate up, a guardrail breached\./);
});

test('two rows hold: the first applies, the later one is listed as not applied', () => {
  // The report's case on the fixture: the variant at 1100 signups and 440 profiles.
  // 1100/10470 = 10.506% vs 10.114%: lift +3.88%, interval -0.43 to +1.21 points, so row 6
  // holds. Profiles 440/1100 = 40% vs 46.95%: -14.80%, breached, so row 5 holds too.
  const analysis = analyze(fixtureWith({ signups: 1100, profiles: 440 }));
  near(analysis.primary.relativeLift, 0.0387828, 1e-7, 'lift');
  near(analysis.primary.interval.low, -0.0043033, 1e-7, 'interval.low');
  near(analysis.primary.interval.high, 0.0121482, 1e-7, 'interval.high');
  assert.equal(analysis.appliedRow, 5);
  assert.deepEqual(analysis.alsoHold, [6]);
  const text = render(analysis);
  assert.match(
    text,
    /\n {2}Applies: +Row 5\. Rate up, a guardrail breached\. The table says: Do not ship\./,
  );
  assert.match(text, /\n {2}Also holds, not applied: +Row 6\. Interval includes zero\./);
  assert.ok(text.indexOf('Applies:') < text.indexOf('Also holds, not applied:'));
});

test('a null result: the interval includes zero, row 6 applies', () => {
  // 1020/10000 = 10.2% vs 10%: difference 0.002, interval [-0.0063522, 0.0103522]
  // (stats.test.mjs), z = 0.46933, p = 0.638837. The point estimate is up, but with no
  // guardrail breached the do-not-ship row does not hold either.
  const analysis = analyzeAt(
    results({ variant: { signups: 1020, profiles: 460, submitted: 1173, failed: 70 } }),
  );
  near(analysis.primary.interval.low, -0.0063522, 1e-7, 'interval.low');
  near(analysis.primary.interval.high, 0.0103522, 1e-7, 'interval.high');
  near(analysis.primary.pValue, 0.638837, 1e-6, 'pValue');
  assert.equal(analysis.primary.intervalExcludesZero, false);
  assert.equal(analysis.appliedRow, 6);
  assert.deepEqual(analysis.alsoHold, []);
});

test('a loss: the interval excludes zero below it, row 7 applies', () => {
  // 850/10000 = 8.5% vs 10%: difference -0.015, lift -15%.
  // Unpooled SE = √((0.09 + 0.085·0.915)/10000) = √(0.167775/10000) = 0.00409603
  // 95% interval = -0.015 ± 1.959964 · 0.00409603 = -0.015 ± 0.00802808 = [-0.0230281, -0.0069719]
  const analysis = analyzeAt(
    results({ variant: { signups: 850, profiles: 391, submitted: 978, failed: 59 } }),
  );
  near(analysis.primary.interval.low, -0.0230281, 1e-7, 'interval.low');
  near(analysis.primary.interval.high, -0.0069719, 1e-7, 'interval.high');
  assert.equal(analysis.primary.direction, 'down');
  assert.equal(analysis.appliedRow, 7);
});

test("the control is the registry's first variant, whatever order the file lists the arms in", () => {
  assert.deepEqual(PLAN.variants, ['cta_button', 'inline_email']);
  const inOrder = fixture();
  const reversed = fixture();
  reversed.arms = {
    inline_email: reversed.arms.inline_email,
    cta_button: reversed.arms.cta_button,
  };
  assert.deepEqual(Object.keys(reversed.arms), ['inline_email', 'cta_button']);
  const a = analyze(inOrder);
  const b = analyze(reversed);
  assert.deepEqual(b, a);
  assert.deepEqual(b.arms, { control: 'cta_button', variant: 'inline_email' });
  assert.equal(b.appliedRow, 3);
  near(b.primary.relativeLift, 0.2144316, 1e-7, 'lift');
});

test("arms other than the registry's variants make a malformed file, naming the arm", () => {
  const renamed = results();
  renamed.arms = { A: renamed.arms.cta_button, B: renamed.arms.inline_email };
  assert.throws(
    () => analyzeAt(renamed),
    (error) =>
      error instanceof RangeError &&
      error.message ===
        'arms.A is not a variant of hero_signup in src/lib/experiments/registry.ts (cta_button, inline_email)',
  );

  const third = results();
  third.arms.third = third.arms.cta_button;
  assert.throws(() => analyzeAt(third), /^RangeError: arms\.third is not a variant of hero_signup/);

  const one = results();
  delete one.arms.inline_email;
  assert.throws(() => analyzeAt(one), /^RangeError: arms\.inline_email is missing$/);

  withFiles({ 'renamed.json': renamed }, (paths) => {
    const { code, stdout, stderr } = run(['--results', paths['renamed.json'], '--today', TODAY]);
    assert.equal(code, 2);
    assert.equal(stdout, '');
    assert.match(stderr, /^analyze: .*renamed\.json: arms\.A is not a variant of hero_signup/);
  });
});

test('an override of the plan is printed as a deviation, and none without one', () => {
  const plain = run(['--results', FIXTURE_PATH]);
  assert.equal(plain.code, 0);
  assert.doesNotMatch(plain.stdout, /DEVIATION/);
  assert.deepEqual(JSON.parse(run(['--results', FIXTURE_PATH, '--json']).stdout).deviations, []);

  // The plan's own values, typed out, are not deviations.
  const same = run(['--results', FIXTURE_PATH, '--planned-per-arm', '6690', '--mde', '0.15']);
  assert.doesNotMatch(same.stdout, /DEVIATION/);

  const overridden = run(['--results', FIXTURE_PATH, '--planned-per-arm', '100', '--mde', '0.30']);
  assert.equal(overridden.code, 0);
  const lines = overridden.stdout.split('\n');
  assert.match(lines[0], /^SYNTHETIC DATA\. /, 'the label stays first');
  assert.equal(lines[1], 'DEVIATION FROM THE PLAN: planned sample per arm 100 instead of 6690');
  assert.equal(lines[2], 'DEVIATION FROM THE PLAN: minimum detectable effect +30% instead of +15%');

  const json = JSON.parse(
    run(['--results', FIXTURE_PATH, '--planned-per-arm', '100', '--mde', '0.30', '--json']).stdout,
  );
  assert.equal(Object.keys(json)[0], 'label');
  assert.deepEqual(json.deviations, [
    'planned sample per arm 100 instead of 6690',
    'minimum detectable effect +30% instead of +15%',
  ]);
});

test('a sample-ratio mismatch: row 1 applies, and the effect and later rows are not shown', () => {
  // The report's case: the fixture with the variant at 11200 exposed against 10530.
  // χ² = 670² / 21730 = 20.658076, p = 5.4905e-6 < 0.001.
  const analysis = analyze(fixtureWith({ exposed: 11200 }));
  near(analysis.validity.sampleRatio.chiSquare, 20.658076, 1e-6, 'chiSquare');
  near(analysis.validity.sampleRatio.pValue, 5.4905e-6, 1e-9, 'pValue');
  assert.equal(analysis.validity.sampleRatio.mismatch, true);
  assert.equal(analysis.appliedRow, 1);
  assert.deepEqual(analysis.alsoHold, []);
  assert.deepEqual(
    analysis.rows.map((row) => row.row),
    [1],
    'no row after the applied one is evaluated',
  );
  assert.equal(analysis.withheld, WITHHELD);
  assert.equal(analysis.primary, null);
  assert.equal(analysis.guardrails, null);
  assert.equal(analysis.guardrailBreached, null);

  const text = render(analysis);
  assert.match(text, /Sample ratio: .*MISMATCH/);
  assert.match(text, /Applies: +Row 1\. Sample-ratio mismatch/);
  assert.ok(text.includes(`\n${WITHHELD}\n`));
  assert.doesNotMatch(text, /Primary metric|Guardrails|Difference|Relative lift|Row [3-7]|Ship/);
});

test('an early look: row 2 applies, and the effect and later rows are not shown', () => {
  // The report's case: 7 days, with half the fixture's counts.
  const early = fixture();
  early.period.end = '2026-12-07';
  early.arms.cta_button = {
    ...early.arms.cta_button,
    exposed: 5265,
    signups: 532,
    profiles: 250,
    submitted: 623,
    failed: 42,
  };
  early.arms.inline_email = {
    ...early.arms.inline_email,
    exposed: 5235,
    signups: 643,
    profiles: 292,
    submitted: 743,
    failed: 49,
  };
  const analysis = analyze(early);
  assert.equal(analysis.validity.sampleRatio.mismatch, false);
  assert.equal(analysis.validity.plannedSample.reached, false);
  assert.equal(analysis.validity.wholeWeeks.reached, false);
  assert.equal(analysis.appliedRow, 2);
  assert.deepEqual(
    analysis.rows.map((row) => [row.row, row.holds]),
    [
      [1, false],
      [2, true],
    ],
  );
  assert.equal(analysis.primary, null);
  assert.equal(analysis.guardrails, null);

  const text = render(analysis);
  assert.match(
    text,
    /Applies: +Row 2\. Planned sample or two whole weeks not reached\. The table says: Continue\./,
  );
  assert.ok(text.includes(`\n${WITHHELD}\n`));
  assert.doesNotMatch(text, /Primary metric|Guardrails|Difference|Relative lift|Row [3-7]|Ship/);

  // In the JSON too: the effect is null, and no number from it appears anywhere.
  withFiles({ 'early.json': early }, (paths) => {
    const json = run(['--results', paths['early.json'], '--json']).stdout;
    const parsed = JSON.parse(json);
    assert.equal(parsed.primary, null);
    assert.equal(parsed.guardrails, null);
    assert.equal(parsed.withheld, WITHHELD);
    assert.doesNotMatch(json, /relativeLift|absoluteDifference|interval|"z"|profiles \//);
  });
});

test('one arm short of the planned sample is enough for row 2', () => {
  // 10001 planned, the control has 10001, the variant 10000.
  const oneShort = analyzeAt(results({ control: { exposed: 10001 } }), { plannedPerArm: 10001 });
  assert.equal(oneShort.validity.plannedSample.control.reached, true);
  assert.equal(oneShort.validity.plannedSample.variant.reached, false);
  assert.equal(oneShort.validity.plannedSample.reached, false);
  assert.equal(oneShort.appliedRow, 2);
  assert.deepEqual(oneShort.deviations, ['planned sample per arm 10001 instead of 6690']);
});

test('whole weeks come from the dates, not from what the file says', () => {
  // 2026-12-01 to 2026-12-17 is 17 days: not whole weeks, whatever whole_weeks claims.
  const seventeen = analyzeAt(results({ period: { end: '2026-12-17', whole_weeks: 2 } }));
  assert.deepEqual(seventeen.validity.wholeWeeks, {
    days: 17,
    wholeWeeks: null,
    required: 2,
    reached: false,
  });
  assert.equal(seventeen.appliedRow, 2);
  assert.match(render(seventeen), /Whole weeks: +17 days, not whole weeks; .*: not reached/);

  // 7 days is one whole week, under the floor of two.
  const seven = analyzeAt(results({ period: { end: '2026-12-07' } }));
  assert.equal(seven.validity.wholeWeeks.wholeWeeks, 1);
  assert.equal(seven.appliedRow, 2);

  // 21 days is three whole weeks; a whole_weeks of 0 in the file changes nothing.
  const twentyOne = analyzeAt(results({ period: { end: '2026-12-21', whole_weeks: 0 } }));
  assert.equal(twentyOne.validity.wholeWeeks.wholeWeeks, 3);
  assert.equal(twentyOne.validity.wholeWeeks.reached, true);
  assert.equal(twentyOne.appliedRow, 3);
});

test('a period that ends in the future is refused unless the file is marked synthetic', () => {
  const future = results({ period: { start: '2027-01-01', end: '2027-01-14' } });
  assert.throws(
    () => analyzeAt(future),
    (error) =>
      error instanceof RangeError &&
      /^period\.end is after today \(2026-12-31\)/.test(error.message),
  );
  // Ending today is not the future.
  assert.equal(analyze(results(), { today: '2026-12-14' }).appliedRow, 3);
  assert.throws(() => analyze(results(), { today: '2026-12-13' }), /period\.end is after today/);

  const synthetic = { ...future, synthetic: true, note: 'Synthetic data for a test.' };
  assert.equal(analyzeAt(synthetic).appliedRow, 3);

  assert.throws(
    () => analyze(results(), { today: '2026-13-01' }),
    /^RangeError: today must be a date/,
  );

  // Through the command: --today sets the date of the analysis.
  withFiles({ 'real.json': results() }, (paths) => {
    const before = run(['--results', paths['real.json'], '--today', '2026-12-13']);
    assert.equal(before.code, 2);
    assert.match(
      before.stderr,
      /^analyze: .*real\.json: period\.end is after today \(2026-12-13\)/,
    );
    const after = run(['--results', paths['real.json'], '--today', '2026-12-21']);
    assert.equal(after.code, 0, after.stderr);
  });
});

test('zero signups in an arm is an early state, not a malformed file', () => {
  // A first day: 50 visitors per arm, no signup yet in the control. Row 2 decides.
  const firstDay = results({
    period: { end: '2026-12-01' },
    control: { exposed: 50, signups: 0, profiles: 0, submitted: 0, failed: 0 },
    variant: { exposed: 50, signups: 3, profiles: 1, submitted: 4, failed: 0 },
  });
  const early = analyzeAt(firstDay);
  assert.equal(early.appliedRow, 2);
  assert.equal(early.primary, null);
  withFiles({ 'first-day.json': firstDay }, (paths) => {
    const { code, stderr } = run(['--results', paths['first-day.json'], '--today', TODAY]);
    assert.equal(code, 0, stderr);
  });

  // At the planned sample, no signup in the variant: the rate is down (row 7), and the
  // guardrails that divide by the variant's signups and submissions are not computable.
  const none = analyzeAt(
    results({ variant: { signups: 0, profiles: 0, submitted: 0, failed: 0 } }),
  );
  assert.equal(none.appliedRow, 7);
  const [profile, failures, speed] = none.guardrails;
  assert.deepEqual(
    [profile.computable, profile.breached, profile.variant, profile.relativeChange],
    [false, null, null, null],
  );
  assert.deepEqual(
    [failures.computable, failures.breached, failures.difference],
    [false, null, null],
  );
  assert.equal(speed.computable, true);
  assert.equal(none.guardrailBreached, null);
  const text = render(none);
  assert.match(text, /relative change not computable: not computable/);
  assert.match(text, /difference not computable: not computable/);
  assert.match(text, /Any guardrail breached: not known/);

  // No signup in the control and many in the variant: the rate is up, but "no guardrail
  // breached" cannot be established, so neither ship row holds and nothing is breached.
  const fromZero = analyzeAt(
    results({ control: { signups: 0, profiles: 0, submitted: 0, failed: 0 } }),
  );
  assert.equal(fromZero.primary.direction, 'up');
  assert.equal(fromZero.primary.relativeLift, null);
  assert.equal(fromZero.appliedRow, null);
  assert.match(render(fromZero), /No row holds\. The table does not cover this outcome\./);
});

test('profile completion more than 10% lower, alone: row 5 applies', () => {
  // Variant 490/1200 = 40.83% vs 46%: (0.408333 - 0.46) / 0.46 = -11.23% < -10%: breached.
  const breached = analyzeAt(results({ variant: { profiles: 490 } }));
  near(breached.guardrails[0].relativeChange, -0.1123188, 1e-7, 'relative change');
  assert.deepEqual(
    breached.guardrails.map((guardrail) => guardrail.breached),
    [true, false, false],
  );
  assert.equal(breached.appliedRow, 5);

  // 497/1200 = 41.42%: (0.414167 - 0.46) / 0.46 = -9.96%, inside the threshold.
  const inside = analyzeAt(results({ variant: { profiles: 497 } }));
  near(inside.guardrails[0].relativeChange, -0.0996377, 1e-7, 'relative change');
  assert.equal(inside.guardrails[0].breached, false);
  assert.equal(inside.appliedRow, 3);
});

test('failures more than 2 points higher, alone: row 5 applies', () => {
  // Variant 115/1380 = 8.333% vs 69/1150 = 6%: +2.333 points > 2: breached.
  const analysis = analyzeAt(results({ variant: { failed: 115 } }));
  near(analysis.guardrails[1].difference, 0.0233333, 1e-7, 'difference');
  assert.deepEqual(
    analysis.guardrails.map((guardrail) => guardrail.breached),
    [false, true, false],
  );
  assert.equal(analysis.appliedRow, 5);
});

test('a field target the variant misses and the control meets, alone: row 5 applies', () => {
  // Variant LCP 2600 ms > 2500 ms, control 1800 ms <= 2500 ms: breached.
  const analysis = analyzeAt(
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
  assert.equal(analysis.appliedRow, 5);

  // CLS 0.12 misses 0.1 in the variant: the same breach on another metric.
  const cls = analyzeAt(results({ variant: { vitals_p75: { ...VITALS, cls: 0.12 } } }));
  assert.equal(cls.guardrails[2].breached, true);
});

test('a speed regression of more than 10% is a breach, on either side of the target', () => {
  const lcpOf = (analysis) => analysis.guardrails[2].metrics.find((m) => m.metric === 'lcp_ms');

  // The report's case: control 2600 ms, variant 4000 ms. Both miss 2500 ms, so the target rule
  // sees nothing; the variant is +53.85% worse, a breach.
  const bothMiss = analyzeAt(
    results({
      control: { vitals_p75: { ...VITALS, lcp_ms: 2600 } },
      variant: { vitals_p75: { ...VITALS, lcp_ms: 4000 } },
    }),
  );
  near(lcpOf(bothMiss).relativeChange, 0.5384615, 1e-7, 'LCP change');
  assert.equal(lcpOf(bothMiss).controlMeets, false);
  assert.equal(lcpOf(bothMiss).regression, true);
  assert.equal(bothMiss.guardrails[2].breached, true);
  assert.equal(bothMiss.appliedRow, 5);

  // The fixture's 1800 against 1850 ms is +2.78%: not a breach.
  const close = analyzeAt(
    results({
      control: { vitals_p75: { ...VITALS, lcp_ms: 1800 } },
      variant: { vitals_p75: { ...VITALS, lcp_ms: 1850 } },
    }),
  );
  assert.equal(lcpOf(close).regression, false);
  assert.equal(close.guardrails[2].breached, false);
  assert.equal(close.appliedRow, 3);

  // The report's other case: the variant exactly at every target, the control well under.
  // Each target is met, but LCP is +38.9%, INP +66.7% and CLS +400%: a breach.
  const atTargets = analyzeAt(
    results({ variant: { vitals_p75: { lcp_ms: 2500, inp_ms: 200, cls: 0.1 } } }),
  );
  assert.deepEqual(
    atTargets.guardrails[2].metrics.map((m) => [m.variantMeets, m.regression]),
    [
      [true, true],
      [true, true],
      [true, true],
    ],
  );
  assert.equal(atTargets.appliedRow, 5);

  // The boundary: exactly 10% worse is not "more than 10%", one step past it is. 0.05 · 1.1 is
  // 0.05500000000000001 in floating point; 0.055 is still exactly 10% worse.
  const exactly = analyzeAt(
    results({
      control: { vitals_p75: { ...VITALS, lcp_ms: 2000, cls: 0.05 } },
      variant: { vitals_p75: { ...VITALS, lcp_ms: 2200, cls: 0.055 } },
    }),
  );
  assert.equal(exactly.guardrails[2].breached, false, '2200 vs 2000 ms and 0.055 vs 0.05');
  // Past 10% but under the floor of a tenth of the target (250 ms): 2201 vs 2000 is +10.05%
  // and +201 ms, not a breach. 2260 vs 2000 is +13% and +260 ms: a breach.
  const small = analyzeAt(
    results({
      control: { vitals_p75: { ...VITALS, lcp_ms: 2000 } },
      variant: { vitals_p75: { ...VITALS, lcp_ms: 2201 } },
    }),
  );
  assert.equal(lcpOf(small).breached, false);
  const past = analyzeAt(
    results({
      control: { vitals_p75: { ...VITALS, lcp_ms: 2000 } },
      variant: { vitals_p75: { ...VITALS, lcp_ms: 2260 } },
    }),
  );
  assert.equal(lcpOf(past).breached, true);

  // The reason for the floor: a control CLS of exactly 0 is common, and any shift is then
  // infinitely worse in relative terms. 0.005 against 0 is under the floor of 0.01.
  const fromZero = analyzeAt(
    results({
      control: { vitals_p75: { ...VITALS, cls: 0 } },
      variant: { vitals_p75: { ...VITALS, cls: 0.005 } },
    }),
  );
  assert.equal(fromZero.guardrails[2].breached, false);
});

test('a field target the control also misses, within 10%, is not a breach', () => {
  // Control LCP 2700 ms and variant 2900 ms both miss 2500 ms, and 2900 is +7.4%: within 10%.
  // INP at exactly 200 ms meets its target, but 200 vs 120 is +66.7%; the control is set to 190
  // here so INP is within 10% (+5.3%).
  const analysis = analyzeAt(
    results({
      control: { vitals_p75: { lcp_ms: 2700, inp_ms: 190, cls: 0.02 } },
      variant: { vitals_p75: { lcp_ms: 2900, inp_ms: 200, cls: 0.02 } },
    }),
  );
  const [lcp, inp] = analysis.guardrails[2].metrics;
  assert.equal(lcp.controlMeets, false);
  assert.equal(lcp.variantMeets, false);
  assert.equal(lcp.breached, false);
  assert.equal(inp.variantMeets, true);
  assert.equal(analysis.guardrails[2].breached, false);
  assert.equal(analysis.appliedRow, 3);
});

test('synthetic data is labelled on the first line of the text and in the first JSON key', () => {
  const note = 'Synthetic data generated for a test. Not a measurement of anything.';
  const analysis = analyzeAt(results({ synthetic: true, note }));
  assert.equal(Object.keys(analysis)[0], 'label');
  assert.equal(analysis.label, `SYNTHETIC DATA. ${note}`);
  assert.equal(render(analysis).split('\n')[0], `SYNTHETIC DATA. ${note}`);

  // Through the command, with --json: the label is the first key of the printed object.
  withFiles({ 'results.json': results({ synthetic: true, note }) }, (paths) => {
    const { code, stdout } = run(['--results', paths['results.json'], '--json']);
    assert.equal(code, 0);
    assert.match(stdout, /^\{\n {2}"label": "SYNTHETIC DATA\. /);
    assert.equal(Object.keys(JSON.parse(stdout))[0], 'label');
  });

  // A file that does not say it is synthetic is not labelled synthetic.
  const unmarked = analyzeAt(results());
  assert.equal(unmarked.synthetic, false);
  assert.doesNotMatch(render(unmarked), /SYNTHETIC/);

  // A synthetic file must explain itself.
  assert.throws(() => analyzeAt(results({ synthetic: true })), /^RangeError: note /);
});

test('the text output follows the table order and states no verdict of its own', () => {
  const text = render(analyzeAt(results()));
  const order = ['Validity', 'Primary metric', 'Guardrails', 'Decision table'].map((heading) =>
    text.indexOf(`\n${heading}`),
  );
  assert.ok(
    order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])),
    `${order}`,
  );
  assert.match(
    text,
    /Applies: +Row 3\. Rate up by 15% relative or more, 95% interval excludes zero, no guardrail breached\. The table says: Ship the variant\.\n/,
  );
  assert.doesNotMatch(text, /Decision:|Verdict/i);
});

test('a malformed file is rejected with a message that names the field', () => {
  const missing = results();
  delete missing.arms.inline_email.signups;
  assert.throws(
    () => analyzeAt(missing),
    (error) =>
      error instanceof RangeError && error.message === 'arms.inline_email.signups is missing',
  );

  const cases = [
    [{ experiment: 'other' }, /^experiment must be "hero_signup"/],
    [{ period: { start: '2026-02-30' } }, /^period\.start must be a date/],
    [{ period: { end: '2026-11-30' } }, /^period\.end must not be before period\.start/],
    [{ control: { profiles: 1001 } }, /^arms\.cta_button\.profiles must be an integer from 0 to/],
    [{ control: { exposed: 0 } }, /^arms\.cta_button\.exposed must be an integer of at least 1/],
    [{ variant: { failed: -1 } }, /^arms\.inline_email\.failed must be/],
    [
      { variant: { vitals_p75: { lcp_ms: 1 } } },
      /^arms\.inline_email\.vitals_p75\.inp_ms is missing/,
    ],
    [{ synthetic: 'yes' }, /^synthetic must be true or false/],
  ];
  for (const [change, message] of cases) {
    assert.throws(
      () => analyzeAt(results(change)),
      (error) => error instanceof RangeError && message.test(error.message),
      JSON.stringify(change),
    );
  }
});

test('the command: exit 2 with a one-line message for a malformed file or bad usage', () => {
  const missing = results();
  delete missing.arms.inline_email.signups;
  withFiles({ 'malformed.json': missing, 'not.json': '{ "synthetic": tru' }, (paths, dir) => {
    const malformed = paths['malformed.json'];
    const cases = [
      [['--results', malformed, '--today', TODAY], /arms\.inline_email\.signups is missing/],
      [['--results', paths['not.json']], /not\.json is not valid JSON/],
      [['--results', join(dir, 'absent.json')], /absent\.json cannot be read/],
      [[], /--results is required/],
      [['--results', malformed, '--mde', '0'], /--mde must be a positive number/],
      [['--results', malformed, '--planned-per-arm', '10.5'], /--planned-per-arm must be/],
      [['--results', malformed, '--today', '2026-12-1'], /--today must be a date as YYYY-MM-DD/],
      [['--bogus'], /Unknown option '--bogus'/],
    ];
    for (const [argv, message] of cases) {
      const { code, stdout, stderr } = run(argv);
      assert.equal(code, 2, argv.join(' '));
      assert.equal(stdout, '');
      assert.match(stderr, /^analyze: [^\n]+\n$/, `one line for ${argv.join(' ')}`);
      assert.match(stderr, message, argv.join(' '));
    }
  });
});

test('the command runs on the committed synthetic fixture: row 3 applies, exit 0', () => {
  const result = spawnSync(process.execPath, [SCRIPT, '--results', FIXTURE_PATH], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^SYNTHETIC DATA\. /);
  assert.doesNotMatch(result.stdout, /DEVIATION/);
  assert.match(result.stdout, /\n {2}Applies: +Row 3\. /);
  assert.doesNotMatch(result.stdout, /Also holds/);
});
