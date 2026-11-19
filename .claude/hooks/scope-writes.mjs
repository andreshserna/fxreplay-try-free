#!/usr/bin/env node
/**
 * PreToolUse guard for agents that may write in one place only.
 * Declared in an agent's frontmatter with the allowed directories as arguments:
 *
 *   node .claude/hooks/scope-writes.mjs docs/research
 *
 * Every Edit or Write outside those directories is blocked. With no directory
 * given, everything is blocked.
 */
import { REPO_ROOT, allow, block, repoRelative, runAsHook, targetFile } from './lib.mjs';

const normalize = (directory) =>
  directory.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');

export function run(input, { root = REPO_ROOT, directories = process.argv.slice(2) } = {}) {
  const file = targetFile(input);
  if (!file) return allow();

  const allowed = directories.map(normalize).filter(Boolean);
  const relativePath = repoRelative(file, root);
  if (
    relativePath !== null &&
    allowed.some((directory) => relativePath.startsWith(`${directory}/`))
  ) {
    return allow();
  }
  const where =
    allowed.length > 0 ? allowed.map((directory) => `${directory}/`).join(', ') : 'nowhere';
  return block(
    `Blocked by .claude/hooks/scope-writes.mjs: this agent writes under ${where} only. Refused: ${relativePath ?? file}. Put the content in your report instead.`,
  );
}

await runAsHook(import.meta, run);
