#!/usr/bin/env node
/**
 * Rebuilds tokens/tokens.json from the brand kit, and checks that the committed
 * file still matches the kit.
 *
 * The kit's README lists tokens/tokens.json and tokens/tokens.css, but neither was
 * in the kit we received. All 44 primitives and 60 semantic mappings are present
 * as data in the PRIM and SEM objects of brand-kit.html, so the JSON is rebuilt
 * from those, with every name unchanged.
 *
 *   node scripts/kit/tokens-from-kit.mjs           compare tokens.json with the kit
 *   node scripts/kit/tokens-from-kit.mjs --write   rewrite tokens.json from the kit
 *
 * brief/ is not committed. Without it the comparison is reported as skipped, never
 * as passed. Exit codes: 0 match or skipped, 1 mismatch, 2 internal error.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXTENSION_KEY, KIT_TOKENS, REPO_ROOT } from '../lib/tokens.mjs';

const KIT_PAGE = 'brief/brand-kit/Brand Kit/brand-kit.html';
const EXPECTED = { primitives: 44, semantic: 60 };

/**
 * The two places where the kit's data cannot be copied as it is. Both are the open
 * questions its README ends with, and both are answered in docs/brand-notes.md.
 */
const SPECIAL_REFERENCES = {
  'blue-950': {
    alias: 'dark-950',
    note: 'The kit maps this token to blue-950, which its primitive scale does not define (it stops at blue-900). dark-950 has the value the kit page falls back to. This build never renders the token: see docs/brand-notes.md.',
    data: { kitReference: 'blue-950', kitReferenceDefined: false },
  },
  'dark-900-60': {
    alias: 'dark-900',
    note: 'dark-900 at 60% opacity, emitted as color-mix() the way the kit README describes.',
    data: { kitReference: 'dark-900-60', alpha: 0.6 },
  },
};

/** Pulls a `const NAME = {...};` object literal out of the kit page. It is valid JSON. */
function readKitObject(html, name) {
  const match = new RegExp(String.raw`const ${name} = (\{[\s\S]*?\});`).exec(html);
  if (!match) throw new Error(`${name} not found in ${KIT_PAGE}`);
  return JSON.parse(match[1]);
}

export function buildTokens(primitives, semantic) {
  const groupOf = new Map();
  const primitiveTree = { $type: 'color' };
  for (const [group, rows] of Object.entries(primitives)) {
    primitiveTree[group] = {};
    for (const [name, hex, starred] of rows) {
      groupOf.set(name, group);
      primitiveTree[group][name] = {
        $value: hex,
        ...(starred ? { $description: 'Marked as the brand color in the kit.' } : {}),
      };
    }
  }

  const semanticTree = { $type: 'color' };
  for (const [group, rows] of Object.entries(semantic)) {
    semanticTree[group] = {};
    for (const [name, reference] of rows) {
      const special = SPECIAL_REFERENCES[reference];
      const target = special?.alias ?? reference;
      if (!groupOf.has(target)) throw new Error(`${name} points at ${reference}, which the kit does not define`);
      semanticTree[group][name] = {
        $value: `{primitive.${groupOf.get(target)}.${target}}`,
        ...(special ? { $description: special.note, $extensions: { [EXTENSION_KEY]: special.data } } : {}),
      };
    }
  }

  return {
    $description:
      'FX Replay color tokens, rebuilt from the brand kit page (brand-kit.html, PRIM and SEM) because the kit shipped without its token files. Names are the kit\'s. Primitives hold the literal values and semantic tokens alias them. What this project adds is in extensions.json. Rebuild or verify with scripts/kit/tokens-from-kit.mjs.',
    primitive: primitiveTree,
    semantic: semanticTree,
  };
}

const count = (tree) =>
  Object.entries(tree).filter(([key]) => !key.startsWith('$')).reduce((sum, [, group]) => sum + Object.keys(group).length, 0);

function main(argv) {
  const kitPage = join(REPO_ROOT, KIT_PAGE);
  if (!existsSync(kitPage)) {
    console.log(`tokens-from-kit: skipped. ${KIT_PAGE} is not here (brief/ is not committed).`);
    return 0;
  }
  const html = readFileSync(kitPage, 'utf8');
  const built = buildTokens(readKitObject(html, 'PRIM'), readKitObject(html, 'SEM'));

  const found = { primitives: count(built.primitive), semantic: count(built.semantic) };
  if (found.primitives !== EXPECTED.primitives || found.semantic !== EXPECTED.semantic) {
    console.error(`tokens-from-kit: the kit README promises ${EXPECTED.primitives} primitives and ${EXPECTED.semantic} semantic tokens; the page holds ${found.primitives} and ${found.semantic}.`);
    return 1;
  }

  const output = `${JSON.stringify(built, null, 2)}\n`;
  const target = join(REPO_ROOT, KIT_TOKENS);
  if (argv.includes('--write')) {
    writeFileSync(target, output);
    console.log(`tokens-from-kit: wrote ${KIT_TOKENS} (${found.primitives} primitives, ${found.semantic} semantic).`);
    return 0;
  }
  if (!existsSync(target) || readFileSync(target, 'utf8') !== output) {
    console.error(`tokens-from-kit: ${KIT_TOKENS} does not match the kit. Run with --write, or explain the difference.`);
    return 1;
  }
  console.log(`tokens-from-kit: ${KIT_TOKENS} matches the kit (${found.primitives} primitives, ${found.semantic} semantic).`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`tokens-from-kit: internal error: ${error.stack ?? error}`);
    process.exitCode = 2;
  }
}
