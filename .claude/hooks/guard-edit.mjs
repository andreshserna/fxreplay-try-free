#!/usr/bin/env node
/**
 * PreToolUse guard for Edit, Write and NotebookEdit.
 * Blocks changes to files Claude must not write by hand.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { REPO_ROOT, allow, block, repoRelative, runAsHook, targetFile } from './lib.mjs';

/**
 * What it blocks, and why:
 *   1. Secrets: .env, .env.*, .dev.vars, .dev.vars.*, *.pem (the *.example files stay editable).
 *   2. Inputs: brief/ (the challenge and the brand kit, as received).
 *   3. Generated files: anything whose first lines carry the "@generated" marker.
 *      Their source is edited instead and the generator is run again.
 *
 * Keep the literal marker out of the first five lines of any hand-written file,
 * this one included.
 */
const GENERATED_MARKER = /@generated\b/;
const HEAD_LINES = 5;

const SECRET_FILE = /^(?:\.env(?:\..+)?|\.dev\.vars(?:\..+)?)$|\.pem$/i;
const SECRET_EXAMPLE = /^\.(?:env|dev\.vars)\.example$/i;

const READ_ONLY = [
  {
    matches: (path) => path.startsWith('brief/'),
    reason:
      'brief/ holds the challenge and the brand kit as received. They are inputs: read them, never change them.',
  },
];

const head = (text) => text.split('\n', HEAD_LINES).join('\n');

/** Returns the reason an edit is refused, or null when it may proceed. */
export function refusal({ relativePath, existingHead = '', newContent }) {
  const name = basename(relativePath);
  if (SECRET_FILE.test(name) && !SECRET_EXAMPLE.test(name)) {
    return `${relativePath} can hold secrets. Claude does not read or write it. Document new variables in .env.example and ask the candidate to set the value.`;
  }
  for (const rule of READ_ONLY) {
    if (rule.matches(relativePath)) return rule.reason;
  }
  if (GENERATED_MARKER.test(existingHead)) {
    return `${relativePath} is generated. Change its source and run the generator named in its header (npm run gen).`;
  }
  if (newContent !== undefined && GENERATED_MARKER.test(head(newContent))) {
    return `${relativePath} would start with the generated marker. Only generator scripts write such files.`;
  }
  return null;
}

export function run(input, { root = REPO_ROOT } = {}) {
  const file = targetFile(input);
  if (!file) return allow();
  const relativePath = repoRelative(file, root);
  if (relativePath === null) return allow();

  const absolutePath = join(root, relativePath);
  const existingHead = existsSync(absolutePath) ? head(readFileSync(absolutePath, 'utf8')) : '';
  const reason = refusal({ relativePath, existingHead, newContent: input?.tool_input?.content });
  return reason ? block(`Blocked by .claude/hooks/guard-edit.mjs: ${reason}`) : allow();
}

await runAsHook(import.meta, run);
