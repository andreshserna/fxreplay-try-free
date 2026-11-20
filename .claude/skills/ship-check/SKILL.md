---
name: ship-check
description: The release gate. Runs every deterministic check, then the reviewer agents in parallel, and writes one report to docs/ai/reports/. Run before a phase is called done, before submission, and again after the fixes a gate asked for. The candidate starts it, or the main session does when the work calls for it.
argument-hint: "[scope or phase] [URL of a running production build]"
allowed-tools: Bash(npm run *) Bash(npm test *) Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git rev-parse *)
---

Run the release gate for: $ARGUMENTS

Nothing is fixed during the check. You measure, the reviewers judge, and the report says what
is true at one commit.

## 1. Pin what is being checked

Record `git rev-parse HEAD` and `git status --short`. If the tree is dirty, say so in the
report: the gate describes a commit, not a working copy.

## 2. Deterministic checks

Run each one and record pass or fail with its key numbers and the command used. Do not stop
at the first failure.

| Check | Command |
|---|---|
| System tests (hooks, checkers) | `npm run test:system` |
| Types | `npm run typecheck` |
| Lint | `npm run lint` |
| Token rules | `npm run check:tokens` |
| Contrast | `npm run check:contrast` |
| Generated files are current | `npm run gen:check` |
| Unit and contract tests | `npm test` |
| Build | `npm run build` |
| The API over HTTP | `npm run test:api` |
| End to end, with axe | `npm run test:e2e` |
| Lighthouse budgets | `npm run lighthouse` |

A command that does not exist yet is reported as **not available**, never as passed.

## 3. Reviewers, in parallel

Start these four agents in one message so they run at the same time. They do not see this
conversation: give each the commit, the scope, the range to review, and the URL of a running
production build.

- `code-reviewer`: the diff since the previous ship-check report, or since the phase began.
- `design-critic`: the landing page and the whole signup flow.
- `analytics-qa`: the full funnel as a fresh visitor.
- `web-quality-auditor`: the landing page and the signup flow against the budgets.

If a report opens with a line saying the agent switched to another model, copy that line into
the report. A silent fallback is not acceptable (ADR 0012).

## 4. One report

Write `docs/ai/reports/ship-check-YYYY-MM-DD-HHMM.md`:

1. Commit, scope, date, and how long the gate took.
2. The deterministic checks as a table.
3. Each reviewer's verdict and findings, with their severities unchanged. Do not soften,
   merge or drop a finding. If you disagree with one, say so next to it and say why.
4. Everything that was not verified, collected from all reports.
5. **Verdict:** ship, or fix first, with the blockers listed.

## 5. Hand back

Tell the candidate the verdict and the blockers in five lines or fewer, with the path to the
report. Ask which findings to fix. Fixes happen after the report is written, and
a fixed gate is run again.
