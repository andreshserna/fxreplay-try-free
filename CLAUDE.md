# FX Replay "Try FX Replay Free": Growth Engineer challenge

A take-home for the Growth Engineer role at FX Replay (fxreplay.com, a backtesting and
market-replay platform for traders): a landing page, a signup flow and a Users API (create,
update, list), with the analytics, experiment, performance and infrastructure thinking around
them. The business goal is a higher conversion rate from marketing traffic to account creation.

- The source of truth: `brief/Growth_Engineer_Challenge.pdf` and `brief/brand-kit/`.
- Where this file disagrees with the brief or the kit, they win. Tell the candidate.
- Scope and phases: `.claude/rules/plan.md`. Everything committed is in English.

## How it is judged

- The candidate defends every decision live for 60 minutes, and one new requirement is added
  on the spot. **Every decision needs a reason a person can repeat**, written where it can be
  read in a minute.
- **Ambitious in craft, small in surface.** No feature, service or abstraction a reviewer
  would not miss. Inside that surface, push quality as far as it goes.
- **The record must be true.** Nothing is logged, reported or documented unless it happened.
- The AI workflow is graded as its own area, from the files in this repository.

## Commands

| Command | What it does |
|---|---|
| `npm run dev`, `build`, `preview`, `typecheck` | Astro: dev server, build into `dist/`, the build on the local Workers runtime (`npx astro preview stop` ends it), `astro check` |
| `npm run test:system` | Tests for the hooks, checkers and generators (Node's test runner, no dependencies) |
| `npm run gen` | Regenerate `tokens/*.css` and the contrast tables in `docs/brand-notes.md` (`gen:check` fails if stale) |
| `npm run check:tokens` | Token rules over `src/` and `public/`: no color literals, no primitive tokens |
| `npm run check:contrast` | Every pair in `tokens/contrast-pairs.json` against its WCAG threshold |
| `npm run check:kit` | `tokens/tokens.json` still matches the kit (skipped where `brief/` is absent) |

Still to come: `lint`, `test`, `test:e2e`, `lighthouse`. A command that does not exist yet is
"not available", never "passed".

## Map

| Path | What lives there |
|---|---|
| `.claude/` | The AI system: `settings.json` (hooks, permissions), `hooks/`, `agents/`, `skills/`, `rules/` |
| `.mcp.json` | MCP servers: `chrome-devtools` (eyes on the page) and `astro-docs` (the current API) |
| `src/` | `pages/`, `layouts/`, `styles/global.css`, `assets/brand/` (the kit's logos, as shipped). Config: `astro.config.mjs`, `wrangler.jsonc` |
| `tokens/` | The kit's tokens (`tokens.json`, generated `tokens.css`), ours (`extensions.*`), `contrast-pairs.json` |
| `scripts/` | `checks/` (shared by the edit hook and CI), `gen/`, `kit/` (rebuild and verify against the kit), `lib/` |
| `docs/decisions/` | `log.md` (every decision, one line each) and the ADRs (the important ones) |
| `docs/research/` | Evidence: `assumptions.md` (what must be verified), `brief.md` (what was found, with sources) |
| `brief/`, `notes/` | Inputs and private review notes. Gitignored. `brief/` is read-only |

Planned, not built yet. Update this table when each lands:

| Path | What will live there |
|---|---|
| `src/pages/api/` | The Users API endpoints |
| `src/components/` | Page sections, and the signup form: the only island that hydrates |
| `src/lib/api/` | The contract: shared schemas, the typed client, the error mapping |
| `src/lib/analytics/`, `src/lib/experiments/` | Event registry and `track()`; edge assignment and exposure |
| `src/server/` | Repository interface and implementations, session cookie, rate limiting |
| `tests/` | Unit and contract tests, end-to-end tests with axe |

Area rules in `.claude/rules/` load with the files they govern. `/ship-check` reports go to `docs/ai/reports/`.

## Invariants

A hook or CI enforces each one wherever a machine can check it.

1. Colors come from the kit's semantic tokens. No hex outside the token source, and components
   never reference primitives. Our extensions live in their own files.
2. Every foreground and background pair the UI uses passes the contrast script: 4.5:1 for
   text, 3:1 for large text and for the boundaries of controls.
3. The logo files are used as shipped: no recolor, stretch or effects.
4. Events exist only in the registry. `track()` does not compile for anything else, and the
   docs table is generated, never hand-edited.
5. No PII in analytics payloads. Email goes to the database and nowhere else.
6. Analytics and other third-party code never block rendering or the signup. If they fail,
   the signup still works.
7. Lab budgets, Lighthouse mobile: LCP ≤ 2.0 s, CLS ≤ 0.05, TBT ≤ 150 ms; performance ≥ 95;
   accessibility, best practices and SEO 100 (SEO with the indexing flag on). Field targets
   at p75: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.
8. WCAG 2.2 AA, checked by axe in CI and by a manual keyboard pass.
9. No invented facts, testimonials, numbers or logos. No promises of profit.
10. Nothing is reported as done without evidence from this session.

## How decisions are made

The candidate owns every decision and reviews them all. Claude's recommendation is the
default, so work never waits on a choice that has an obvious answer.

- **Routine** (libraries, tooling, structure, mechanisms): take the option the project's
  principles point to and add one line to `docs/decisions/log.md`: what and why.
- **Significant** (whatever shapes the project or is costly to reverse: hosting and
  persistence, the API contract, the event taxonomy and the primary metric, which experiment
  goes first, React or Preact for the island, a change to ADRs 0001 to 0010, a dependency
  with real weight, any third-party script): write the ADR with its options (`/adr`), brief
  the candidate at once, and continue on the recommendation unless told otherwise.
- **Reserved** (visual design, the headline, the wording of the offer): bring rendered
  options and wait for the choice, working meanwhile on what does not depend on it.
- **Hard stops:** making the repository public, creating paid resources, sending anything to
  FX Replay, deleting data, the final submission, and anything that needs a secret or an
  account.

State a disagreement, with its reason, before doing the work. Then do it the candidate's way.

## How we work

- **The main session implements. Reviewers are separate agents** with fresh context and no
  write access, so the author never grades its own work: `design-critic`, `analytics-qa`,
  `web-quality-auditor`, `code-reviewer`, `experiment-analyst`. `growth-researcher` gathers
  evidence and writes only under `docs/research/`. Agents do not see the conversation: give
  them the URL, the scope and the range.
- **Skills:** `/adr`, `/track-event`, `/new-experiment`, `/ship-check` (the gate the candidate runs).
- **Docs and the browser over memory.** Astro's API through `astro-docs`. Claude Code config
  against code.claude.com/docs. Screenshots, traces and payloads through `chrome-devtools`.
  Say plainly what was not verified.
- **Tests** cover behavior a reviewer cares about: unit and contract tests for the API and the
  tracker, end-to-end tests for the signup states and the funnel. Do not chase coverage.
- **When something fights back,** find the cause or try another route before settling for a
  simpler design, and log what was given up and why.
- **The record:** decisions and their reasons in `docs/decisions/`. Documents state what was
  decided and why, not the conversation that led there.
- **Git:** small conventional commits with Claude's `Co-Authored-By` trailer. Never commit
  `brief/` or `notes/`.
