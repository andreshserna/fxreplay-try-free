#!/usr/bin/env node
/**
 * Sample size and duration for a two-arm A/B test on a conversion rate.
 *
 *   node scripts/experiment/sample-size.mjs --baseline 0.10 --mde 0.15 \
 *     [--alpha 0.05] [--power 0.8] [--daily-visitors 2000] [--json]
 *
 * `--mde` is relative: 0.15 means +15% relative, -0.1 a 10% drop. The output is meant to
 * be pasted into the experiment's spec. Exit codes: 0 done, 2 invalid usage.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { duration, sampleSizePerArm } from './stats.mjs';

const NAME = 'sample-size';

/**
 * The floor on the duration, in whole weeks, whatever the traffic: a trading audience behaves
 * differently at weekends (docs/experiments/hero_signup.md, "Sample size and duration").
 */
export const MIN_WEEKS = 2;

export const USAGE = `Usage: node scripts/experiment/sample-size.mjs --baseline <rate> --mde <relative> [options]

Visitors needed in each of two equal arms for a two-sided two-proportion z-test.

  --baseline <rate>        control conversion rate, in (0, 1), e.g. 0.10
  --mde <relative>         relative minimum detectable effect, e.g. 0.15 for +15%, -0.1 for a drop
  --alpha <level>          two-sided significance level (default 0.05)
  --power <power>          statistical power (default 0.8)
  --daily-visitors <n>     eligible visitors per day across both arms; adds the duration,
                           at least ${MIN_WEEKS} whole weeks whatever the traffic
  --json                   print one JSON object instead of text
  --help                   print this help
`;

const OPTIONS = /** @type {const} */ ({
  baseline: { type: 'string' },
  mde: { type: 'string' },
  alpha: { type: 'string' },
  power: { type: 'string' },
  'daily-visitors': { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean' },
});

/** Floating-point noise off a displayed value: 0.11499999999999999 becomes 0.115. */
const clean = (value) => Number(value.toPrecision(12));
const percent = (rate) => `${clean(rate * 100)}%`;

/**
 * @param {string} flag
 * @param {string | undefined} text
 * @returns {number | undefined}
 */
function number(flag, text) {
  if (text === undefined) return undefined;
  const value = text.trim() === '' ? NaN : Number(text);
  if (!Number.isFinite(value)) throw new RangeError(`--${flag} must be a number, got "${text}"`);
  return value;
}

/** The flag for each argument of the statistics functions, for error messages. */
const FLAG_FOR = {
  baseline: '--baseline',
  relativeMde: '--mde',
  alpha: '--alpha',
  power: '--power',
  dailyVisitors: '--daily-visitors',
};

/**
 * `--mde -0.1` reads to parseArgs as a flag followed by another flag. A value that is a
 * negative number is joined to its flag (`--mde=-0.1`) so a drop can be typed naturally.
 *
 * @param {string[]} argv
 */
function joinNegativeValues(argv) {
  const joined = [];
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index].slice(2);
    const next = argv[index + 1];
    if (OPTIONS[flag]?.type === 'string' && /^-\d|^-\.\d/.test(next ?? '')) {
      joined.push(`${argv[index]}=${next}`);
      index += 1;
    } else {
      joined.push(argv[index]);
    }
  }
  return joined;
}

/** Reads the flags into the inputs. Throws a one-line error for anything invalid. */
function parse(argv) {
  let values;
  try {
    ({ values } = parseArgs({ args: joinNegativeValues(argv), options: OPTIONS, strict: true }));
  } catch (error) {
    const message = String(error.message).split('\n')[0];
    throw new RangeError(message, { cause: error });
  }
  if (values.help) return { help: true };
  for (const flag of ['baseline', 'mde']) {
    if (values[flag] === undefined) throw new RangeError(`--${flag} is required (see --help)`);
  }
  return {
    help: false,
    json: values.json === true,
    baseline: number('baseline', values.baseline),
    relativeMde: number('mde', values.mde),
    alpha: number('alpha', values.alpha) ?? 0.05,
    power: number('power', values.power) ?? 0.8,
    dailyVisitors: number('daily-visitors', values['daily-visitors']),
  };
}

/**
 * Computes the plan for the given inputs.
 *
 * @param {{ baseline: number, relativeMde: number, alpha: number, power: number,
 *   dailyVisitors?: number }} inputs
 */
export function plan({ baseline, relativeMde, alpha, power, dailyVisitors }) {
  const perArm = sampleSizePerArm({ baseline, relativeMde, alpha, power });
  const result = {
    test: 'two-sided two-proportion z-test, two equal arms',
    baseline,
    relativeMde,
    alpha,
    power,
    controlRate: clean(baseline),
    variantRate: clean(baseline * (1 + relativeMde)),
    perArm,
    total: perArm * 2,
  };
  if (dailyVisitors === undefined) return result;
  return {
    ...result,
    dailyVisitors,
    minWeeks: MIN_WEEKS,
    ...duration({ perArm, arms: 2, dailyVisitors, minWeeks: MIN_WEEKS }),
  };
}

/** @param {ReturnType<typeof plan>} result */
export function renderText(result) {
  const sign = result.relativeMde > 0 ? '+' : '';
  const lines = [
    `Sample size: ${result.test}`,
    `  Baseline rate:      ${percent(result.baseline)}`,
    `  Minimum effect:     ${sign}${percent(result.relativeMde)} relative`,
    `  Rates compared:     ${percent(result.controlRate)} (control) vs ${percent(result.variantRate)} (variant)`,
    `  Alpha:              ${result.alpha} (two-sided)`,
    `  Power:              ${result.power}`,
    `  Visitors per arm:   ${result.perArm}`,
    `  Visitors in total:  ${result.total}`,
  ];
  if ('days' in result) {
    lines.push(
      `  Daily visitors:     ${result.dailyVisitors}`,
      `  Days needed:        ${result.days}`,
      `  Duration:           ${result.weeks} whole week${result.weeks === 1 ? '' : 's'}`,
      `  Floor:              at least ${result.minWeeks} whole weeks, whatever the traffic`,
    );
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Runs the command without touching the process, so tests can call it directly.
 *
 * @param {string[]} argv the arguments after the script name
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
export function run(argv) {
  try {
    const inputs = parse(argv);
    if (inputs.help) return { code: 0, stdout: USAGE, stderr: '' };
    const result = plan(inputs);
    const stdout = inputs.json ? `${JSON.stringify(result)}\n` : renderText(result);
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    const message = error.message.replace(/^\w+/, (name) => FLAG_FOR[name] ?? name);
    return { code: 2, stdout: '', stderr: `${NAME}: ${message}\n` };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { code, stdout, stderr } = run(process.argv.slice(2));
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = code;
}
