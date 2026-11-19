#!/usr/bin/env node
/**
 * The analysis step of the `hero_signup` experiment: the facts its pre-registered decision
 * table needs, computed from a results file, and the row of that table the plan applies.
 *
 *   node scripts/experiment/analyze.mjs --results <file> [--planned-per-arm 6690] \
 *     [--mde 0.15] [--today YYYY-MM-DD] [--json]
 *
 * The output follows the order the table is read in: validity, the primary metric, the
 * guardrails, then the table. The table is read from the top and the first row that holds
 * applies (the plan's amendment 2); later rows that also hold are listed as not applied. The
 * script prints the plan's wording of each row and no verdict of its own. When row 1 (invalid)
 * or row 2 (continue) applies, the effect is not computed or shown: the plan allows one look,
 * at the planned sample. A planned sample or effect other than the plan's is printed as a
 * deviation. Synthetic data is labelled on the first line and in the first JSON key.
 * Exit codes: 0 analysis done, whatever it shows; 2 malformed results file or invalid usage.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { sampleRatioMismatch, twoProportionTest } from './stats.mjs';

const NAME = 'analyze';
const REGISTRY = 'src/lib/experiments/registry.ts';

// The arms come from the experiment registry, the same list the edge assigns from. Node strips
// the file's types; it imports nothing.
const { EXPERIMENTS } = await import(new URL(`../../${REGISTRY}`, import.meta.url).href);

/** The plan's fixed numbers, from docs/experiments/hero_signup.md and its amendments. */
export const PLAN = Object.freeze({
  experiment: 'hero_signup',
  spec: 'docs/experiments/hero_signup.md',
  registry: REGISTRY,
  /** The registry's variants: the first is the control. */
  variants: Object.freeze([...EXPERIMENTS.hero_signup.variants]),
  /** Each arm must reach it (amendment 4). */
  plannedPerArm: 6690,
  mde: 0.15,
  alpha: 0.05,
  srmThreshold: 0.001,
  /** Whole weeks only, and at least two (amendment 3: counted from the dates). */
  minWholeWeeks: 2,
  /** Profile completion: breached if the variant is more than 10% lower, relative. */
  profileMaxRelativeDrop: 0.1,
  /** Failure rate: breached if the variant is more than 2 points higher. */
  failureMaxIncrease: 0.02,
  /** Field targets at p75. A value at the target meets it. */
  fieldTargets: Object.freeze({ lcp_ms: 2500, inp_ms: 200, cls: 0.1 }),
  /** Speed: also breached by a variant p75 more than 10% worse than the control's (amendment 8). */
  speedMaxRelativeRegression: 0.1,
  /**
   * A regression also has to be large enough to matter: a tenth of the target. Without
   * this floor, a control CLS of 0 would make any variant CLS a breach.
   */
  speedMinAbsoluteRegression: Object.freeze({ lcp_ms: 250, inp_ms: 20, cls: 0.01 }),
});

if (PLAN.variants.length !== 2) {
  throw new Error(`${REGISTRY} lists ${PLAN.variants.length} variants: this analysis is for two`);
}

/** The line printed, and stored in the JSON, in place of the effect on an early or invalid run. */
export const WITHHELD = 'The effect is not shown: the plan allows one look, at the planned sample.';

const VITAL_LABEL = { lcp_ms: 'LCP', inp_ms: 'INP', cls: 'CLS' };
const VITAL_UNIT = { lcp_ms: ' ms', inp_ms: ' ms', cls: '' };

export const USAGE = `Usage: node scripts/experiment/analyze.mjs --results <file> [options]

The facts the decision table of ${PLAN.spec} needs, and the row the plan applies.

  --results <file>          results file: experiment, period, and one entry per variant of
                            ${PLAN.experiment} in ${REGISTRY} (${PLAN.variants.join(', ')})
  --planned-per-arm <n>     planned visitors per arm (default ${PLAN.plannedPerArm}; any other value
                            is printed as a deviation from the plan)
  --mde <relative>          minimum detectable effect, relative (default ${PLAN.mde}; any other
                            value is printed as a deviation from the plan)
  --today <YYYY-MM-DD>      the date of the analysis, in UTC (default: today)
  --json                    print one JSON object instead of text
  --help                    print this help
`;

const OPTIONS = /** @type {const} */ ({
  results: { type: 'string' },
  'planned-per-arm': { type: 'string' },
  mde: { type: 'string' },
  today: { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean' },
});

/** Floating-point noise off a value before it is compared with a threshold. */
const clean = (value) => Number(value.toPrecision(12));

/** Today's date in UTC, as YYYY-MM-DD. */
const todayUtc = () => new Date().toISOString().slice(0, 10);

// --- Reading the results file ------------------------------------------------------------

/** @param {string} path @param {string} problem */
function fail(path, problem) {
  throw new RangeError(`${path} ${problem}`);
}

/** @param {unknown} value @param {string} path */
function object(value, path) {
  if (value === undefined) fail(path, 'is missing');
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, `must be an object, got ${JSON.stringify(value)}`);
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {number} min
 * @param {[number, string]} [max] the upper bound and the field it comes from
 */
function integer(value, path, min, max) {
  if (value === undefined) fail(path, 'is missing');
  const inRange = Number.isInteger(value) && value >= min && (max === undefined || value <= max[0]);
  if (!inRange) {
    const range = max === undefined ? `of at least ${min}` : `from ${min} to ${max[1]} (${max[0]})`;
    fail(path, `must be an integer ${range}, got ${JSON.stringify(value)}`);
  }
  return /** @type {number} */ (value);
}

/** @param {unknown} value @param {string} path */
function nonNegative(value, path) {
  if (value === undefined) fail(path, 'is missing');
  if (!(typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
    fail(path, `must be a non-negative number, got ${JSON.stringify(value)}`);
  }
  return /** @type {number} */ (value);
}

/** @param {unknown} value @param {string} path @returns {number} days since the epoch */
function date(value, path) {
  if (value === undefined) fail(path, 'is missing');
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const time = match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : NaN;
  if (!match || new Date(time).toISOString().slice(0, 10) !== value) {
    fail(path, `must be a date as YYYY-MM-DD, got ${JSON.stringify(value)}`);
  }
  return time / 86_400_000;
}

/**
 * One arm's counts. Zero signups or submissions is a valid early state, not a malformed file:
 * the guardrails that would divide by them are reported as not computable.
 *
 * @param {unknown} value
 * @param {string} path
 */
function arm(value, path) {
  const raw = object(value, path);
  const exposed = integer(raw.exposed, `${path}.exposed`, 1);
  const signups = integer(raw.signups, `${path}.signups`, 0, [exposed, `${path}.exposed`]);
  const profiles = integer(raw.profiles, `${path}.profiles`, 0, [signups, `${path}.signups`]);
  const submitted = integer(raw.submitted, `${path}.submitted`, 0);
  const failed = integer(raw.failed, `${path}.failed`, 0, [submitted, `${path}.submitted`]);
  const vitals = object(raw.vitals_p75, `${path}.vitals_p75`);
  const vitalsP75 = {};
  for (const key of Object.keys(PLAN.fieldTargets)) {
    vitalsP75[key] = nonNegative(vitals[key], `${path}.vitals_p75.${key}`);
  }
  return { exposed, signups, profiles, submitted, failed, vitalsP75 };
}

/**
 * Checks a parsed results file and returns its fields in one shape. Throws a RangeError that
 * names the first field that is missing or wrong.
 *
 * - The arms are exactly the registry's variants, in any order. The control is the registry's
 *   first variant, never whichever arm the file lists first.
 * - The days and the whole weeks come from `period.start` and `period.end` (end inclusive).
 *   `period.whole_weeks`, if present, is a claim and is ignored.
 * - A file not marked synthetic cannot end after `today`.
 *
 * @param {unknown} results
 * @param {string} today YYYY-MM-DD
 */
function read(results, today) {
  const raw = object(results, 'results');
  if (raw.synthetic !== undefined && typeof raw.synthetic !== 'boolean') {
    fail('synthetic', `must be true or false, got ${JSON.stringify(raw.synthetic)}`);
  }
  const synthetic = raw.synthetic === true;
  if (synthetic && !(typeof raw.note === 'string' && raw.note.trim() !== '')) {
    fail('note', 'must say what the synthetic data is when synthetic is true');
  }
  if (raw.experiment === undefined) fail('experiment', 'is missing');
  if (raw.experiment !== PLAN.experiment) {
    fail(
      'experiment',
      `must be "${PLAN.experiment}": this analysis encodes the plan in ${PLAN.spec}, got ${JSON.stringify(raw.experiment)}`,
    );
  }

  const period = object(raw.period, 'period');
  const startDay = date(period.start, 'period.start');
  const endDay = date(period.end, 'period.end');
  if (endDay < startDay) fail('period.end', `must not be before period.start (${period.start})`);
  if (!synthetic && endDay > date(today, 'today')) {
    fail(
      'period.end',
      `is after today (${today}): results not marked synthetic cannot come from the future`,
    );
  }
  const days = endDay - startDay + 1;
  const wholeWeeks = days % 7 === 0 ? days / 7 : null;

  const arms = object(raw.arms, 'arms');
  const unexpected = Object.keys(arms).find((name) => !PLAN.variants.includes(name));
  if (unexpected !== undefined) {
    fail(
      `arms.${unexpected}`,
      `is not a variant of ${PLAN.experiment} in ${REGISTRY} (${PLAN.variants.join(', ')})`,
    );
  }
  const [controlName, variantName] = PLAN.variants;
  return {
    synthetic,
    note: typeof raw.note === 'string' ? raw.note : null,
    experiment: PLAN.experiment,
    period: { start: String(period.start), end: String(period.end), days, wholeWeeks },
    control: { name: controlName, ...arm(arms[controlName], `arms.${controlName}`) },
    variant: { name: variantName, ...arm(arms[variantName], `arms.${variantName}`) },
  };
}

// --- The analysis ------------------------------------------------------------------------

/**
 * The rows of the plan's decision table, in its order, in its wording (row 4 as amended), with
 * the condition each one tests. Rows 1 and 2 need only the validity facts.
 *
 * "No guardrail breached" holds only when every guardrail could be computed and none is
 * breached; "a guardrail breached" holds when one is.
 *
 * @param {number} mde
 */
function decisionRows(mde) {
  const mdeText = `${clean(mde * 100)}%`;
  return [
    {
      row: 1,
      condition: `Sample-ratio mismatch: chi-square p below ${PLAN.srmThreshold} on exposed visitors per arm`,
      decision: 'Invalid. Fix assignment or exposure, then rerun.',
      holds: (facts) => facts.sampleRatioMismatch,
    },
    {
      row: 2,
      condition: 'Planned sample or two whole weeks not reached',
      decision: 'Continue.',
      holds: (facts) => !facts.plannedSampleReached || !facts.wholeWeeksReached,
    },
    {
      row: 3,
      condition: `Rate up by ${mdeText} relative or more, 95% interval excludes zero, no guardrail breached`,
      decision: 'Ship the variant.',
      holds: (facts) =>
        facts.up && facts.reachesMde && facts.intervalExcludesZero && facts.guardrailsClear,
    },
    {
      row: 4,
      condition: `Rate up, interval excludes zero, effect below ${mdeText}, no guardrail breached`,
      decision: 'Ship the variant: it is better, by less than planned for.',
      holds: (facts) =>
        facts.up && !facts.reachesMde && facts.intervalExcludesZero && facts.guardrailsClear,
    },
    {
      row: 5,
      condition: 'Rate up, a guardrail breached',
      decision: 'Do not ship. Redesign and rerun.',
      holds: (facts) => facts.up && facts.guardrailBreached,
    },
    {
      row: 6,
      condition: 'Interval includes zero',
      decision: 'Keep the control. The question is closed at this sensitivity.',
      holds: (facts) => !facts.intervalExcludesZero,
    },
    {
      row: 7,
      condition: 'Rate down, interval excludes zero',
      decision: 'Keep the control.',
      holds: (facts) => facts.down && facts.intervalExcludesZero,
    },
  ];
}

/** @param {number} numerator @param {number} denominator */
const ratioOf = (numerator, denominator) => (denominator > 0 ? numerator / denominator : null);

/**
 * The primary metric and the guardrails. Only computed when the look is allowed.
 *
 * @param {ReturnType<typeof read>} data
 * @param {number} mde
 */
function effect({ control, variant }, mde) {
  const test = twoProportionTest({
    control: { exposed: control.exposed, converted: control.signups },
    variant: { exposed: variant.exposed, converted: variant.signups },
    alpha: PLAN.alpha,
  });
  const intervalExcludesZero = test.interval.low > 0 || test.interval.high < 0;
  const up = test.absoluteDifference > 0;
  const down = test.absoluteDifference < 0;
  // From a control rate of 0 the lift is infinite (it reaches any effect) or undefined.
  const reachesMde = clean(test.relativeLift) >= mde;

  const primary = {
    metric: 'signup rate',
    measure: 'signups / exposed visitors',
    test: 'two-sided two-proportion z-test',
    control: { signups: control.signups, exposed: control.exposed, rate: test.controlRate },
    variant: { signups: variant.signups, exposed: variant.exposed, rate: test.variantRate },
    absoluteDifference: test.absoluteDifference,
    interval: { level: 1 - PLAN.alpha, ...test.interval },
    intervalExcludesZero,
    relativeLift: Number.isFinite(test.relativeLift) ? test.relativeLift : null,
    z: test.z,
    pValue: test.pValue,
    mde,
    reachesMde,
    direction: up ? 'up' : down ? 'down' : 'none',
  };

  const profileControl = ratioOf(control.profiles, control.signups);
  const profileVariant = ratioOf(variant.profiles, variant.signups);
  const profileChange =
    profileControl !== null && profileControl > 0 && profileVariant !== null
      ? (profileVariant - profileControl) / profileControl
      : null;
  const profile = {
    name: 'profile completion',
    measure: 'profiles / signups',
    threshold: `breached if the variant is more than ${clean(PLAN.profileMaxRelativeDrop * 100)}% lower, relative`,
    control: profileControl,
    variant: profileVariant,
    relativeChange: profileChange,
    computable: profileChange !== null,
    breached: profileChange === null ? null : clean(profileChange) < -PLAN.profileMaxRelativeDrop,
  };

  const failureControl = ratioOf(control.failed, control.submitted);
  const failureVariant = ratioOf(variant.failed, variant.submitted);
  const failureDifference =
    failureControl !== null && failureVariant !== null ? failureVariant - failureControl : null;
  const failures = {
    name: 'failure rate',
    measure: 'failed / submitted, invalid_email excluded',
    threshold: `breached if the variant is more than ${clean(PLAN.failureMaxIncrease * 100)} points higher`,
    control: failureControl,
    variant: failureVariant,
    difference: failureDifference,
    computable: failureDifference !== null,
    breached:
      failureDifference === null ? null : clean(failureDifference) > PLAN.failureMaxIncrease,
  };

  const metrics = Object.entries(PLAN.fieldTargets).map(([metric, target]) => {
    const controlValue = control.vitalsP75[metric];
    const variantValue = variant.vitalsP75[metric];
    const controlMeets = controlValue <= target;
    const variantMeets = variantValue <= target;
    const regression =
      clean(variantValue) > clean(controlValue * (1 + PLAN.speedMaxRelativeRegression)) &&
      clean(variantValue - controlValue) > PLAN.speedMinAbsoluteRegression[metric];
    return {
      metric,
      target,
      control: controlValue,
      variant: variantValue,
      controlMeets,
      variantMeets,
      relativeChange: controlValue > 0 ? (variantValue - controlValue) / controlValue : null,
      regression,
      breached: (controlMeets && !variantMeets) || regression,
    };
  });
  const speed = {
    name: 'field targets',
    measure: 'p75 of LCP, INP and CLS',
    threshold: `breached if the variant misses a field target that the control meets, or is more than ${clean(PLAN.speedMaxRelativeRegression * 100)}% worse than the control and by more than a tenth of the target`,
    metrics,
    computable: true,
    breached: metrics.some((metric) => metric.breached),
  };

  const guardrails = [profile, failures, speed];
  const guardrailBreached = guardrails.some((guardrail) => guardrail.breached === true);
  const guardrailsClear = guardrails.every((guardrail) => guardrail.breached === false);
  return {
    primary,
    guardrails,
    // true: one is breached; false: all computed and none breached; null: not known.
    guardrailBreached: guardrailBreached ? true : guardrailsClear ? false : null,
    facts: { up, down, reachesMde, intervalExcludesZero, guardrailBreached, guardrailsClear },
  };
}

/**
 * Computes every fact the decision table needs from a results object, and the row it applies.
 *
 * @param {unknown} results a parsed results file (see synthetic.mjs for the shape)
 * @param {{ plannedPerArm?: number, mde?: number, today?: string }} [options] `today` is the
 *   date of the analysis as YYYY-MM-DD (default: today in UTC)
 * @returns a plain object whose first key, `label`, says whether the data is synthetic
 * @throws {RangeError} naming the invalid option or the first malformed field
 */
export function analyze(
  results,
  { plannedPerArm = PLAN.plannedPerArm, mde = PLAN.mde, today = todayUtc() } = {},
) {
  if (!(Number.isInteger(plannedPerArm) && plannedPerArm > 0)) {
    throw new RangeError(`plannedPerArm must be a positive integer, got ${plannedPerArm}`);
  }
  if (!(typeof mde === 'number' && Number.isFinite(mde) && mde > 0)) {
    throw new RangeError(`mde must be a positive number, got ${mde}`);
  }
  date(today, 'today');
  const data = read(results, today);
  const { control, variant } = data;

  const deviations = [];
  if (plannedPerArm !== PLAN.plannedPerArm) {
    deviations.push(`planned sample per arm ${plannedPerArm} instead of ${PLAN.plannedPerArm}`);
  }
  if (mde !== PLAN.mde) {
    deviations.push(
      `minimum detectable effect +${clean(mde * 100)}% instead of +${clean(PLAN.mde * 100)}%`,
    );
  }

  // Validity: rows 1 and 2.
  const ratio = sampleRatioMismatch({
    observed: [control.exposed, variant.exposed],
    threshold: PLAN.srmThreshold,
  });
  const plannedSample = {
    perArm: plannedPerArm,
    control: { exposed: control.exposed, reached: control.exposed >= plannedPerArm },
    variant: { exposed: variant.exposed, reached: variant.exposed >= plannedPerArm },
  };
  const plannedSampleReached = plannedSample.control.reached && plannedSample.variant.reached;
  const wholeWeeksReached =
    data.period.wholeWeeks !== null && data.period.wholeWeeks >= PLAN.minWholeWeeks;
  const validityFacts = {
    sampleRatioMismatch: ratio.mismatch,
    plannedSampleReached,
    wholeWeeksReached,
  };

  // The table, from the top. If row 1 or row 2 applies, the look stops there: the effect is
  // never computed, and no later row is evaluated.
  const table = decisionRows(mde);
  const stopAt = table.slice(0, 2).find((row) => row.holds(validityFacts));
  const measured = stopAt === undefined ? effect(data, mde) : null;
  const evaluated = stopAt === undefined ? table : table.slice(0, stopAt.row);
  const facts = { ...validityFacts, ...measured?.facts };
  const rows = evaluated.map(({ row, condition, decision, holds }) => ({
    row,
    condition,
    decision,
    holds: holds(facts),
  }));
  const holding = rows.filter((row) => row.holds).map((row) => row.row);

  return {
    label: data.synthetic
      ? `SYNTHETIC DATA. ${data.note}`
      : 'Results not marked synthetic. This script cannot verify where they came from.',
    deviations,
    synthetic: data.synthetic,
    note: data.note,
    experiment: data.experiment,
    spec: PLAN.spec,
    arms: { control: control.name, variant: variant.name },
    period: data.period,
    validity: {
      sampleRatio: {
        observed: [control.exposed, variant.exposed],
        expectedShares: [0.5, 0.5],
        chiSquare: ratio.chiSquare,
        pValue: ratio.pValue,
        threshold: PLAN.srmThreshold,
        mismatch: ratio.mismatch,
      },
      plannedSample: { ...plannedSample, reached: plannedSampleReached },
      wholeWeeks: {
        days: data.period.days,
        wholeWeeks: data.period.wholeWeeks,
        required: PLAN.minWholeWeeks,
        reached: wholeWeeksReached,
      },
    },
    withheld: measured === null ? WITHHELD : null,
    primary: measured?.primary ?? null,
    guardrails: measured?.guardrails ?? null,
    guardrailBreached: measured?.guardrailBreached ?? null,
    rows,
    appliedRow: holding[0] ?? null,
    alsoHold: holding.slice(1),
  };
}

// --- The text output ---------------------------------------------------------------------

const percent = (rate) => `${(rate * 100).toFixed(2)}%`;
const signed = (text, value) => (value > 0 ? `+${text}` : text);
const points = (difference) => signed(`${(difference * 100).toFixed(2)}`, difference);
const probability = (p) => (p >= 0.0001 ? p.toFixed(4) : p.toExponential(2));
const yesNo = (value, yes, no) => (value ? yes : no);
const NOT_COMPUTABLE = 'not computable';

/** @param {ReturnType<typeof analyze>} analysis */
function renderEffect(analysis) {
  const { arms, primary, guardrails } = analysis;
  const [profile, failures, speed] = guardrails;
  const reached = (value) => yesNo(value, 'reached', 'not reached');
  const breached = (value) =>
    value === null ? NOT_COMPUTABLE : yesNo(value, 'BREACHED', 'not breached');
  const rate = (value) => (value === null ? NOT_COMPUTABLE : percent(value));
  const lift =
    primary.relativeLift === null
      ? `${NOT_COMPUTABLE} (control rate 0)`
      : signed(percent(primary.relativeLift), primary.relativeLift);

  return [
    `Primary metric: ${primary.metric} (${primary.measure})`,
    `  ${`${arms.control}:`.padEnd(19)}${primary.control.signups} / ${primary.control.exposed} = ${percent(primary.control.rate)}`,
    `  ${`${arms.variant}:`.padEnd(19)}${primary.variant.signups} / ${primary.variant.exposed} = ${percent(primary.variant.rate)}`,
    `  Difference:        ${points(primary.absoluteDifference)} points; ${primary.interval.level * 100}% interval ${points(primary.interval.low)} to ${points(primary.interval.high)} points: ${yesNo(primary.intervalExcludesZero, 'excludes zero', 'includes zero')}`,
    `  Relative lift:     ${lift}; minimum detectable effect +${clean(primary.mde * 100)}%: ${reached(primary.reachesMde)}`,
    `  Test:              ${primary.test}, z ${primary.z.toFixed(3)}, p ${probability(primary.pValue)}`,
    '',
    'Guardrails',
    `  Profile completion (${profile.measure}), ${profile.threshold}`,
    `    ${arms.control} ${rate(profile.control)}, ${arms.variant} ${rate(profile.variant)}, relative change ${profile.relativeChange === null ? NOT_COMPUTABLE : signed(percent(profile.relativeChange), profile.relativeChange)}: ${breached(profile.breached)}`,
    `  Failure rate (${failures.measure}), ${failures.threshold}`,
    `    ${arms.control} ${rate(failures.control)}, ${arms.variant} ${rate(failures.variant)}, difference ${failures.difference === null ? NOT_COMPUTABLE : `${points(failures.difference)} points`}: ${breached(failures.breached)}`,
    `  Field targets (${speed.measure}), ${speed.threshold}`,
    ...speed.metrics.map((metric) => {
      const unit = VITAL_UNIT[metric.metric];
      const meets = (value) => yesNo(value, 'meets', 'misses');
      const change =
        metric.relativeChange === null
          ? ''
          : `, ${signed(percent(metric.relativeChange), metric.relativeChange)}`;
      return `    ${VITAL_LABEL[metric.metric]} target ${metric.target}${unit}: ${arms.control} ${metric.control}${unit} (${meets(metric.controlMeets)}), ${arms.variant} ${metric.variant}${unit} (${meets(metric.variantMeets)}${change}): ${breached(metric.breached)}`;
    }),
    `  Any guardrail breached: ${analysis.guardrailBreached === null ? 'not known, a guardrail is not computable' : yesNo(analysis.guardrailBreached, 'yes', 'no')}`,
  ];
}

/** @param {ReturnType<typeof analyze>} analysis */
export function render(analysis) {
  const { arms, validity } = analysis;
  const ratio = validity.sampleRatio;
  const planned = validity.plannedSample;
  const weeks = validity.wholeWeeks;
  const reached = (value) => yesNo(value, 'reached', 'not reached');
  const weeksText =
    weeks.wholeWeeks === null
      ? `${weeks.days} days, not whole weeks`
      : `${weeks.days} days, ${weeks.wholeWeeks} whole week${weeks.wholeWeeks === 1 ? '' : 's'}`;

  const lines = [
    analysis.label,
    ...analysis.deviations.map((deviation) => `DEVIATION FROM THE PLAN: ${deviation}`),
    `Experiment ${analysis.experiment} (${analysis.spec}). Control: ${arms.control}. Variant: ${arms.variant}.`,
    `Period: ${analysis.period.start} to ${analysis.period.end}, ${analysis.period.days} days.`,
    '',
    'Validity',
    `  Sample ratio:      ${ratio.observed[0]} vs ${ratio.observed[1]} exposed visitors, planned 50/50; chi-square ${ratio.chiSquare.toFixed(3)}, p ${probability(ratio.pValue)}; mismatch if p < ${ratio.threshold}: ${yesNo(ratio.mismatch, 'MISMATCH', 'no mismatch')}`,
    `  Planned sample:    ${planned.perArm} per arm; ${arms.control} ${planned.control.exposed} (${reached(planned.control.reached)}), ${arms.variant} ${planned.variant.exposed} (${reached(planned.variant.reached)})`,
    `  Whole weeks:       ${weeksText}; whole weeks only, at least ${weeks.required}: ${reached(weeks.reached)}`,
    '',
    ...(analysis.withheld === null ? renderEffect(analysis) : [analysis.withheld]),
    '',
    `Decision table (${analysis.spec}), read from the top: the first row that holds applies`,
  ];
  const byNumber = new Map(analysis.rows.map((row) => [row.row, row]));
  const describe = (number) => {
    const row = byNumber.get(number);
    return `Row ${row.row}. ${row.condition}. The table says: ${row.decision}`;
  };
  if (analysis.appliedRow === null) {
    lines.push('  No row holds. The table does not cover this outcome.');
  } else {
    lines.push(`  Applies:                  ${describe(analysis.appliedRow)}`);
  }
  for (const number of analysis.alsoHold) {
    lines.push(`  Also holds, not applied:  ${describe(number)}`);
  }
  if (analysis.withheld !== null) {
    lines.push(`  Rows after row ${analysis.appliedRow} are not evaluated: the look stops here.`);
  }
  lines.push(
    '',
    "This script computes the facts and reads the table as the plan says. Checking the inputs and explaining the result is the analyst's step.",
  );
  return `${lines.join('\n')}\n`;
}

// --- The command -------------------------------------------------------------------------

/**
 * @param {string} flag
 * @param {string | undefined} text
 */
function number(flag, text) {
  if (text === undefined) return undefined;
  const value = text.trim() === '' ? NaN : Number(text);
  if (!Number.isFinite(value)) throw new RangeError(`--${flag} must be a number, got "${text}"`);
  return value;
}

/** Reads the flags. Throws a one-line RangeError for anything invalid. */
function parse(argv) {
  let values;
  try {
    ({ values } = parseArgs({ args: argv, options: OPTIONS, strict: true }));
  } catch (error) {
    throw new RangeError(String(error.message).split('\n')[0], { cause: error });
  }
  if (values.help) return { help: true };
  if (values.results === undefined) throw new RangeError('--results is required (see --help)');
  const plannedPerArm = number('planned-per-arm', values['planned-per-arm']) ?? PLAN.plannedPerArm;
  if (!(Number.isInteger(plannedPerArm) && plannedPerArm > 0)) {
    throw new RangeError(`--planned-per-arm must be a positive integer, got ${plannedPerArm}`);
  }
  const mde = number('mde', values.mde) ?? PLAN.mde;
  if (!(mde > 0)) throw new RangeError(`--mde must be a positive number, got ${mde}`);
  const today = values.today ?? todayUtc();
  date(today, '--today');
  return {
    help: false,
    json: values.json === true,
    file: values.results,
    plannedPerArm,
    mde,
    today,
  };
}

/**
 * Runs the command without touching the process, so tests can call it directly.
 *
 * @param {string[]} argv the arguments after the script name
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
export function run(argv) {
  const failure = (message) => ({ code: 2, stdout: '', stderr: `${NAME}: ${message}\n` });
  let inputs;
  try {
    inputs = parse(argv);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return failure(error.message);
  }
  if (inputs.help) return { code: 0, stdout: USAGE, stderr: '' };

  let results;
  try {
    results = JSON.parse(readFileSync(inputs.file, 'utf8'));
  } catch (error) {
    const reason = error instanceof SyntaxError ? 'is not valid JSON' : 'cannot be read';
    return failure(`${inputs.file} ${reason}: ${String(error.message).split('\n')[0]}`);
  }
  try {
    const { plannedPerArm, mde, today } = inputs;
    const analysis = analyze(results, { plannedPerArm, mde, today });
    const stdout = inputs.json ? `${JSON.stringify(analysis, null, 2)}\n` : render(analysis);
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return failure(`${inputs.file}: ${error.message}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { code, stdout, stderr } = run(process.argv.slice(2));
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = code;
}
