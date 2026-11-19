#!/usr/bin/env node
/**
 * PostToolUse check for Edit and Write.
 * Formats the file Claude just touched, then runs the project's machine-checkable
 * rules on it. When one is broken, the finding goes straight back to Claude (exit 2).
 *
 * Steps, in order: Prettier, ESLint, the token rules (no color literals, no primitive
 * tokens). A tool that is not installed yet is skipped, so a fresh clone still works.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';

import { checkFiles, formatViolation } from '../../scripts/checks/token-usage.mjs';
import { REPO_ROOT, allow, block, repoRelative, runAsHook, targetFile } from './lib.mjs';

const LINTED = new Set(['.astro', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIPPED_DIRECTORIES = /^(?:node_modules|dist|\.astro|\.wrangler|brief|notes)\//;

/** Runs a tool from node_modules/.bin. Returns its output when it fails, or null. */
function runTool(root, name, args) {
  const binary = join(root, 'node_modules', '.bin', name);
  if (!existsSync(binary)) return null;
  const result = spawnSync(binary, args, { cwd: root, encoding: 'utf8' });
  if (result.status === 0) return null;
  return (
    `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() || `${name} exited with ${result.status}`
  );
}

export function run(input, { root = REPO_ROOT } = {}) {
  const file = targetFile(input);
  if (!file) return allow();
  const relativePath = repoRelative(file, root);
  if (relativePath === null || SKIPPED_DIRECTORIES.test(relativePath)) return allow();
  if (!existsSync(join(root, relativePath))) return allow();

  const problems = [];

  const formatting = runTool(root, 'prettier', [
    '--write',
    '--ignore-unknown',
    '--log-level',
    'warn',
    relativePath,
  ]);
  if (formatting) problems.push(formatting);

  if (LINTED.has(extname(relativePath).toLowerCase())) {
    const lint = runTool(root, 'eslint', [
      '--no-warn-ignored',
      '--max-warnings',
      '0',
      relativePath,
    ]);
    if (lint) problems.push(lint);
  }

  const { violations } = checkFiles({ root, files: [relativePath] });
  problems.push(...violations.map((violation) => formatViolation(violation)));

  if (problems.length === 0) return allow();
  return block(
    [
      `${relativePath} breaks a project rule (.claude/hooks/after-edit.mjs). Fix it before moving on:`,
      ...problems.map((problem) => problem.replace(/^/gm, '  ')),
    ].join('\n'),
  );
}

await runAsHook(import.meta, run);
