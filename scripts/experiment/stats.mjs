/**
 * The statistics behind the A/B experiment: sample size, duration, the result of a
 * two-proportion test and the sample-ratio check.
 *
 * Pure functions with no I/O and no dependencies. Sample sizes and results come from
 * here, never from mental arithmetic. Invalid arguments throw a RangeError that names
 * the argument.
 */

const SQRT_2PI = Math.sqrt(2 * Math.PI);

/**
 * The standard normal cumulative distribution function, Φ(z).
 *
 * Hart's double-precision rational approximation (1968, algorithm 5666) as published by
 * Graeme West, "Better approximations to cumulative normal functions" (2005), with a
 * continued fraction beyond |z| = 5√2. Absolute error is near machine precision.
 *
 * @param {number} z
 * @returns {number}
 */
export function normalCdf(z) {
  const x = Math.abs(z);
  let tail = 0;
  if (x <= 37) {
    const density = Math.exp((-x * x) / 2);
    if (x < 7.07106781186547) {
      let numerator = 3.52624965998911e-2 * x + 0.700383064443688;
      numerator = numerator * x + 6.37396220353165;
      numerator = numerator * x + 33.912866078383;
      numerator = numerator * x + 112.079291497871;
      numerator = numerator * x + 221.213596169931;
      numerator = numerator * x + 220.206867912376;
      let denominator = 8.83883476483184e-2 * x + 1.75566716318264;
      denominator = denominator * x + 16.064177579207;
      denominator = denominator * x + 86.7807322029461;
      denominator = denominator * x + 296.564248779674;
      denominator = denominator * x + 637.333633378831;
      denominator = denominator * x + 793.826512519948;
      denominator = denominator * x + 440.413735824752;
      tail = (density * numerator) / denominator;
    } else {
      let fraction = x + 0.65;
      fraction = x + 4 / fraction;
      fraction = x + 3 / fraction;
      fraction = x + 2 / fraction;
      fraction = x + 1 / fraction;
      tail = density / fraction / 2.506628274631;
    }
  }
  return z > 0 ? 1 - tail : tail;
}

// Acklam's coefficients for the inverse normal CDF.
const A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
  -3.066479806614716e1, 2.506628277459239,
];
const B = [
  -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
  -1.328068155288572e1,
];
const C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
  4.374664141464968, 2.938163982698783,
];
const D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
const P_LOW = 0.02425;

/**
 * The inverse of the standard normal CDF: the z with Φ(z) = p.
 *
 * Peter Acklam's rational approximation (relative error 1.15e-9), refined with one step
 * of Halley's method against `normalCdf`, which brings it near machine precision.
 *
 * @param {number} p a probability strictly between 0 and 1
 * @returns {number}
 * @throws {RangeError} when p is not in (0, 1)
 */
export function normalQuantile(p) {
  if (!(typeof p === 'number' && p > 0 && p < 1)) {
    throw new RangeError(`p must be a probability strictly between 0 and 1, got ${p}`);
  }
  let x;
  if (p < P_LOW) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
      ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  } else if (p <= 1 - P_LOW) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q) /
      (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
      ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  }
  // One Halley step: x - f/f' with the second-order correction, where f = Φ(x) - p.
  const error = normalCdf(x) - p;
  const u = error * SQRT_2PI * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/**
 * @param {string} name
 * @param {unknown} value
 */
function assertProbability(name, value) {
  if (!(typeof value === 'number' && value > 0 && value < 1)) {
    throw new RangeError(`${name} must be strictly between 0 and 1, got ${value}`);
  }
}

/**
 * Visitors needed in EACH of two equal arms to detect a change from `baseline` to
 * `baseline * (1 + relativeMde)` with a two-sided two-proportion z-test, unpooled variances:
 *
 *   n = (z_{1-α/2} + z_{power})² · (p1(1 - p1) + p2(1 - p2)) / (p2 - p1)², rounded up.
 *
 * @param {object} options
 * @param {number} options.baseline the control conversion rate, in (0, 1)
 * @param {number} options.relativeMde the relative minimum detectable effect: 0.15 is +15%,
 *   -0.1 is a 10% drop. Not 0, and the resulting rate must stay in (0, 1)
 * @param {number} [options.alpha] two-sided significance level, in (0, 1)
 * @param {number} [options.power] probability of detecting the effect if it is real, in (0, 1)
 * @returns {number} visitors per arm
 * @throws {RangeError} naming the invalid argument
 */
export function sampleSizePerArm({ baseline, relativeMde, alpha = 0.05, power = 0.8 }) {
  assertProbability('baseline', baseline);
  if (!(typeof relativeMde === 'number' && Number.isFinite(relativeMde) && relativeMde !== 0)) {
    throw new RangeError(`relativeMde must be a finite number other than 0, got ${relativeMde}`);
  }
  assertProbability('alpha', alpha);
  assertProbability('power', power);
  const p1 = baseline;
  const p2 = baseline * (1 + relativeMde);
  if (!(p2 > 0 && p2 < 1)) {
    throw new RangeError(
      `relativeMde ${relativeMde} moves the baseline ${baseline} to ${p2}, outside (0, 1)`,
    );
  }
  const z = normalQuantile(1 - alpha / 2) + normalQuantile(power);
  const variance = p1 * (1 - p1) + p2 * (1 - p2);
  return Math.ceil((z * z * variance) / ((p2 - p1) * (p2 - p1)));
}

/**
 * How long an experiment needs to run. Experiments run whole weeks only, so `weeks` is
 * rounded up and is at least 1.
 *
 * @param {object} options
 * @param {number} options.perArm visitors needed in each arm, a positive integer
 * @param {number} [options.arms] number of equal arms, an integer of at least 2
 * @param {number} options.dailyVisitors eligible visitors per day across all arms, positive
 * @returns {{ days: number, weeks: number }}
 * @throws {RangeError} naming the invalid argument
 */
export function duration({ perArm, arms = 2, dailyVisitors }) {
  if (!(Number.isInteger(perArm) && perArm > 0)) {
    throw new RangeError(`perArm must be a positive integer, got ${perArm}`);
  }
  if (!(Number.isInteger(arms) && arms >= 2)) {
    throw new RangeError(`arms must be an integer of at least 2, got ${arms}`);
  }
  if (!(typeof dailyVisitors === 'number' && Number.isFinite(dailyVisitors) && dailyVisitors > 0)) {
    throw new RangeError(`dailyVisitors must be a positive number, got ${dailyVisitors}`);
  }
  const days = Math.ceil((perArm * arms) / dailyVisitors);
  return { days, weeks: Math.max(1, Math.ceil(days / 7)) };
}

/**
 * @param {string} name
 * @param {{ exposed: number, converted: number }} arm
 */
function assertArm(name, arm) {
  const { exposed, converted } = arm ?? {};
  if (!(Number.isInteger(exposed) && exposed > 0)) {
    throw new RangeError(`${name}.exposed must be a positive integer, got ${exposed}`);
  }
  if (!(Number.isInteger(converted) && converted >= 0 && converted <= exposed)) {
    throw new RangeError(
      `${name}.converted must be an integer from 0 to ${name}.exposed (${exposed}), got ${converted}`,
    );
  }
}

/**
 * Compares the conversion rates of two arms.
 *
 * - `standardError` and `interval`: the unpooled standard error of the absolute difference,
 *   and the (1 - alpha) Wald interval built from it.
 * - `z` and `pValue`: the two-sided two-proportion z-test, with the pooled standard error.
 *   When both arms convert all or none of their visitors the pooled error is 0, and the
 *   test reports z = 0 and pValue = 1: there is no difference to detect.
 * - `relativeLift` is the difference over the control rate, so it is not finite when the
 *   control rate is 0.
 *
 * @param {object} options
 * @param {{ exposed: number, converted: number }} options.control
 * @param {{ exposed: number, converted: number }} options.variant
 * @param {number} [options.alpha] two-sided significance level, in (0, 1)
 * @returns {{
 *   controlRate: number, variantRate: number, absoluteDifference: number,
 *   relativeLift: number, standardError: number, z: number, pValue: number,
 *   interval: { low: number, high: number },
 * }}
 * @throws {RangeError} naming the invalid argument
 */
export function twoProportionTest({ control, variant, alpha = 0.05 }) {
  assertArm('control', control);
  assertArm('variant', variant);
  assertProbability('alpha', alpha);

  const controlRate = control.converted / control.exposed;
  const variantRate = variant.converted / variant.exposed;
  const absoluteDifference = variantRate - controlRate;

  const standardError = Math.sqrt(
    (controlRate * (1 - controlRate)) / control.exposed +
      (variantRate * (1 - variantRate)) / variant.exposed,
  );
  const margin = normalQuantile(1 - alpha / 2) * standardError;

  const pooledRate = (control.converted + variant.converted) / (control.exposed + variant.exposed);
  const pooledError = Math.sqrt(
    pooledRate * (1 - pooledRate) * (1 / control.exposed + 1 / variant.exposed),
  );
  const z = pooledError === 0 ? 0 : absoluteDifference / pooledError;

  return {
    controlRate,
    variantRate,
    absoluteDifference,
    relativeLift: absoluteDifference / controlRate,
    standardError,
    z,
    pValue: 2 * normalCdf(-Math.abs(z)),
    interval: { low: absoluteDifference - margin, high: absoluteDifference + margin },
  };
}

/**
 * Sample-ratio mismatch check for exactly two arms: Pearson's chi-square goodness-of-fit
 * test with 1 degree of freedom. With one degree of freedom the statistic is the square of
 * a standard normal, so the p-value is 2 · (1 - Φ(√χ²)).
 *
 * A mismatch means assignment or exposure is broken and the run is invalid, whatever the
 * metric shows.
 *
 * @param {object} options
 * @param {[number, number]} options.observed visitors counted in each arm
 * @param {[number, number]} [options.expectedShares] the planned allocation, positive and
 *   summing to 1
 * @param {number} [options.threshold] p-value below which the ratio is a mismatch
 * @returns {{ chiSquare: number, pValue: number, mismatch: boolean }}
 * @throws {RangeError} naming the invalid argument
 */
export function sampleRatioMismatch({ observed, expectedShares = [0.5, 0.5], threshold = 0.001 }) {
  if (!(
    Array.isArray(observed) &&
    observed.length === 2 &&
    observed.every((count) => Number.isInteger(count) && count >= 0) &&
    observed[0] + observed[1] > 0
  )) {
    throw new RangeError(
      `observed must be two non-negative integer counts with a positive total, got ${JSON.stringify(observed)}`,
    );
  }
  if (!(
    Array.isArray(expectedShares) &&
    expectedShares.length === 2 &&
    expectedShares.every((share) => typeof share === 'number' && share > 0 && share < 1) &&
    Math.abs(expectedShares[0] + expectedShares[1] - 1) < 1e-9
  )) {
    throw new RangeError(
      `expectedShares must be two shares in (0, 1) that sum to 1, got ${JSON.stringify(expectedShares)}`,
    );
  }
  assertProbability('threshold', threshold);

  const total = observed[0] + observed[1];
  let chiSquare = 0;
  for (let arm = 0; arm < 2; arm += 1) {
    const expected = total * expectedShares[arm];
    chiSquare += (observed[arm] - expected) ** 2 / expected;
  }
  // 2 · Φ(-√χ²) equals 2 · (1 - Φ(√χ²)) and keeps its precision in the far tail.
  const pValue = 2 * normalCdf(-Math.sqrt(chiSquare));
  return { chiSquare, pValue, mismatch: pValue < threshold };
}
