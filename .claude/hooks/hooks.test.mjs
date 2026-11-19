import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { run as afterEdit } from './after-edit.mjs';
import { refusal, run as guardEdit } from './guard-edit.mjs';
import { REPO_ROOT, repoRelative } from './lib.mjs';
import { run as scopeWrites } from './scope-writes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MARKER = ['@', 'generated'].join('');

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'hooks-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const edit = (root, path, extra = {}) => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Edit',
  tool_input: { file_path: join(root, path), ...extra },
});

/** Runs a hook the way Claude Code does: as a process fed JSON on stdin. */
function spawnHook(script, input, args = []) {
  const stdin = typeof input === 'string' ? input : JSON.stringify(input);
  return spawnSync(process.execPath, [join(here, script), ...args], { input: stdin, encoding: 'utf8' });
}

test('repoRelative: inside, outside and the root itself', () => {
  assert.equal(repoRelative(join(REPO_ROOT, 'src/pages/index.astro')), 'src/pages/index.astro');
  assert.equal(repoRelative(join(REPO_ROOT, '..', 'elsewhere.txt')), null);
  assert.equal(repoRelative(REPO_ROOT), null);
});

test('guard: secret files are refused, their examples are not', () => {
  for (const path of ['.env', '.env.local', '.env.production', '.dev.vars', 'config/.env', 'certs/key.pem']) {
    assert.match(refusal({ relativePath: path }) ?? '', /secrets/, path);
  }
  for (const path of ['.env.example', '.dev.vars.example', 'src/env.d.ts', 'docs/environment.md']) {
    assert.equal(refusal({ relativePath: path }), null, path);
  }
});

test('guard: the brief is read-only', () => {
  assert.match(refusal({ relativePath: 'brief/brand-kit/Brand Kit/README.md' }), /inputs/);
  assert.match(refusal({ relativePath: 'brief/refs/hero.png' }), /inputs/);
  assert.equal(refusal({ relativePath: 'docs/research/brief.md' }), null);
  assert.equal(refusal({ relativePath: 'notes/review-prep.md' }), null);
});

test('guard: generated files are refused, by existing header or by new content', (t) => {
  const root = fixture({
    'tokens/tokens.css': `/* ${MARKER} by scripts/gen/tokens-css.mjs from tokens/tokens.json */\n:root{}\n`,
    'tokens/tokens.json': '{}\n',
    'src/late.ts': `// one\n// two\n// three\n// four\n// five\n// ${MARKER} mentioned on line six is not a header\n`,
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.equal(guardEdit(edit(root, 'tokens/tokens.css'), { root }).exitCode, 2);
  assert.equal(guardEdit(edit(root, 'tokens/tokens.json'), { root }).exitCode, 0);
  assert.equal(guardEdit(edit(root, 'src/late.ts'), { root }).exitCode, 0);
  assert.equal(guardEdit(edit(root, 'src/new.css', { content: `/* ${MARKER} */\n` }), { root }).exitCode, 2);
  assert.equal(guardEdit(edit(root, 'src/new.css', { content: 'body{}\n' }), { root }).exitCode, 0);
});

test('guard: files outside the repository and calls without a file pass', () => {
  assert.equal(guardEdit({ tool_name: 'Write', tool_input: { file_path: '/tmp/scratch/notes.txt' } }).exitCode, 0);
  assert.equal(guardEdit({ tool_name: 'Bash', tool_input: { command: 'ls' } }).exitCode, 0);
  assert.equal(guardEdit({}).exitCode, 0);
});

test('guard process: exit 2 with the reason on stderr, exit 0 otherwise', () => {
  const blocked = spawnHook('guard-edit.mjs', edit(REPO_ROOT, '.env'));
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /Blocked by \.claude\/hooks\/guard-edit\.mjs: \.env can hold secrets/);

  const allowed = spawnHook('guard-edit.mjs', edit(REPO_ROOT, 'src/pages/index.astro'));
  assert.equal(allowed.status, 0);
  assert.equal(allowed.stderr, '');
});

test('guard process: unreadable input is a failure, so onFailure "block" stops the edit', () => {
  const broken = spawnHook('guard-edit.mjs', '{not json');
  assert.notEqual(broken.status, 0);
  assert.notEqual(broken.status, 2);
});

test('after-edit: reports token violations for the touched file only', (t) => {
  const root = fixture({
    'tokens/tokens.css': ':root{--dark-900:#030303;--bg-primary:var(--dark-900)}',
    'src/components/Card.astro': '<div class="card"></div>\n<style>.card{background:var(--dark-900);border-color:#1c1c1c}</style>\n',
    'src/styles/ok.css': '.ok{background:var(--bg-primary)}',
    'docs/brand-notes.md': 'The ground is #030303.',
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const bad = afterEdit(edit(root, 'src/components/Card.astro'), { root });
  assert.equal(bad.exitCode, 2);
  assert.match(bad.message, /src\/components\/Card\.astro:2:\d+  primitive-token/);
  assert.match(bad.message, /src\/components\/Card\.astro:2:\d+  color-literal  Hard-coded color #1c1c1c/);

  assert.equal(afterEdit(edit(root, 'src/styles/ok.css'), { root }).exitCode, 0);
  assert.equal(afterEdit(edit(root, 'docs/brand-notes.md'), { root }).exitCode, 0);
  assert.equal(afterEdit(edit(root, 'tokens/tokens.css'), { root }).exitCode, 0);
  assert.equal(afterEdit(edit(root, 'src/deleted.css'), { root }).exitCode, 0);
});

test('after-edit process: a clean or out-of-scope file exits 0 silently', () => {
  const result = spawnHook('after-edit.mjs', edit(REPO_ROOT, 'CLAUDE.md'));
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
});

test('scope-writes: only the named directories are writable', () => {
  const directories = ['docs/research'];
  assert.equal(scopeWrites(edit(REPO_ROOT, 'docs/research/brief.md'), { directories }).exitCode, 0);
  assert.equal(scopeWrites(edit(REPO_ROOT, 'docs/research/shots/home.md'), { directories }).exitCode, 0);
  assert.equal(scopeWrites(edit(REPO_ROOT, 'docs/research-notes.md'), { directories }).exitCode, 2);
  assert.equal(scopeWrites(edit(REPO_ROOT, 'src/pages/index.astro'), { directories }).exitCode, 2);
  assert.equal(scopeWrites({ tool_input: { file_path: '/tmp/out.md' } }, { directories }).exitCode, 2);
  assert.equal(scopeWrites(edit(REPO_ROOT, 'docs/research/brief.md'), { directories: [] }).exitCode, 2);
});

test('scope-writes process: directories come from the arguments', () => {
  const inside = spawnHook('scope-writes.mjs', edit(REPO_ROOT, 'docs/research/brief.md'), ['./docs/research/']);
  assert.equal(inside.status, 0);

  const outside = spawnHook('scope-writes.mjs', edit(REPO_ROOT, 'CLAUDE.md'), ['docs/research']);
  assert.equal(outside.status, 2);
  assert.match(outside.stderr, /writes under docs\/research\/ only\. Refused: CLAUDE\.md/);
});
