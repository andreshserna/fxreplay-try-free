import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  duration,
  normalCdf,
  normalQuantile,
  sampleRatioMismatch,
  sampleSizePerArm,
  twoProportionTest,
} from './stats.mjs';

/** Asserts |actual - expected| <= tolerance, with both values in the message. */
function near(actual, expected, tolerance, label = '') {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label} expected ${expected} ± ${tolerance}, got ${actual}`,
  );
}

// Reference quantiles of the standard normal, as published in standard tables and returned
// by R's qnorm and Python's statistics.NormalDist().inv_cdf (Wichura's AS241).
const Z_975 = 1.959963984540054; // two-sided alpha 0.05
const Z_80 = 0.8416212335729143; // power 0.8
const Z_995 = 2.5758293035489004; // two-sided alpha 0.01
const Z_90 = 1.2815515655446004; // power 0.9
const Z_1E6 = -4.753424308822899; // p = 1e-6, the far end of the stated accuracy range

test('normalQuantile matches published values to better than 1e-8', () => {
  near(normalQuantile(0.975), Z_975, 1e-8, 'q(0.975)');
  near(normalQuantile(0.8), Z_80, 1e-8, 'q(0.8)');
  near(normalQuantile(0.995), Z_995, 1e-8, 'q(0.995)');
  near(normalQuantile(0.9), Z_90, 1e-8, 'q(0.9)');
  near(normalQuantile(1e-6), Z_1E6, 1e-8, 'q(1e-6)');
  near(normalQuantile(1 - 1e-6), -Z_1E6, 1e-8, 'q(1 - 1e-6)');
  assert.equal(normalQuantile(0.5), 0);
});

test('normalQuantile is symmetric: q(p) = -q(1 - p)', () => {
  for (const p of [1e-6, 0.001, 0.02425, 0.05, 0.2, 0.37, 0.49]) {
    near(normalQuantile(p), -normalQuantile(1 - p), 1e-9, `p=${p}`);
  }
});

test('normalCdf inverts normalQuantile across the range and both tails', () => {
  for (const p of [1e-6, 1e-4, 0.01, 0.02425, 0.1, 0.3, 0.5, 0.7, 0.9, 0.97575, 0.99, 1 - 1e-6]) {
    near(normalCdf(normalQuantile(p)), p, 1e-12, `p=${p}`);
  }
});

test('normalCdf matches published values', () => {
  // Φ(0) = 1/2 exactly; Φ(1.959964) = 0.975 and Φ(-1) = 0.158655253931457 from standard tables.
  assert.equal(normalCdf(0), 0.5);
  near(normalCdf(Z_975), 0.975, 1e-12, 'Φ(1.96)');
  near(normalCdf(-1), 0.15865525393145707, 1e-12, 'Φ(-1)');
  assert.equal(normalCdf(-Infinity), 0);
  assert.equal(normalCdf(Infinity), 1);
});

test('normalQuantile rejects anything that is not a probability in (0, 1)', () => {
  for (const p of [0, 1, -0.1, 1.5, NaN, Infinity, '0.5', undefined]) {
    assert.throws(() => normalQuantile(p), RangeError, `p=${String(p)}`);
  }
});

// The multiplier shared by every sample size below, with alpha 0.05 and power 0.8:
//   (z_0.975 + z_0.8)² = (1.959964 + 0.841621)² = 2.801585² = 7.848880
test('sample size per arm: 10% baseline, +20% relative is 3839', () => {
  // p1 = 0.10, p2 = 0.12
  // variance = 0.10·0.90 + 0.12·0.88 = 0.09 + 0.1056 = 0.1956
  // (p2 - p1)² = 0.02² = 0.0004
  // n = 7.848880 · 0.1956 / 0.0004 = 1.535241 / 0.0004 = 3838.10, rounded up to 3839
  assert.equal(sampleSizePerArm({ baseline: 0.1, relativeMde: 0.2 }), 3839);
});

test('sample size per arm: 10% baseline, a 15% relative drop is 5853', () => {
  // p1 = 0.10, p2 = 0.10 · 0.85 = 0.085
  // variance = 0.09 + 0.085·0.915 = 0.09 + 0.077775 = 0.167775
  // (p2 - p1)² = 0.015² = 0.000225
  // n = 7.848880 · 0.167775 / 0.000225 = 1.316846 / 0.000225 = 5852.65, rounded up to 5853
  assert.equal(sampleSizePerArm({ baseline: 0.1, relativeMde: -0.15 }), 5853);
});

test('sample size per arm: 2% baseline, +25% relative is 13807', () => {
  // p1 = 0.02, p2 = 0.025
  // variance = 0.02·0.98 + 0.025·0.975 = 0.0196 + 0.024375 = 0.043975
  // (p2 - p1)² = 0.005² = 0.000025
  // n = 7.848880 · 0.043975 / 0.000025 = 7.848880 · 1759 = 13806.18, rounded up to 13807
  assert.equal(sampleSizePerArm({ baseline: 0.02, relativeMde: 0.25 }), 13807);
});

test('sample size per arm uses alpha and power: alpha 0.01 and power 0.9 on the first case', () => {
  // (z_0.995 + z_0.9)² = (2.575829 + 1.281552)² = 3.857381² = 14.879387
  // n = 14.879387 · 0.1956 / 0.0004 = 14.879387 · 489 = 7276.02, rounded up to 7277
  assert.equal(
    sampleSizePerArm({ baseline: 0.1, relativeMde: 0.2, alpha: 0.01, power: 0.9 }),
    7277,
  );
});

test('a smaller effect or more power needs more visitors', () => {
  const base = { baseline: 0.1, relativeMde: 0.2 };
  const sizes = [0.3, 0.2, 0.1, 0.05].map((relativeMde) =>
    sampleSizePerArm({ ...base, relativeMde }),
  );
  for (let i = 1; i < sizes.length; i += 1) assert.ok(sizes[i] > sizes[i - 1], `${sizes}`);

  const byPower = [0.7, 0.8, 0.9, 0.95].map((power) => sampleSizePerArm({ ...base, power }));
  for (let i = 1; i < byPower.length; i += 1) assert.ok(byPower[i] > byPower[i - 1], `${byPower}`);

  assert.ok(sampleSizePerArm({ ...base, alpha: 0.01 }) > sampleSizePerArm(base));
});

test('sampleSizePerArm rejects each invalid argument by name', () => {
  const valid = { baseline: 0.1, relativeMde: 0.2 };
  const cases = [
    [{ baseline: 0 }, /baseline/],
    [{ baseline: 1 }, /baseline/],
    [{ baseline: -0.1 }, /baseline/],
    [{ baseline: undefined }, /baseline/],
    [{ relativeMde: 0 }, /relativeMde/],
    [{ relativeMde: NaN }, /relativeMde/],
    [{ relativeMde: -1 }, /relativeMde/], // the variant rate would be 0
    [{ baseline: 0.9, relativeMde: 0.2 }, /relativeMde/], // the variant rate would be 1.08
    [{ alpha: 0 }, /alpha/],
    [{ alpha: 1 }, /alpha/],
    [{ power: 0 }, /power/],
    [{ power: 1.2 }, /power/],
  ];
  for (const [change, message] of cases) {
    assert.throws(
      () => sampleSizePerArm({ ...valid, ...change }),
      (error) => error instanceof RangeError && message.test(error.message),
      JSON.stringify(change),
    );
  }
});

test('duration: exact division, rounding up, and a one-week minimum', () => {
  // 7000 · 2 / 2000 = 7 days exactly: one week.
  assert.deepEqual(duration({ perArm: 7000, dailyVisitors: 2000 }), { days: 7, weeks: 1 });
  // 7001 · 2 / 2000 = 7.001 days: rounded up to 8 days, which is 2 whole weeks.
  assert.deepEqual(duration({ perArm: 7001, dailyVisitors: 2000 }), { days: 8, weeks: 2 });
  // 3839 · 2 / 2000 = 3.84 days: 4 days, still one whole week.
  assert.deepEqual(duration({ perArm: 3839, dailyVisitors: 2000 }), { days: 4, weeks: 1 });
  // Three arms: 5000 · 3 / 1000 = 15 days, 3 weeks.
  assert.deepEqual(duration({ perArm: 5000, arms: 3, dailyVisitors: 1000 }), {
    days: 15,
    weeks: 3,
  });
});

test('duration rejects each invalid argument by name', () => {
  const valid = { perArm: 1000, dailyVisitors: 100 };
  const cases = [
    [{ perArm: 0 }, /perArm/],
    [{ perArm: 10.5 }, /perArm/],
    [{ arms: 1 }, /arms/],
    [{ arms: 2.5 }, /arms/],
    [{ dailyVisitors: 0 }, /dailyVisitors/],
    [{ dailyVisitors: Infinity }, /dailyVisitors/],
    [{ dailyVisitors: undefined }, /dailyVisitors/],
  ];
  for (const [change, message] of cases) {
    assert.throws(
      () => duration({ ...valid, ...change }),
      (error) => error instanceof RangeError && message.test(error.message),
      JSON.stringify(change),
    );
  }
});

test('two-proportion test, worked by hand: 1000/10000 vs 1150/10000', () => {
  // controlRate = 0.10, variantRate = 0.115, difference = 0.015, lift = 0.015 / 0.10 = 0.15
  // Unpooled SE = √(0.10·0.90/10000 + 0.115·0.885/10000) = √(0.191775/10000) = 0.00437921
  // 95% interval = 0.015 ± 1.959964 · 0.00437921 = 0.015 ± 0.00858310 = [0.00641690, 0.02358310]
  // Pooled rate = 2150/20000 = 0.1075
  // Pooled SE = √(0.1075·0.8925·(1/10000 + 1/10000)) = √0.00001918875 = 0.00438050
  // z = 0.015 / 0.00438050 = 3.42427
  // p = 2 · (1 - Φ(3.42427)) = 0.000616455 (Python: 2 * (1 - NormalDist().cdf(z)))
  const result = twoProportionTest({
    control: { exposed: 10000, converted: 1000 },
    variant: { exposed: 10000, converted: 1150 },
  });
  near(result.controlRate, 0.1, 1e-15, 'controlRate');
  near(result.variantRate, 0.115, 1e-15, 'variantRate');
  near(result.absoluteDifference, 0.015, 1e-15, 'absoluteDifference');
  near(result.relativeLift, 0.15, 1e-12, 'relativeLift');
  near(result.standardError, 0.00437921, 1e-8, 'standardError');
  near(result.z, 3.42427, 1e-5, 'z');
  near(result.pValue, 2 * (1 - normalCdf(result.z)), 1e-15, 'pValue against Φ');
  near(result.pValue, 0.000616455, 1e-9, 'pValue');
  near(result.interval.low, 0.0064169, 1e-7, 'interval.low');
  near(result.interval.high, 0.0235831, 1e-7, 'interval.high');
  assert.ok(result.interval.low < result.absoluteDifference);
  assert.ok(result.interval.high > result.absoluteDifference);
  assert.ok(result.interval.low > 0, 'the interval excludes zero');
});

test('two-proportion test, a null result: 1000/10000 vs 1020/10000', () => {
  // difference = 0.002. Unpooled SE = √((0.09 + 0.102·0.898)/10000) = 0.00426141
  // 95% interval = 0.002 ± 1.959964 · 0.00426141 = 0.002 ± 0.00835221
  //              = [-0.00635221, 0.01035221]: it includes zero.
  // Pooled rate = 2020/20000 = 0.101. Pooled SE = √(0.101·0.899·0.0002) = 0.00426143
  // z = 0.002 / 0.00426143 = 0.46933. p = 2 · (1 - Φ(0.46933)) = 0.638837
  const result = twoProportionTest({
    control: { exposed: 10000, converted: 1000 },
    variant: { exposed: 10000, converted: 1020 },
  });
  near(result.interval.low, -0.0063522, 1e-7, 'interval.low');
  near(result.interval.high, 0.0103522, 1e-7, 'interval.high');
  assert.ok(result.interval.low < 0 && result.interval.high > 0, 'the interval includes zero');
  near(result.z, 0.46933, 1e-5, 'z');
  near(result.pValue, 0.638837, 1e-6, 'pValue');
});

test('two-proportion test: a larger alpha narrows the interval, and no variation gives p = 1', () => {
  const arms = {
    control: { exposed: 10000, converted: 1000 },
    variant: { exposed: 10000, converted: 1150 },
  };
  const at95 = twoProportionTest(arms).interval;
  const at90 = twoProportionTest({ ...arms, alpha: 0.1 }).interval;
  assert.ok(at90.high - at90.low < at95.high - at95.low);

  const none = twoProportionTest({
    control: { exposed: 100, converted: 0 },
    variant: { exposed: 120, converted: 0 },
  });
  assert.equal(none.z, 0);
  assert.equal(none.pValue, 1);
});

test('twoProportionTest rejects each invalid count by name', () => {
  const arm = { exposed: 100, converted: 10 };
  const cases = [
    [{ control: { exposed: 0, converted: 0 } }, /control\.exposed/],
    [{ control: { exposed: 10.5, converted: 1 } }, /control\.exposed/],
    [{ control: { exposed: 100, converted: 101 } }, /control\.converted/],
    [{ control: { exposed: 100, converted: -1 } }, /control\.converted/],
    [{ variant: { exposed: 100, converted: 1.5 } }, /variant\.converted/],
    [{ variant: undefined }, /variant\.exposed/],
    [{ alpha: 0 }, /alpha/],
    [{ alpha: 1 }, /alpha/],
  ];
  for (const [change, message] of cases) {
    assert.throws(
      () => twoProportionTest({ control: arm, variant: arm, ...change }),
      (error) => error instanceof RangeError && message.test(error.message),
      JSON.stringify(change),
    );
  }
});

test('sample ratio: an exact 50/50 split has chi-square 0 and no mismatch', () => {
  assert.deepEqual(sampleRatioMismatch({ observed: [5000, 5000] }), {
    chiSquare: 0,
    pValue: 1,
    mismatch: false,
  });
});

test('sample ratio: 5000 vs 5400 on a 50/50 plan is a mismatch', () => {
  // expected = 10400 / 2 = 5200 per arm
  // χ² = (5000 - 5200)²/5200 + (5400 - 5200)²/5200 = 2 · 40000/5200 = 15.384615
  // p = 2 · (1 - Φ(√15.384615)) = 2 · (1 - Φ(3.922323)) = 0.0000877 < 0.001
  // (Python: math.erfc(math.sqrt(chi / 2)) = 8.769942e-05)
  const result = sampleRatioMismatch({ observed: [5000, 5400] });
  near(result.chiSquare, 15.384615, 1e-6, 'chiSquare');
  near(result.pValue, 2 * (1 - normalCdf(Math.sqrt(result.chiSquare))), 1e-12, 'pValue against Φ');
  near(result.pValue, 8.769942e-5, 1e-11, 'pValue');
  assert.equal(result.mismatch, true);
});

test('sample ratio: 5000 vs 5100 is within chance', () => {
  // expected = 5050 per arm. χ² = 2 · 50²/5050 = 0.990099. p = 2 · (1 - Φ(0.995037)) = 0.3197
  const result = sampleRatioMismatch({ observed: [5000, 5100] });
  near(result.chiSquare, 0.990099, 1e-6, 'chiSquare');
  near(result.pValue, 0.319718, 1e-6, 'pValue');
  assert.equal(result.mismatch, false);
});

test('sample ratio: unequal planned shares and a custom threshold', () => {
  // A 60/40 plan with 6000 vs 4000 matches exactly.
  assert.equal(
    sampleRatioMismatch({ observed: [6000, 4000], expectedShares: [0.6, 0.4] }).chiSquare,
    0,
  );
  // 5000 vs 5100 (p = 0.32) is flagged only with a threshold above its p-value.
  assert.equal(sampleRatioMismatch({ observed: [5000, 5100], threshold: 0.5 }).mismatch, true);
});

test('sampleRatioMismatch rejects each invalid argument by name', () => {
  const cases = [
    [{ observed: [5000] }, /observed/],
    [{ observed: [1, 2, 3] }, /observed/],
    [{ observed: [5000, -1] }, /observed/],
    [{ observed: [5000, 10.5] }, /observed/],
    [{ observed: [0, 0] }, /observed/],
    [{ observed: [10, 10], expectedShares: [0.5, 0.6] }, /expectedShares/],
    [{ observed: [10, 10], expectedShares: [1, 0] }, /expectedShares/],
    [{ observed: [10, 10], expectedShares: [0.2, 0.3, 0.5] }, /expectedShares/],
    [{ observed: [10, 10], threshold: 0 }, /threshold/],
    [{ observed: [10, 10], threshold: 1 }, /threshold/],
  ];
  for (const [options, message] of cases) {
    assert.throws(
      () => sampleRatioMismatch(options),
      (error) => error instanceof RangeError && message.test(error.message),
      JSON.stringify(options),
    );
  }
});
