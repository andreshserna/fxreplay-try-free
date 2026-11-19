/**
 * Shared plumbing for the project's Claude Code hooks.
 *
 * Contract (code.claude.com/docs/en/hooks): a command hook receives the event
 * as JSON on stdin. Exit 0 lets the action through. Exit 2 blocks a PreToolUse
 * call, or shows stderr to Claude after a PostToolUse call.
 */
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The repository these hooks belong to, taken from this file's own location.
 * It is never read from the environment: CLAUDE_PROJECT_DIR keeps pointing at
 * the launch directory when a session is moved with /cd.
 */
export const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export async function readHookInput(stream = process.stdin) {
  let raw = '';
  for await (const chunk of stream) raw += chunk;
  return raw.trim() === '' ? {} : JSON.parse(raw);
}

/** The file a tool call targets, or undefined when the call has none. */
export function targetFile(input) {
  const toolInput = input?.tool_input ?? {};
  return toolInput.file_path ?? toolInput.notebook_path;
}

/** Repo-relative POSIX path, or null when the file is outside the repository. */
export function repoRelative(file, root = REPO_ROOT) {
  const path = relative(root, resolve(root, file));
  if (path === '' || path.startsWith('..') || isAbsolute(path)) return null;
  return path.split(sep).join('/');
}

export const allow = () => ({ exitCode: 0 });
export const block = (message) => ({ exitCode: 2, message });

/** Runs `run` as a hook process when the calling module is the entry point. */
export async function runAsHook(meta, run) {
  if (!process.argv[1] || resolve(process.argv[1]) !== fileURLToPath(meta.url)) return;
  const result = run(await readHookInput());
  if (result.message) console.error(result.message);
  process.exit(result.exitCode);
}
