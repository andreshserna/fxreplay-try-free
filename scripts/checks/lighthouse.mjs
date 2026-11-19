#!/usr/bin/env node
/**
 * Lighthouse budget check.
 *
 * Audits the landing page of a running preview once per arm of the `hero_signup`
 * experiment and fails when a lab budget from invariant 7 is missed. Run it after
 * `npm run preview`.
 *
 *   node scripts/checks/lighthouse.mjs            3 runs per arm, SEO reported only
 *   node scripts/checks/lighthouse.mjs --runs 5   5 runs per arm
 *   node scripts/checks/lighthouse.mjs --seo      also judge SEO (a build made with ALLOW_INDEXING=true)
 *
 * Base URL: LIGHTHOUSE_BASE_URL, default http://127.0.0.1:4321.
 * Exit codes: 0 every judged budget passes, 1 a budget fails, 2 internal error.
 *
 * Each arm is reached through the visitor cookie: a fixed id that the registry's own
 * `assign` puts in that arm, so every run audits the same visitors. Lighthouse runs
 * headless with its default mobile profile and simulated throttling. Single runs vary,
 * so each metric is judged on its median across the runs.
 *
 * The CPU slowdown is calibrated to the machine. Lighthouse's 4x turns a high-end desktop
 * into a mid-tier phone, and says to calibrate anywhere else (its docs/throttling.md). On
 * a fixed 4x the same commit measured a total blocking time of 173 ms and of 36 ms on two
 * shared CI runners, and 0 ms on a fast laptop: the number was the host's, not the page's.
 * A first, unjudged run reads the host's benchmark, and the judged runs scale the
 * slowdown by it, so every host simulates the same phone.
 *
 * Total blocking time is judged only on a host with four cores or more. It is wall-clock
 * time on the main thread, and with fewer cores Chrome's own processes stretch it by
 * competing for them, which the benchmark does not see: one machine, one benchmark, and
 * 0 ms on twelve cores, 0 to 10 ms with Chrome and the server pinned to four, 72 to 122 ms
 * pinned to two. A shared two-core CI runner measured about 190 ms, a four-core one 13 ms.
 * Lighthouse (its docs/variability.md) asks for dedicated cores and recommends four. Below
 * that the number is printed and stored, not judged.
 *
 * Budgets are compared on unrounded values. The table rounds against the budget (a
 * maximum up, a minimum down), so a displayed value never looks better than the real one.
 *
 * Output goes to .artifacts/lighthouse/: summary.json (medians, per-run values, budgets,
 * version, date, base URL) and <arm>.json, the full report of the run with the median
 * performance score.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const OUT_DIR = '.artifacts/lighthouse';
export const DEFAULT_BASE_URL = 'http://127.0.0.1:4321';
export const EXPERIMENT = 'hero_signup';
export const VISITOR_COOKIE = 'fxr_aid';
export const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

/** Invariant 7. `max` and `min` are inclusive: a value exactly on the budget passes. */
export const BUDGETS = {
  lcp: { label: 'LCP', unit: 'ms', max: 2000 },
  cls: { label: 'CLS', unit: '', max: 0.05 },
  tbt: { label: 'TBT', unit: 'ms', max: 150, minCores: 4 },
  performance: { label: 'Performance', unit: '', min: 95 },
  accessibility: { label: 'Accessibility', unit: '', min: 100 },
  bestPractices: { label: 'Best practices', unit: '', min: 100 },
  seo: { label: 'SEO', unit: '', min: 100, onlyWith: 'seo' },
};

export const METRICS = Object.keys(BUDGETS);

/**
 * Lighthouse's default slowdown, and the host it assumes: the middle of the "high-end
 * desktop" bracket of its benchmark index (1500 to 2000). The linear scaling between
 * brackets is this project's reading of that table, within the 1x to 10x it lists.
 */
export const DEFAULT_SLOWDOWN = 4;
export const REFERENCE_BENCHMARK = 1750;

/** The slowdown that makes this host simulate the phone a reference host simulates at 4x. */
export function calibratedSlowdown(benchmarkIndex) {
  if (!Number.isFinite(benchmarkIndex) || benchmarkIndex <= 0) return DEFAULT_SLOWDOWN;
  const scaled = (DEFAULT_SLOWDOWN * benchmarkIndex) / REFERENCE_BENCHMARK;
  return Math.min(10, Math.max(1, Math.round(scaled * 10) / 10));
}

const SEO_NOTE =
  'SEO is reported, not judged: the build ships noindex unless ALLOW_INDEXING=true, and Lighthouse scores that down by design. Judge it with --seo on an indexable build.';

const coresNote = (label, cores, minCores) =>
  `${label} is reported, not judged: this host has ${cores} core(s). It is wall-clock time on the main thread, and below ${minCores} cores Chrome's own processes stretch it by competing for them. It is judged on a host with ${minCores} or more.`;

/** The median. An even count averages the two middle values. */
export function median(values) {
  if (values.length === 0) throw new Error('median of no values');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The index of the run at the median (the lower middle one for an even count). */
export function medianIndex(values) {
  if (values.length === 0) throw new Error('median of no values');
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  return order[Math.floor((order.length - 1) / 2)].index;
}

/** Per-metric medians from the values extracted from each run. */
export function summarize(runs) {
  return Object.fromEntries(METRICS.map((key) => [key, median(runs.map((run) => run[key]))]));
}

const formatValue = (value, budget) => {
  const decimals = budget.label === 'CLS' ? 3 : 0;
  const scale = 10 ** decimals;
  // The epsilon keeps float noise (0.007 * 1000 = 7.000000000000001) from moving a value.
  const rounded =
    budget.max !== undefined
      ? Math.ceil(value * scale - 1e-9) / scale
      : Math.floor(value * scale + 1e-9) / scale;
  return `${rounded.toFixed(decimals)}${budget.unit ? ` ${budget.unit}` : ''}`;
};

const formatBudget = (budget) => {
  if (budget.max !== undefined) return `<= ${budget.max}${budget.unit ? ` ${budget.unit}` : ''}`;
  return budget.min === 100 ? '= 100' : `>= ${budget.min}`;
};

/**
 * One row per metric: `result` is 'pass', 'fail' or 'not judged'. A budget with
 * `onlyWith` is judged only when that option is set. A budget with `minCores` is judged
 * only when `options.cores`, if given, reaches it.
 */
export function judge(summary, budgets, options = {}) {
  return Object.entries(budgets).map(([key, budget]) => {
    const value = summary[key];
    const row = {
      metric: key,
      label: budget.label,
      value,
      shown: formatValue(value, budget),
      budget: formatBudget(budget),
    };
    if (budget.onlyWith && !options[budget.onlyWith]) {
      return { ...row, result: 'not judged', note: key === 'seo' ? SEO_NOTE : undefined };
    }
    if (budget.minCores && options.cores !== undefined && options.cores < budget.minCores) {
      return {
        ...row,
        result: 'not judged',
        note: coresNote(budget.label, options.cores, budget.minCores),
      };
    }
    const passes = budget.max !== undefined ? value <= budget.max : value >= budget.min;
    return { ...row, result: passes ? 'pass' : 'fail' };
  });
}

/** The table as plain text, with any notes below it. */
export function render(rows) {
  const header = ['Metric', 'Median', 'Budget', 'Result'];
  const cells = rows.map((row) => [
    row.label,
    row.shown,
    row.budget,
    row.result === 'fail' ? 'FAIL' : row.result,
  ]);
  const widths = header.map((title, column) =>
    Math.max(title.length, ...cells.map((line) => line[column].length)),
  );
  const line = (values) =>
    values
      .map((value, column) =>
        column === 1 ? value.padStart(widths[column]) : value.padEnd(widths[column]),
      )
      .join('  ')
      .trimEnd();
  const notes = rows.filter((row) => row.note).map((row) => `Note: ${row.note}`);
  return [line(header), ...cells.map(line), ...notes].join('\n');
}

/** Fixed visitor ids, one per variant, found by trying lighthouse-0, lighthouse-1, ... */
export function findVisitorIds(assign, key, variants, limit = 1000) {
  const ids = new Map();
  for (let index = 0; index < limit && ids.size < variants.length; index += 1) {
    const id = `lighthouse-${index}`;
    const variant = assign(key, id);
    if (!ids.has(variant)) ids.set(variant, id);
  }
  return variants
    .filter((variant) => ids.has(variant))
    .map((variant) => [variant, ids.get(variant)]);
}

const score = (lhr, category) => {
  const value = lhr.categories[category]?.score;
  if (typeof value !== 'number') throw new Error(`the report has no ${category} score`);
  return value * 100;
};

const numeric = (lhr, audit) => {
  const value = lhr.audits[audit]?.numericValue;
  if (typeof value !== 'number') throw new Error(`the report has no value for ${audit}`);
  return value;
};

/** The judged values of one Lighthouse result. Throws when one is missing. */
export function extract(lhr) {
  return {
    lcp: numeric(lhr, 'largest-contentful-paint'),
    cls: numeric(lhr, 'cumulative-layout-shift'),
    tbt: numeric(lhr, 'total-blocking-time'),
    performance: score(lhr, 'performance'),
    accessibility: score(lhr, 'accessibility'),
    bestPractices: score(lhr, 'best-practices'),
    seo: score(lhr, 'seo'),
  };
}

/**
 * What Lighthouse names as the largest contributors, when the report carries them:
 * the LCP element with its largest phases, and the scripts with the most main-thread time.
 */
export function contributors(lhr) {
  const lines = [];
  const lcpItems = lhr.audits['lcp-breakdown-insight']?.details?.items ?? [];
  const element = lcpItems.find((item) => item.type === 'node');
  if (element) lines.push(`LCP element: ${element.selector ?? element.snippet ?? 'unknown'}`);
  const phases = lcpItems.find((item) => item.type === 'table')?.items ?? [];
  const topPhases = phases
    .filter((phase) => typeof phase.duration === 'number')
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 3);
  if (topPhases.length > 0) {
    lines.push(
      `LCP phases: ${topPhases.map((phase) => `${phase.label ?? phase.subpart} ${Math.round(phase.duration)} ms`).join(', ')}`,
    );
  }
  const scripts = (lhr.audits['bootup-time']?.details?.items ?? []).slice(0, 3);
  if (scripts.length > 0) {
    lines.push('Main-thread time by script (bootup-time):');
    for (const item of scripts) {
      lines.push(`  ${Math.round(item.total)} ms  ${item.url}`);
    }
  }
  return lines;
}

async function serverAnswers(baseUrl) {
  try {
    const response = await fetch(baseUrl, { signal: AbortSignal.timeout(5000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

/**
 * A run that Lighthouse could not audit says nothing about the page (NO_NAVSTART, a trace
 * without its first event, was seen once in CI and under pinned cores), so it is run
 * again. A page that cannot be audited in three attempts is an error, never a pass.
 */
export const AUDIT_ATTEMPTS = 3;

export async function auditWithRetry(audit, attempts = AUDIT_ATTEMPTS, log = console.error) {
  for (let attempt = 1; ; attempt += 1) {
    const result = await audit();
    const reason = result ? result.lhr.runtimeError?.code : 'no result';
    if (!reason) return result;
    if (attempt >= attempts) {
      throw new Error(`Lighthouse could not audit the page in ${attempts} attempts: ${reason}`);
    }
    log(
      `lighthouse: a run could not audit the page (${reason}), running it again (${attempt + 1} of ${attempts}).`,
    );
  }
}

async function auditArm({ lighthouse, port, url, visitorId, runs, slowdown }) {
  const results = [];
  for (let run = 0; run < runs; run += 1) {
    const result = await auditWithRetry(() =>
      lighthouse(url, {
        port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: CATEGORIES,
        extraHeaders: { Cookie: `${VISITOR_COOKIE}=${visitorId}` },
        throttling: { cpuSlowdownMultiplier: slowdown },
      }),
    );
    const { lhr } = result;
    for (const warning of lhr.runWarnings ?? []) console.error(`lighthouse: warning: ${warning}`);
    results.push({ lhr, report: result.report, values: extract(lhr) });
  }
  return results;
}

async function main(argv) {
  const { values: flags } = parseArgs({
    args: argv,
    options: { runs: { type: 'string', default: '3' }, seo: { type: 'boolean', default: false } },
  });
  const runs = Number(flags.runs);
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a positive integer`);

  const baseUrl = process.env.LIGHTHOUSE_BASE_URL || DEFAULT_BASE_URL;
  if (!(await serverAnswers(baseUrl))) {
    console.error(
      `lighthouse: no server answers at ${baseUrl}. Start one with \`npm run preview\`.`,
    );
    return 2;
  }

  const registry = await import(
    new URL('../../src/lib/experiments/registry.ts', import.meta.url).href
  );
  const experiment = registry.EXPERIMENTS[EXPERIMENT];
  const arms = findVisitorIds(registry.assign, EXPERIMENT, experiment.variants);
  if (arms.length !== experiment.variants.length) {
    const reached = new Set(arms.map(([variant]) => variant));
    const missing = experiment.variants.filter((variant) => !reached.has(variant));
    if (experiment.enabled) throw new Error(`no visitor id reaches ${missing.join(', ')}`);
    console.log(`lighthouse: ${EXPERIMENT} is off, so only its control is served and audited.`);
  }

  const { default: lighthouse } = await import('lighthouse');
  const chromeLauncher = await import('chrome-launcher');
  // A CI runner has no user namespace for Chrome's sandbox. The page under test is our own.
  const chromeFlags = ['--headless=new', ...(process.env.CI ? ['--no-sandbox'] : [])];
  const chrome = await chromeLauncher.launch({ chromeFlags });

  const url = new URL('/', baseUrl).href;
  const outDir = join(REPO_ROOT, OUT_DIR);
  mkdirSync(outDir, { recursive: true });
  const summaryFile = {
    lighthouseVersion: undefined,
    date: new Date().toISOString(),
    baseUrl,
    url,
    runsPerArm: runs,
    seoJudged: flags.seo,
    budgets: BUDGETS,
    hostBenchmarkIndex: undefined,
    hostCores: undefined,
    cpuSlowdownMultiplier: undefined,
    arms: {},
  };

  let failed = false;
  try {
    // An unjudged run, to learn how fast this machine is.
    const probe = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance'],
    });
    const benchmark = probe?.lhr.environment?.benchmarkIndex;
    const slowdown = calibratedSlowdown(benchmark);
    const cores = availableParallelism();
    summaryFile.hostBenchmarkIndex = benchmark;
    summaryFile.hostCores = cores;
    summaryFile.cpuSlowdownMultiplier = slowdown;
    console.log(
      `lighthouse: host benchmark ${Math.round(benchmark ?? 0)}, ${cores} core(s), CPU slowdown ${slowdown}x (${DEFAULT_SLOWDOWN}x on a reference host of ${REFERENCE_BENCHMARK}).`,
    );

    for (const [arm, visitorId] of arms) {
      const results = await auditArm({
        lighthouse,
        port: chrome.port,
        url,
        visitorId,
        runs,
        slowdown,
      });
      const values = results.map((result) => result.values);
      const summary = summarize(values);
      const rows = judge(summary, BUDGETS, { seo: flags.seo, cores });
      const representative = results[medianIndex(values.map((value) => value.performance))];
      summaryFile.lighthouseVersion = representative.lhr.lighthouseVersion;

      writeFileSync(join(outDir, `${arm}.json`), representative.report);
      summaryFile.arms[arm] = {
        cookie: `${VISITOR_COOKIE}=${visitorId}`,
        medians: summary,
        runs: values,
        results: rows.map(({ metric, value, result }) => ({ metric, value, result })),
      };

      console.log(`\n${arm} (${VISITOR_COOKIE}=${visitorId}, median of ${runs} run(s))`);
      console.log(render(rows));
      const lines = contributors(representative.lhr);
      if (lines.length > 0) {
        console.log(`Largest contributors, from the median-performance run:`);
        for (const line of lines) console.log(`  ${line}`);
      }
      failed ||= rows.some((row) => row.result === 'fail');
    }
  } finally {
    chrome.kill();
  }

  writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify(summaryFile, null, 2)}\n`);
  console.log(
    `\nlighthouse: ${failed ? 'FAIL, a lab budget is missed' : 'OK, every judged budget passes'} (${arms.length} arm(s), ${runs} run(s) each, reports in ${OUT_DIR}/).`,
  );
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(`lighthouse: ${error.message}`);
    process.exitCode = 2;
  }
}
