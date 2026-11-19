#!/usr/bin/env node
/**
 * Generates the tables in docs/analytics-plan.md from the registries.
 *
 *   src/lib/analytics/registry.ts    ->  the events table and the context table
 *   src/lib/experiments/registry.ts  ->  the experiments table
 *
 *   node scripts/gen/analytics-docs.mjs           rewrite the generated regions
 *   node scripts/gen/analytics-docs.mjs --check   fail if any region is out of date, change nothing
 *
 * The registries are TypeScript that imports nothing, so Node loads them directly by
 * stripping their types. Only the text between each region's markers is touched.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { REPO_ROOT } from '../lib/tokens.mjs';

export const DOCS_FILE = 'docs/analytics-plan.md';
export const ANALYTICS_REGISTRY = 'src/lib/analytics/registry.ts';
export const EXPERIMENTS_REGISTRY = 'src/lib/experiments/registry.ts';
const COMMAND = 'npm run gen';

const FIRES = { client: 'browser', server: 'server' };
const STRING_SHAPES = {
  id: 'opaque id',
  label: 'label (lowercase slug)',
  path: 'site path',
  timestamp: 'ISO 8601 timestamp, UTC',
  assignments: '`key:variant` pairs, comma-separated',
};

export const escapeCell = (text) => String(text).replaceAll('|', '\\|');
const code = (text) => `\`${text}\``;
const row = (cells) => `| ${cells.map(escapeCell).join(' | ')} |`;
const table = (headers, rows) => [row(headers), row(headers.map(() => '---')), ...rows.map(row)];

/** A property's type in plain words: the values of an enum, the range of a number. */
export function describeType(spec) {
  let words;
  switch (spec.type) {
    case 'enum':
      words = spec.values.map(code).join(', ');
      break;
    case 'integer':
    case 'number':
      words = `${spec.type}, ${spec.min} to ${spec.max}`;
      break;
    case 'boolean':
      words = 'boolean';
      break;
    default:
      words = STRING_SHAPES[spec.type];
      if (words === undefined) throw new Error(`Unknown property type "${spec.type}"`);
  }
  return spec.optional ? `${words}, optional` : words;
}

function describeProperties(properties) {
  const entries = Object.entries(properties);
  if (entries.length === 0) return 'none';
  return entries.map(([name, spec]) => `${code(name)}: ${describeType(spec)}`).join('<br>');
}

const notice = (source) =>
  `<!-- Generated from ${source} by \`${COMMAND}\`. Do not edit: change the registry and run the command. -->`;

export function renderEvents({ EVENTS }) {
  return [
    notice(ANALYTICS_REGISTRY),
    '',
    ...table(
      ['Event', 'Fires', 'Trigger', 'Properties', 'Decision it informs'],
      Object.entries(EVENTS).map(([name, event]) => [
        code(name),
        FIRES[event.source] ?? event.source,
        event.trigger,
        describeProperties(event.properties),
        event.decision,
      ]),
    ),
  ].join('\n');
}

export function renderContext({ CONTEXT }) {
  return [
    notice(ANALYTICS_REGISTRY),
    '',
    ...table(
      ['Field', 'Type', 'Meaning'],
      Object.entries(CONTEXT).map(([name, spec]) => [
        code(name),
        describeType(spec),
        spec.description,
      ]),
    ),
  ].join('\n');
}

export function renderExperiments({ EXPERIMENTS }) {
  return [
    notice(EXPERIMENTS_REGISTRY),
    '',
    ...table(
      ['Key', 'Control', 'Variants', 'Status', 'Plan'],
      Object.entries(EXPERIMENTS).map(([key, experiment]) => {
        const plan = posix.relative('docs', experiment.spec);
        return [
          code(key),
          code(experiment.variants[0]),
          experiment.variants.map(code).join(', '),
          experiment.enabled ? 'running' : 'off',
          `[${plan}](${plan})`,
        ];
      }),
    ),
  ].join('\n');
}

const markers = (name) => ({ start: `<!-- ${name}:start -->`, end: `<!-- ${name}:end -->` });

/** Replaces what lies between a region's markers. Throws, naming the marker, if one is missing. */
export function replaceRegion(document, name, content) {
  const { start, end } = markers(name);
  const from = document.indexOf(start);
  if (from === -1) throw new Error(`${DOCS_FILE} has no ${start} marker.`);
  const to = document.indexOf(end, from + start.length);
  if (to === -1) throw new Error(`${DOCS_FILE} has no ${end} marker after ${start}.`);
  return `${document.slice(0, from)}${start}\n${content}\n\n${document.slice(to)}`;
}

/** The document with every generated region brought up to date. */
export function renderDocument(document, { analytics, experiments }) {
  let result = document;
  result = replaceRegion(result, 'events', renderEvents(analytics));
  result = replaceRegion(result, 'context', renderContext(analytics));
  result = replaceRegion(result, 'experiments', renderExperiments(experiments));
  return result;
}

const load = (root, file) => import(pathToFileURL(join(root, file)).href);

/** Runs the generator against a repository root. Returns the exit code. */
export async function run(argv, { root = REPO_ROOT } = {}) {
  const check = argv.includes('--check');
  const registries = {
    analytics: await load(root, ANALYTICS_REGISTRY),
    experiments: await load(root, EXPERIMENTS_REGISTRY),
  };
  const path = join(root, DOCS_FILE);
  const current = readFileSync(path, 'utf8');
  const updated = renderDocument(current, registries);

  if (updated === current) {
    console.log(`analytics-docs: the tables in ${DOCS_FILE} are current.`);
    return 0;
  }
  if (check) {
    console.error(
      `analytics-docs: the tables in ${DOCS_FILE} are out of date. Run \`${COMMAND}\`.`,
    );
    return 1;
  }
  writeFileSync(path, updated);
  console.log(`analytics-docs: updated the tables in ${DOCS_FILE}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    console.error(`analytics-docs: ${error.message}`);
    process.exitCode = 2;
  }
}
