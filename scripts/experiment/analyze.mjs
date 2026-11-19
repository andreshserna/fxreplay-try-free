#!/usr/bin/env node
/**
 * The analysis step of the `hero_signup` experiment: the facts its pre-registered decision
 * table needs, computed from a results file, and the rows of that table whose conditions hold.
 *
 *   node scripts/experiment/analyze.mjs --results <file> [--planned-per-arm 6690] \
 *     [--mde 0.15] [--json]
 *
 * The output follows the order the table is read in: validity, the primary metric, the
 * guardrails, then the matching rows. It states facts and does not choose a row: the first
 * row that holds is the plan's rule, and applying and explaining it is the experiment
 * analyst's step. Synthetic data is labelled on the first line and in the first JSON key.
 * Exit codes: 0 analysis done, whatever it shows; 2 malformed results file or invalid usage.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { sampleRatioMismatch, twoProportionTest } from './stats.mjs';

const NAME = 'analyze';

/** The plan's fixed numbers, from docs/experiments/hero_signup.md. */
export const PLAN = Object.freeze({
  experiment: 'hero_signup',
  spec: 'docs/experiments/hero_signup.md',
  plannedPerArm: 6690,
  mde: 0.15,
  alpha: 0.05,
  srmThreshold: 0.001,
  minWholeWeeks: 2,
  /** Profile completion: breached if the variant is more than 10% lower, relative. */
  profileMaxRelativeDrop: 0.1,
  /** Failure rate: breached if the variant is more than 2 points higher. */
  failureMaxIncrease: 0.02,
  /** Field targets at p75. A value at the target meets it. */
  fieldTargets: Object.freeze({ lcp_ms: 2500, inp_ms: 200, cls: 0.1 }),
});

const VITAL_LABEL = { lcp_ms: 'LCP', inp_ms: 'INP', cls: 'CLS' };
const VITAL_UNIT = { lcp_ms: ' ms', inp_ms: ' ms', cls: '' };

export const USAGE = `Usage: node scripts/experiment/analyze.mjs --results <file> [options]

The facts the decision table of ${PLAN.spec} needs, and the rows whose conditions hold.

  --results <file>          results file: experiment, period and two arms, the control first
  --planned-per-arm <n>     planned visitors per arm (default ${PLAN.plannedPerArm})
  --mde <relative>          minimum detectable effect, relative (default ${PLAN.mde})
  --json                    print one JSON object instead of text
  --help                    print this help
`;

const OPTIONS = /** @type {const} */ ({
  results: { type: 'string' },
  'planned-per-arm': { type: 'string' },
  mde: { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean' },
});

/** Floating-point noise off a value before it is compared with a threshold. */
const clean = (value) => Number(value.toPrecision(12));

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

/** @param {unknown} value @param {string} path */
function arm(value, path) {
  const raw = object(value, path);
  const exposed = integer(raw.exposed, `${path}.exposed`, 1);
  const signups = integer(raw.signups, `${path}.signups`, 1, [exposed, `${path}.exposed`]);
  const profiles = integer(raw.profiles, `${path}.profiles`, 0, [signups, `${path}.signups`]);
  const submitted = integer(raw.submitted, `${path}.submitted`, 1);
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
 * Signups and submissions must be at least 1 per arm: a guardrail divides by each.
 *
 * @param {unknown} results
 */
function read(results) {
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
  const days = endDay - startDay + 1;
  const wholeWeeks = integer(period.whole_weeks, 'period.whole_weeks', 0, [
    Math.floor(days / 7),
    `the ${days} days from period.start to period.end, in whole weeks`,
  ]);

  const arms = object(raw.arms, 'arms');
  const names = Object.keys(arms);
  if (names.length !== 2) {
    fail('arms', `must have exactly two arms, the control first, got ${names.length}`);
  }
  return {
    synthetic,
    note: typeof raw.note === 'string' ? raw.note : null,
    experiment: PLAN.experiment,
    period: { start: String(period.start), end: String(period.end), days, wholeWeeks },
    control: { name: names[0], ...arm(arms[names[0]], `arms.${names[0]}`) },
    variant: { name: names[1], ...arm(arms[names[1]], `arms.${names[1]}`) },
  };
}

// --- The analysis ------------------------------------------------------------------------

/**
 * The rows of the plan's decision table, in its order, with the condition each one tests.
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
      condition: `Planned sample or ${PLAN.minWholeWeeks} whole weeks not reached`,
      decision: 'Continue.',
      holds: (facts) => !facts.plannedSampleReached || !facts.wholeWeeksReached,
    },
    {
      row: 3,
      condition: `Rate up by ${mdeText} relative or more, 95% interval excludes zero, no guardrail breached`,
      decision: 'Ship the variant.',
      holds: (facts) =>
        facts.up && facts.reachesMde && facts.intervalExcludesZero && !facts.guardrailBreached,
    },
    {
      row: 4,
      condition: `Rate up, interval excludes zero, effect below ${mdeText}, no guardrail breached`,
      decision: 'Ship the variant: it is better, by less than planned for.',
      holds: (facts) =>
        facts.up && !facts.reachesMde && facts.intervalExcludesZero && !facts.guardrailBreached,
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

/**
 * Computes every fact the decision table needs from a results object.
 *
 * @param {unknown} results a parsed results file (see synthetic.mjs for the shape)
 * @param {{ plannedPerArm?: number, mde?: number }} [options]
 * @returns a plain object whose first key, `label`, says whether the data is synthetic
 * @throws {RangeError} naming the invalid option or the first malformed field
 */
export function analyze(results, { plannedPerArm = PLAN.plannedPerArm, mde = PLAN.mde } = {}) {
  if (!(Number.isInteger(plannedPerArm) && plannedPerArm > 0)) {
    throw new RangeError(`plannedPerArm must be a positive integer, got ${plannedPerArm}`);
  }
  if (!(typeof mde === 'number' && Number.isFinite(mde) && mde > 0)) {
    throw new RangeError(`mde must be a positive number, got ${mde}`);
  }
  const data = read(results);
  const { control, variant } = data;

  // Validity.
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
  const wholeWeeksReached = data.period.wholeWeeks >= PLAN.minWholeWeeks;

  // The primary metric.
  const test = twoProportionTest({
    control: { exposed: control.exposed, converted: control.signups },
    variant: { exposed: variant.exposed, converted: variant.signups },
    alpha: PLAN.alpha,
  });
  const intervalExcludesZero = test.interval.low > 0 || test.interval.high < 0;
  const up = test.absoluteDifference > 0;
  const down = test.absoluteDifference < 0;
  const reachesMde = clean(test.relativeLift) >= mde;

  // The guardrails.
  const profileControl = control.profiles / control.signups;
  const profileVariant = variant.profiles / variant.signups;
  const profileChange = (profileVariant - profileControl) / profileControl;
  const profile = {
    name: 'profile completion',
    measure: 'profiles / signups',
    threshold: `breached if the variant is more than ${clean(PLAN.profileMaxRelativeDrop * 100)}% lower, relative`,
    control: profileControl,
    variant: profileVariant,
    relativeChange: profileChange,
    breached: clean(profileChange) < -PLAN.profileMaxRelativeDrop,
  };

  const failureControl = control.failed / control.submitted;
  const failureVariant = variant.failed / variant.submitted;
  const failures = {
    name: 'failure rate',
    measure: 'failed / submitted, invalid_email excluded',
    threshold: `breached if the variant is more than ${clean(PLAN.failureMaxIncrease * 100)} points higher`,
    control: failureControl,
    variant: failureVariant,
    difference: failureVariant - failureControl,
    breached: clean(failureVariant - failureControl) > PLAN.failureMaxIncrease,
  };

  const metrics = Object.entries(PLAN.fieldTargets).map(([metric, target]) => {
    const controlMeets = control.vitalsP75[metric] <= target;
    const variantMeets = variant.vitalsP75[metric] <= target;
    return {
      metric,
      target,
      control: control.vitalsP75[metric],
      variant: variant.vitalsP75[metric],
      controlMeets,
      variantMeets,
      breached: controlMeets && !variantMeets,
    };
  });
  const speed = {
    name: 'field targets',
    measure: 'p75 of LCP, INP and CLS',
    threshold: 'breached if the variant misses a field target that the control meets',
    metrics,
    breached: metrics.some((metric) => metric.breached),
  };

  const guardrails = [profile, failures, speed];
  const guardrailBreached = guardrails.some((guardrail) => guardrail.breached);

  const facts = {
    sampleRatioMismatch: ratio.mismatch,
    plannedSampleReached,
    wholeWeeksReached,
    up,
    down,
    reachesMde,
    intervalExcludesZero,
    guardrailBreached,
  };
  const rows = decisionRows(mde).map(({ row, condition, decision, holds }) => ({
    row,
    condition,
    decision,
    holds: holds(facts),
  }));

  return {
    label: data.synthetic
      ? `SYNTHETIC DATA. ${data.note}`
      : 'Results not marked synthetic. This script cannot verify where they came from.',
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
        observed: data.period.wholeWeeks,
        required: PLAN.minWholeWeeks,
        reached: wholeWeeksReached,
      },
    },
    primary: {
      metric: 'signup rate',
      measure: 'signups / exposed visitors',
      test: 'two-sided two-proportion z-test',
      control: { signups: control.signups, exposed: control.exposed, rate: test.controlRate },
      variant: { signups: variant.signups, exposed: variant.exposed, rate: test.variantRate },
      absoluteDifference: test.absoluteDifference,
      interval: { level: 1 - PLAN.alpha, ...test.interval },
      intervalExcludesZero,
      relativeLift: test.relativeLift,
      z: test.z,
      pValue: test.pValue,
      mde,
      reachesMde,
      direction: up ? 'up' : down ? 'down' : 'none',
    },
    guardrails,
    guardrailBreached,
    rows,
    matchingRows: rows.filter((row) => row.holds).map((row) => row.row),
  };
}

// --- The text output ---------------------------------------------------------------------

const percent = (rate) => `${(rate * 100).toFixed(2)}%`;
const signed = (text, value) => (value > 0 ? `+${text}` : text);
const points = (difference) => signed(`${(difference * 100).toFixed(2)}`, difference);
const probability = (p) => (p >= 0.0001 ? p.toFixed(4) : p.toExponential(2));
const yesNo = (value, yes, no) => (value ? yes : no);

/** @param {ReturnType<typeof analyze>} analysis */
export function render(analysis) {
  const { arms, validity, primary, guardrails } = analysis;
  const [profile, failures, speed] = guardrails;
  const ratio = validity.sampleRatio;
  const planned = validity.plannedSample;
  const reached = (value) => yesNo(value, 'reached', 'not reached');
  const breached = (value) => yesNo(value, 'BREACHED', 'not breached');

  const lines = [
    analysis.label,
    `Experiment ${analysis.experiment} (${analysis.spec}). Control: ${arms.control}. Variant: ${arms.variant}.`,
    `Period: ${analysis.period.start} to ${analysis.period.end}, ${analysis.period.days} days.`,
    '',
    'Validity',
    `  Sample ratio:      ${ratio.observed[0]} vs ${ratio.observed[1]} exposed visitors, planned 50/50; chi-square ${ratio.chiSquare.toFixed(3)}, p ${probability(ratio.pValue)}; mismatch if p < ${ratio.threshold}: ${yesNo(ratio.mismatch, 'MISMATCH', 'no mismatch')}`,
    `  Planned sample:    ${planned.perArm} per arm; ${arms.control} ${planned.control.exposed} (${reached(planned.control.reached)}), ${arms.variant} ${planned.variant.exposed} (${reached(planned.variant.reached)})`,
    `  Whole weeks:       ${validity.wholeWeeks.observed}, at least ${validity.wholeWeeks.required} required: ${reached(validity.wholeWeeks.reached)}`,
    '',
    `Primary metric: ${primary.metric} (${primary.measure})`,
    `  ${`${arms.control}:`.padEnd(19)}${primary.control.signups} / ${primary.control.exposed} = ${percent(primary.control.rate)}`,
    `  ${`${arms.variant}:`.padEnd(19)}${primary.variant.signups} / ${primary.variant.exposed} = ${percent(primary.variant.rate)}`,
    `  Difference:        ${points(primary.absoluteDifference)} points; ${primary.interval.level * 100}% interval ${points(primary.interval.low)} to ${points(primary.interval.high)} points: ${yesNo(primary.intervalExcludesZero, 'excludes zero', 'includes zero')}`,
    `  Relative lift:     ${signed(percent(primary.relativeLift), primary.relativeLift)}; minimum detectable effect +${clean(primary.mde * 100)}%: ${reached(primary.reachesMde)}`,
    `  Test:              ${primary.test}, z ${primary.z.toFixed(3)}, p ${probability(primary.pValue)}`,
    '',
    'Guardrails',
    `  Profile completion (${profile.measure}), ${profile.threshold}`,
    `    ${arms.control} ${percent(profile.control)}, ${arms.variant} ${percent(profile.variant)}, relative change ${signed(percent(profile.relativeChange), profile.relativeChange)}: ${breached(profile.breached)}`,
    `  Failure rate (${failures.measure}), ${failures.threshold}`,
    `    ${arms.control} ${percent(failures.control)}, ${arms.variant} ${percent(failures.variant)}, difference ${points(failures.difference)} points: ${breached(failures.breached)}`,
    `  Field targets (${speed.measure}), ${speed.threshold}`,
    ...speed.metrics.map((metric) => {
      const unit = VITAL_UNIT[metric.metric];
      const meets = (value) => yesNo(value, 'meets', 'misses');
      return `    ${VITAL_LABEL[metric.metric]} target ${metric.target}${unit}: ${arms.control} ${metric.control}${unit} (${meets(metric.controlMeets)}), ${arms.variant} ${metric.variant}${unit} (${meets(metric.variantMeets)}): ${breached(metric.breached)}`;
    }),
    `  Any guardrail breached: ${yesNo(analysis.guardrailBreached, 'yes', 'no')}`,
    '',
    `Rows of the decision table whose conditions hold (${analysis.spec}, in the table's order)`,
  ];
  const matching = analysis.rows.filter((row) => row.holds);
  if (matching.length === 0) lines.push('  None. The table does not cover this outcome.');
  for (const row of matching) {
    lines.push(`  Row ${row.row}. ${row.condition}. The table says: ${row.decision}`);
  }
  lines.push(
    '',
    "This script states facts and which rows hold. Applying the table is the analyst's step.",
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
  return { help: false, json: values.json === true, file: values.results, plannedPerArm, mde };
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
    const analysis = analyze(results, { plannedPerArm: inputs.plannedPerArm, mde: inputs.mde });
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
