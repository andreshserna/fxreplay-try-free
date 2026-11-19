/**
 * Reads the token sources and resolves them.
 *
 *   tokens/tokens.json      the kit's 44 primitives and 60 semantic tokens, names unchanged
 *   tokens/extensions.json  what this project adds; every entry aliases a kit value
 *
 * Both files use the W3C design-tokens shape: groups of tokens with `$value`, and
 * aliases written as `{group.subgroup.token}`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composite, parseHex } from './color.mjs';

export const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const KIT_TOKENS = 'tokens/tokens.json';
export const EXTENSION_TOKENS = 'tokens/extensions.json';

/** Key under `$extensions` for data that is ours, not part of the token format. */
export const EXTENSION_KEY = 'fxreplay-try-free';

/** The one naming rule: a token's CSS name is its own name, lowercased, spaces to hyphens. */
export const cssName = (name) => `--${name.trim().toLowerCase().replace(/\s+/g, '-')}`;

const isToken = (node) => node !== null && typeof node === 'object' && '$value' in node;
const aliasTarget = (value) => /^\{(.+)\}$/.exec(String(value).trim())?.[1].split('.').at(-1) ?? null;

/** Walks a token tree and returns its tokens in file order. */
function collect(tree, tier) {
  const tokens = [];
  const visit = (node, path) => {
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith('$') || child === null || typeof child !== 'object') continue;
      if (isToken(child)) {
        tokens.push({
          name: key,
          tier: tier ?? path[0],
          group: path.at(-1) ?? null,
          value: child.$value,
          alias: aliasTarget(child.$value),
          alpha: child.$extensions?.[EXTENSION_KEY]?.alpha ?? 1,
          description: child.$description ?? '',
        });
      } else {
        visit(child, [...path, key]);
      }
    }
  };
  visit(tree, []);
  return tokens;
}

/**
 * Loads every token. Returns { tokens, byName }, where `tier` is "primitive",
 * "semantic" or "extension". Names are unique across tiers.
 */
export function loadTokens(root = REPO_ROOT) {
  const read = (file) => JSON.parse(readFileSync(join(root, file), 'utf8'));
  const tokens = collect(read(KIT_TOKENS));
  if (existsSync(join(root, EXTENSION_TOKENS))) {
    tokens.push(...collect(read(EXTENSION_TOKENS), 'extension'));
  }

  const byName = new Map();
  const cssNames = new Map();
  for (const token of tokens) {
    if (byName.has(token.name)) throw new Error(`Duplicate token name: ${token.name}`);
    const css = cssName(token.name);
    if (cssNames.has(css)) throw new Error(`${token.name} and ${cssNames.get(css)} share the CSS name ${css}`);
    byName.set(token.name, token);
    cssNames.set(css, token.name);
  }
  for (const token of tokens) {
    if (token.alias && !byName.has(token.alias)) {
      throw new Error(`${token.name} points at ${token.alias}, which is not defined`);
    }
    if (!token.alias && token.tier !== 'primitive') {
      throw new Error(`${token.name} is ${token.tier} and must alias another token, not hold a literal`);
    }
  }
  return { tokens, byName };
}

/**
 * Follows aliases down to a literal. Returns { hex, alpha, chain }: the primitive's
 * hex, the combined opacity, and the names passed through on the way.
 */
export function resolveToken(byName, name) {
  const chain = [];
  let alpha = 1;
  let token = byName.get(name);
  while (token) {
    if (chain.includes(token.name)) throw new Error(`Alias loop: ${[...chain, token.name].join(' -> ')}`);
    chain.push(token.name);
    alpha *= token.alpha;
    if (!token.alias) return { hex: token.value, alpha, chain };
    token = byName.get(token.alias);
  }
  throw new Error(`Unknown token: ${name}`);
}

/** The opaque color a token paints, as { r, g, b }. Translucent tokens need a backdrop. */
export function paintedColor(byName, name, backdropName) {
  const { hex, alpha } = resolveToken(byName, name);
  const color = { ...parseHex(hex), a: alpha };
  if (color.a === 1) return color;
  if (!backdropName) throw new Error(`${name} is translucent: say what it is painted over`);
  return composite(color, paintedColor(byName, backdropName));
}
