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
 *   node scripts/checks/lighthouse.mjs --out dir  write the output to dir (default .artifacts/lighthouse)
 *
 * Base URL: LIGHTHOUSE_BASE_URL, default http://127.0.0.1:4321.
 * Exit codes: 0 every judged budget passes, 1 a budget fails, 2 internal error, including
 * an audit of the wrong arm.
 *
 * Each arm is reached through the visitor cookie: a fixed id that the registry's own
 * `assign` puts in that arm, so every run audits the same visitors. Every audit, retries
 * included, runs in its own Chrome with a new, empty profile, so no cookie the server set
 * in one audit can be sent in the next one in place of the arm's own. Each audit then
 * proves which arm it measured: the document Lighthouse loaded names its arm on <html>
 * (`data-experiments`), and a document of another arm, or of none, stops the check.
 *
 * Lighthouse runs headless with its default mobile profile and simulated throttling,
 * including its default CPU slowdown. Single runs vary, so each metric is judged on its
 * median across the runs. The host's core count and the median benchmark index of the
 * judged runs are printed and stored, for information only: they show what kind of
 * machine produced the numbers, and change nothing in how they are judged.
 *
 * Total blocking time is judged only on a host with four cores or more. It is wall-clock
 * time on the main thread, and with fewer cores Chrome's own processes stretch it by
 * competing for them, which the benchmark does not see: one machine, one benchmark, and
 * 0 ms on twelve cores, 0 to 10 ms with Chrome and the server pinned to four, 109 to 122 ms
 * pinned to two. A shared two-core CI runner measured about 190 ms, a four-core one 13 ms.
 * Lighthouse (its docs/variability.md) asks for dedicated cores and recommends four. Below
 * that the number is printed and stored, not judged.
 *
 * Budgets are compared on unrounded values. The table rounds against the budget (a
 * maximum up, a minimum down), so a displayed value never looks better than the real one.
 *
 * Output goes to the output directory: summary.json (medians, per-run values, the arm each
 * run was served, discarded attempts, budgets, host, version, date, base URL) and
 * <arm>.json, the full report of the run with the median performance score.
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
 * The arm of `EXPERIMENT` that a served document names on its <html> element, as
 * `data-experiments="hero_signup:<arm>"` (other experiments may sit beside it, separated
 * by commas). Undefined when the document names none.
 */
export function servedArm(html) {
  if (typeof html !== 'string') return undefined;
  const element = /<html\b[^>]*>/i.exec(html)?.[0];
  const value = element && /\sdata-experiments="([^"]*)"/i.exec(element)?.[1];
  if (!value) return undefined;
  for (const pair of value.split(',')) {
    const [key, variant] = pair.trim().split(':');
    if (key === EXPERIMENT && variant) return variant;
  }
  return undefined;
}

/**
 * Null when the document audited for `arm` is that arm's document. Otherwise the reason it
 * is not, naming the arm asked for and the arm served. A mismatch is never a pass.
 */
export function armMismatch(html, arm) {
  const served = servedArm(html);
  if (served === arm) return null;
  return served === undefined
    ? `the audit of ${arm} measured a document that names no ${EXPERIMENT} arm (asked for ${arm}, served none)`
    : `the audit of ${arm} measured another arm's document (asked for ${arm}, served ${served})`;
}

/**
 * A run that Lighthouse could not audit says nothing about the page, so it is run again.
 * NO_NAVSTART, a trace without its first event, has been seen repeatedly in CI and under
 * pinned cores, and its cause is not established. A page that cannot be audited in three
 * attempts is an error, never a pass. The discarded attempts are returned with their
 * reasons, so the output keeps a record of them.
 */
export const AUDIT_ATTEMPTS = 3;

export async function auditWithRetry(audit, attempts = AUDIT_ATTEMPTS, log = console.error) {
  const discarded = [];
  for (let attempt = 1; ; attempt += 1) {
    const result = await audit();
    const reason = result ? result.lhr.runtimeError?.code : 'no result';
    if (!reason) return { result, discarded };
    discarded.push(reason);
    if (attempt >= attempts) {
      throw new Error(
        `Lighthouse could not audit the page in ${attempts} attempts: ${discarded.join(', ')}`,
      );
    }
    log(
      `lighthouse: a run could not audit the page (${reason}), running it again (${attempt + 1} of ${attempts}).`,
    );
  }
}

/** One audit in a Chrome of its own, with a new profile that it deletes on the way out. */
async function auditInFreshChrome({ lighthouse, chromeLauncher, url, cookie }) {
  // A CI runner has no user namespace for Chrome's sandbox. The page under test is our own.
  const chromeFlags = ['--headless=new', ...(process.env.CI ? ['--no-sandbox'] : [])];
  const chrome = await chromeLauncher.launch({ chromeFlags });
  try {
    return await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      // Best practices' charset audit is what makes Lighthouse keep the main document's
      // content (the MainDocumentContent artifact), which proves the arm.
      onlyCategories: CATEGORIES,
      extraHeaders: { Cookie: cookie },
    });
  } finally {
    chrome.kill();
  }
}

async function auditArm({ lighthouse, chromeLauncher, url, arm, visitorId, runs, checkArm }) {
  const cookie = `${VISITOR_COOKIE}=${visitorId}`;
  const results = [];
  const discarded = [];
  for (let run = 0; run < runs; run += 1) {
    const attempt = await auditWithRetry(() =>
      auditInFreshChrome({ lighthouse, chromeLauncher, url, cookie }),
    );
    discarded.push(...attempt.discarded);
    const { lhr, artifacts, report } = attempt.result;
    // Checked once Lighthouse has audited the page, and never retried: a document of the
    // wrong arm means the check measures something other than it says.
    const html = artifacts?.MainDocumentContent;
    if (checkArm) {
      const mismatch = armMismatch(html, arm);
      if (mismatch) throw new Error(`${mismatch}. The run is not counted.`);
    }
    for (const warning of lhr.runWarnings ?? []) console.error(`lighthouse: warning: ${warning}`);
    results.push({
      lhr,
      report,
      values: extract(lhr),
      servedArm: servedArm(html) ?? null,
      benchmarkIndex: lhr.environment?.benchmarkIndex,
    });
  }
  return { results, discarded };
}

const describeDiscarded = (discarded) => {
  if (discarded.length === 0) return 'none';
  const counts = new Map();
  for (const reason of discarded) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return `${discarded.length} (${[...counts].map(([reason, count]) => `${reason} x${count}`).join(', ')}), each run again`;
};

async function main(argv) {
  const { values: flags } = parseArgs({
    args: argv,
    options: {
      runs: { type: 'string', default: '3' },
      seo: { type: 'boolean', default: false },
      out: { type: 'string', default: OUT_DIR },
    },
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
    // Switched off, the document names no arm (every visitor gets the control), so there
    // is no arm to prove and no other arm a stray cookie could reach.
    console.log(
      `lighthouse: ${EXPERIMENT} is off, so only its control is served and audited, and the served arm is not checked.`,
    );
  }

  const { default: lighthouse } = await import('lighthouse');
  const chromeLauncher = await import('chrome-launcher');

  const url = new URL('/', baseUrl).href;
  const outDir = resolve(REPO_ROOT, flags.out);
  mkdirSync(outDir, { recursive: true });
  const cores = availableParallelism();
  const summaryFile = {
    lighthouseVersion: undefined,
    date: new Date().toISOString(),
    baseUrl,
    url,
    runsPerArm: runs,
    seoJudged: flags.seo,
    budgets: BUDGETS,
    hostCores: cores,
    cpuSlowdownMultiplier: undefined,
    arms: {},
  };
  console.log(`lighthouse: ${cores} core(s) on this host, a new Chrome profile for every audit.`);

  let failed = false;
  for (const [arm, visitorId] of arms) {
    const { results, discarded } = await auditArm({
      lighthouse,
      chromeLauncher,
      url,
      arm,
      visitorId,
      runs,
      checkArm: experiment.enabled,
    });
    const values = results.map((result) => result.values);
    const summary = summarize(values);
    const rows = judge(summary, BUDGETS, { seo: flags.seo, cores });
    const representative = results[medianIndex(values.map((value) => value.performance))];
    const benchmarks = results
      .map((result) => result.benchmarkIndex)
      .filter((value) => Number.isFinite(value));
    const benchmarkIndex = benchmarks.length > 0 ? median(benchmarks) : null;
    const slowdown = representative.lhr.configSettings?.throttling?.cpuSlowdownMultiplier;
    summaryFile.lighthouseVersion = representative.lhr.lighthouseVersion;
    summaryFile.cpuSlowdownMultiplier = slowdown;

    writeFileSync(join(outDir, `${arm}.json`), representative.report);
    summaryFile.arms[arm] = {
      cookie: `${VISITOR_COOKIE}=${visitorId}`,
      servedArms: results.map((result) => result.servedArm),
      benchmarkIndex,
      discardedAttempts: discarded,
      medians: summary,
      runs: values,
      results: rows.map(({ metric, value, result }) => ({ metric, value, result })),
    };

    console.log(`\n${arm} (${VISITOR_COOKIE}=${visitorId}, median of ${runs} run(s))`);
    console.log(render(rows));
    console.log(
      `Served: ${experiment.enabled ? `${arm} in every run` : 'not checked'}. CPU slowdown ${slowdown}x. Benchmark index, median of the judged runs: ${benchmarkIndex === null ? 'unknown' : Math.round(benchmarkIndex)} (for information).`,
    );
    console.log(`Discarded attempts: ${describeDiscarded(discarded)}.`);
    const lines = contributors(representative.lhr);
    if (lines.length > 0) {
      console.log(`Largest contributors, from the median-performance run:`);
      for (const line of lines) console.log(`  ${line}`);
    }
    failed ||= rows.some((row) => row.result === 'fail');
  }

  writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify(summaryFile, null, 2)}\n`);
  console.log(
    `\nlighthouse: ${failed ? 'FAIL, a lab budget is missed' : 'OK, every judged budget passes'} (${arms.length} arm(s), ${runs} run(s) each, reports in ${flags.out.replace(/\/+$/, '')}/).`,
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
