#!/usr/bin/env node
/**
 * PostToolUse check for Edit and Write.
 * Runs the project's machine-checkable rules on the file Claude just touched
 * and, when one is broken, hands the finding straight back to Claude (exit 2).
 *
 * Steps today: the token rules (no color literals, no primitive tokens).
 * Formatting and ESLint join this pipeline in the commit that installs them.
 */
import { checkFiles, formatViolation } from '../../scripts/checks/token-usage.mjs';
import { REPO_ROOT, allow, block, repoRelative, runAsHook, targetFile } from './lib.mjs';

export function run(input, { root = REPO_ROOT } = {}) {
  const file = targetFile(input);
  if (!file) return allow();
  const relativePath = repoRelative(file, root);
  if (relativePath === null) return allow();

  const { violations } = checkFiles({ root, files: [relativePath] });
  if (violations.length === 0) return allow();

  return block(
    [
      `${relativePath} breaks a project rule (.claude/hooks/after-edit.mjs). Fix it before moving on:`,
      ...violations.map((violation) => `  ${formatViolation(violation)}`),
    ].join('\n'),
  );
}

await runAsHook(import.meta, run);
