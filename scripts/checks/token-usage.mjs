#!/usr/bin/env node
/**
 * Token usage check.
 *
 * The brand kit's rule: product code references semantic tokens only, never
 * primitives and never hard-coded colors. This script enforces it for every
 * text file under src/ and public/. tokens/ is the one place literals live.
 *
 *   node scripts/checks/token-usage.mjs            scan src/ and public/
 *   node scripts/checks/token-usage.mjs <file>...  check only these files
 *
 * Exit codes: 0 clean, 1 violations found, 2 internal error.
 *
 * Known limits, accepted on purpose (a regex check, not a parser):
 *   - "#123" in prose reads as a color. Write "issue 123" instead.
 *   - An id made only of the letters a-f ("#cafe") reads as a color unless it
 *     sits in href="..." or url(...). Rename the id.
 *   - Named colors are only checked inside stylesheets and <style> blocks.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Directories that hold product code. Everything else is out of scope. */
export const SCANNED_DIRS = ['src', 'public'];

/** The generated stylesheet that declares every token. Absent until Phase 1. */
export const TOKENS_CSS = 'tokens/tokens.css';

const TEXT_EXTENSIONS = new Set([
  '.astro', '.css', '.scss', '.pcss', '.html', '.svg', '.md', '.mdx',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.webmanifest',
]);
const STYLESHEET_EXTENSIONS = new Set(['.css', '.scss', '.pcss']);
const STYLE_BLOCK_EXTENSIONS = new Set(['.astro', '.html', '.svg', '.mdx']);

/**
 * Paths exempt from the check, relative to the repo root.
 * Every entry needs a reason a reviewer would accept.
 */
const EXEMPT = [
  // { path: 'public/example.svg', reason: 'why this file must carry a literal color' },
];

const HEX_SOURCE = String.raw`(?<![&\w.])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])`;
const COLOR_FUNCTION_SOURCE =
  String.raw`\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*(?!var\(|from\b|calc\()[-+.\d]`;
const COLOR_SPACE_SOURCE =
  String.raw`\bcolor\(\s*(?:srgb(?:-linear)?|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz(?:-d50|-d65)?)\b`;
const NAMED_COLORS = [
  'white', 'black', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'gray', 'grey',
  'silver', 'maroon', 'navy', 'teal', 'aqua', 'lime', 'olive', 'fuchsia', 'cyan', 'magenta', 'brown',
];
const NAMED_SOURCE = String.raw`(?<![-\w.#])(?:${NAMED_COLORS.join('|')})(?![-\w(])`;
const CUSTOM_PROPERTY_SOURCE = String.raw`(?<![\w-])--([a-z0-9_-]+)`;
const DECLARATION_SOURCE = String.raw`(?:^|[;{])\s*(--[\w-]+|[a-z-]+)\s*:\s*([^;{}]+)`;

/** A "#abc" that is a URL fragment or an SVG reference, not a color. */
const FRAGMENT_CONTEXT = /(?:\b(?:xlink:)?href|\bto|\baction|\bsrc)\s*=\s*[{"'`]*[^"'`\s]*$|url\(\s*["']?$/i;

/** Properties whose values are names, not colors ("font-family: Arial Black"). */
const NAME_VALUED_PROPERTIES = new Set([
  'font', 'font-family', 'content', 'animation', 'animation-name', 'grid-area',
  'grid-template-areas', 'view-transition-name',
]);

const SEMANTIC_HINT = 'Use a semantic token from tokens/tokens.css, for example var(--text-primary).';

/** Replaces every match with spaces so offsets and line numbers stay valid. */
function blank(text, pattern) {
  return text.replace(pattern, (match) => match.replace(/[^\n]/g, ' '));
}

const stripCssComments = (text) => blank(text, /\/\*[\s\S]*?\*\//g);
const stripStrings = (text) => blank(text, /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g);

/** Keeps only the CSS a file contains: the whole file, or its <style> blocks. */
function cssRegions(text, extension) {
  if (STYLESHEET_EXTENSIONS.has(extension)) return text;
  if (!STYLE_BLOCK_EXTENSIONS.has(extension)) return '';
  let kept = text.replace(/[^\n]/g, ' ');
  for (const block of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const start = block.index + block[0].indexOf(block[1]);
    kept = kept.slice(0, start) + block[1] + kept.slice(start + block[1].length);
  }
  return kept;
}

function position(text, offset) {
  const before = text.slice(0, offset);
  const line = before.split('\n').length;
  return { line, column: offset - before.lastIndexOf('\n') };
}

/**
 * Reads the generated token stylesheet and returns the names of the primitives:
 * custom properties declared with a literal color. Aliases (declared with var())
 * are semantic tokens or our extensions, and are free to use.
 */
export function loadPrimitives(tokensCss) {
  const primitives = new Set();
  const css = stripCssComments(tokensCss);
  const declaration = new RegExp(String.raw`${CUSTOM_PROPERTY_SOURCE}\s*:\s*([^;{}]+)`, 'gi');
  for (const [, name, value] of css.matchAll(declaration)) {
    if (/var\(/i.test(value)) continue;
    const literal =
      new RegExp(HEX_SOURCE, 'i').test(value) ||
      new RegExp(COLOR_FUNCTION_SOURCE, 'i').test(value) ||
      new RegExp(COLOR_SPACE_SOURCE, 'i').test(value);
    if (literal) primitives.add(name.toLowerCase());
  }
  return primitives;
}

/**
 * Checks one file's text. Returns violations as { line, column, rule, found, message }.
 */
export function checkText(text, { extension = '', primitives = new Set() } = {}) {
  const violations = [];
  const report = (offset, rule, found, message) =>
    violations.push({ ...position(text, offset), rule, found, message });

  for (const match of text.matchAll(new RegExp(HEX_SOURCE, 'gi'))) {
    const before = text.slice(Math.max(0, match.index - 80), match.index);
    if (FRAGMENT_CONTEXT.test(before)) continue;
    report(match.index, 'color-literal', match[0], `Hard-coded color ${match[0]}. ${SEMANTIC_HINT}`);
  }

  for (const source of [COLOR_FUNCTION_SOURCE, COLOR_SPACE_SOURCE]) {
    for (const match of text.matchAll(new RegExp(source, 'gi'))) {
      const found = match[0].replace(/\(.*$/s, '()');
      report(match.index, 'color-literal', found, `Hard-coded color in ${found}. ${SEMANTIC_HINT}`);
    }
  }

  const css = stripStrings(stripCssComments(cssRegions(text, extension)));
  for (const declaration of css.matchAll(new RegExp(DECLARATION_SOURCE, 'gi'))) {
    const [whole, property, value] = declaration;
    if (NAME_VALUED_PROPERTIES.has(property.toLowerCase())) continue;
    const valueOffset = declaration.index + whole.length - value.length;
    for (const match of value.matchAll(new RegExp(NAMED_SOURCE, 'gi'))) {
      report(valueOffset + match.index, 'color-literal', match[0],
        `Named color "${match[0]}". ${SEMANTIC_HINT}`);
    }
  }

  if (primitives.size > 0) {
    for (const match of text.matchAll(new RegExp(CUSTOM_PROPERTY_SOURCE, 'gi'))) {
      if (!primitives.has(match[1].toLowerCase())) continue;
      report(match.index, 'primitive-token', match[0],
        `${match[0]} is a primitive. Components use semantic tokens, for example var(--bg-primary).`);
    }
  }

  return violations.sort((a, b) => a.line - b.line || a.column - b.column);
}

const toPosix = (path) => path.split(sep).join('/');

/** True when a repo-relative path is product code this check covers. */
export function inScope(relativePath) {
  const path = toPosix(relativePath);
  if (EXEMPT.some((entry) => entry.path === path)) return false;
  if (!TEXT_EXTENSIONS.has(extname(path).toLowerCase())) return false;
  return SCANNED_DIRS.some((dir) => path.startsWith(`${dir}/`));
}

function walk(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, found);
    else if (entry.isFile()) found.push(path);
  }
  return found;
}

/**
 * Checks files under `root`. With no `files`, scans every scanned directory.
 * Returns { checked, primitiveRuleActive, violations } with repo-relative paths.
 */
export function checkFiles({ root = REPO_ROOT, files } = {}) {
  const tokensPath = join(root, TOKENS_CSS);
  const primitives = existsSync(tokensPath)
    ? loadPrimitives(readFileSync(tokensPath, 'utf8'))
    : new Set();

  const candidates = files
    ? files.map((file) => resolve(root, file))
    : SCANNED_DIRS.map((dir) => join(root, dir)).filter(existsSync).flatMap((dir) => walk(dir));

  const violations = [];
  let checked = 0;
  for (const absolute of candidates) {
    const path = toPosix(relative(root, absolute));
    if (path.startsWith('..') || !inScope(path)) continue;
    if (!existsSync(absolute) || !statSync(absolute).isFile()) continue;
    checked += 1;
    const found = checkText(readFileSync(absolute, 'utf8'), {
      extension: extname(path).toLowerCase(),
      primitives,
    });
    for (const violation of found) violations.push({ file: path, ...violation });
  }
  return { checked, primitiveRuleActive: primitives.size > 0, violations };
}

export function formatViolation({ file, line, column, rule, message }) {
  return `${file}:${line}:${column}  ${rule}  ${message}`;
}

function main(argv) {
  const files = argv.length > 0 ? argv : undefined;
  const { checked, primitiveRuleActive, violations } = checkFiles({ files });
  if (violations.length > 0) {
    for (const violation of violations) console.error(formatViolation(violation));
    const fileCount = new Set(violations.map((violation) => violation.file)).size;
    console.error(`\ntoken-usage: ${violations.length} violation(s) in ${fileCount} file(s).`);
    return 1;
  }
  const note = primitiveRuleActive ? '' : ` Primitive rule inactive: ${TOKENS_CSS} not found.`;
  console.log(`token-usage: OK, ${checked} file(s) checked.${note}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`token-usage: internal error: ${error.stack ?? error}`);
    process.exitCode = 2;
  }
}
