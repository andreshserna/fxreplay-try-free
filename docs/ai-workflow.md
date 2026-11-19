# AI-native workflow

Claude Code built this project inside a system that was committed before any product code.
The system has one job: make the work checkable. A rule a machine can enforce is a hook or a
CI step, not a sentence. The author of a change never reviews it. Nothing is reported as done
without evidence.

Every file named here is in the repository.

## The pieces

| Piece | Where | What it does |
|---|---|---|
| Project instructions | `CLAUDE.md` | What the project is and how it is judged, the commands, the map, ten invariants, how decisions are made |
| Rules by area | `.claude/rules/*.md` | Brand, copy, API, analytics, the experience, documents. Each loads only with the files it governs, through its `paths` |
| Hooks | `.claude/settings.json`, `.claude/hooks/` | Before an edit: refuse secrets, the brief and generated files. After an edit: format, lint, and the token rules, with the findings handed back |
| Permissions | `.claude/settings.json` | Routine commands allowed, secret files denied, repository-level actions asked |
| Agents | `.claude/agents/*.md` | Seven, each with one job, its own tools and a report format |
| Skills | `.claude/skills/*/SKILL.md` | `/adr`, `/track-event`, `/new-experiment`, `/ship-check` |
| MCP servers | `.mcp.json` | `chrome-devtools` and `astro-docs` |
| The record | `docs/decisions/` | A log line per decision, an ADR for each one that is costly to reverse |

## Agents

| Agent | Its output | Access | Model |
|---|---|---|---|
| `growth-researcher` | Evidence with sources, before design and copy | Web and browser. Writes only under `docs/research/` (a hook enforces it) | Opus 5.5 |
| `implementer` | Code and tests from a written specification | Read and write. Never commits | Opus 5.5 |
| `code-reviewer` | Findings on a diff it did not write | Read and run. No write tools | Fable |
| `design-critic` | The five changes with the most impact, from screenshots it takes itself | Read and browser | Fable |
| `experiment-analyst` | Ship, continue or reject, from the pre-registered rules | Read and run | Fable |
| `analytics-qa` | Whether the events in a real browser match the registry | Read, run, browser | Opus 5.5 |
| `web-quality-auditor` | Performance, accessibility and SEO against the budgets | Read, run, browser | Opus 5.5 |

Models follow the kind of work ([ADR 0012](decisions/0012-models-by-kind-of-work.md)): the
stronger model where the output is a decision or a critique, the cheaper one where the output
is specified beforehand and checked by tests. Agents do not see the conversation, so each
brief carries the scope, the files and what "done" means.

## Skills

- **`/adr`** records a decision with its real alternatives and what it would cost to change.
- **`/track-event`** adds an event end to end: the decision it informs first, then the
  registry, the call site, the test, the regenerated docs, then `analytics-qa`.
- **`/new-experiment`** scaffolds a pre-registered experiment: hypothesis, metric, guardrails,
  sample size from the script, decision table, all committed before data exists.
- **`/ship-check`** is the release gate: the deterministic checks, then the reviewers in
  parallel, then one report. Only a person can invoke it.

## MCP

In use:

- **`chrome-devtools`**: how an agent sees the page instead of assuming. Screenshots at three
  widths for design, the network panel to read real payloads, console errors. The research
  agent used it to read FX Replay's tags from actual requests.
- **`astro-docs`**: the current framework documentation. Astro 7 is newer than the model's
  training data, so configuration is checked against the docs, not remembered. The CSP was
  written this way.

Proposed for production, each read-only unless stated, none with access to personal data:

| Server | Used by | For |
|---|---|---|
| PostHog | `experiment-analyst`, `analytics-qa` | Read experiment results and funnels. Create the flag and the insight from the spec |
| GitHub | `code-reviewer` | Review pull requests in CI, as comments |
| Cloudflare | `web-quality-auditor` | Read deploy status, logs and field data |
| Error tracking | the main session | Start a fix from the real stack trace |
| Figma | `design-critic` | Compare the build against the source design and its tokens |
| The CRM | none by default | Lead data stays out of an agent's reach unless a task needs it, scoped per task |

## How the pieces work together

One change, the browser tracker, as it actually went:

1. **A decision first.** The taxonomy and the collector were decided and recorded
   ([ADR 0013](decisions/0013-event-taxonomy-and-primary-metric.md),
   [0014](decisions/0014-first-party-event-collector.md)) before any tracking code.
2. **The registry by hand, in the main session,** because it is the design: nine events, each
   with the decision it informs, and no free-text type.
3. **A written specification to `implementer`** for the tracker: the dependencies to inject,
   the batching rule, what must never throw, the tests to write, the size to report.
4. **Hooks on every edit** formatted the files and ran the lint and token rules.
5. **The diff was read and the tests run** in the main session before the commit. The agent's
   report listed nine places where it had interpreted the specification, and each was read.
6. **End-to-end tests** then drove the real page and asserted the events once, in order.
7. **`code-reviewer`** sees the result at the end of the phase, with no write access.

## Where AI improved execution

- **An independent review found a real hole.** `code-reviewer` showed, with a request against
  the built Worker, that the user list was open when the admin token was not set. The
  author's own test had passed an empty string, and a missing secret is `undefined`. It also
  found lost updates under concurrent requests, a quadratic regex, and six rules that no test
  held. All are fixed, each with a test.
- **Research from real requests.** The research agent read FX Replay's site and found that
  two starting assumptions were wrong: their site is Astro, not Webflow, and the free plan
  has no futures. Both changed what was built.
- **Parallel work with a contract.** While the registry was being designed, three
  specifications ran in parallel on a cheaper model: the API client, the statistics, the
  attribution capture. Each came back with tests and a mutation check.
- **Measurement instead of opinion.** React and Preact were both built and measured before
  choosing between them. The budgets are a command that fails the build.

## Where AI output was corrected or rejected

- **The author's test for the admin token proved nothing.** Found by the reviewer, above.
- **A chart that implied a result.** The first hero illustration showed a trade in profit.
  That is an implied promise, against the copy rule. It was regenerated so the trade is
  undecided.
- **Screenshots taken the wrong way.** A first set came from headless Chrome on the command
  line, which laid a 360 px page out at about 500 px and cropped it. They were retaken
  through the browser server and the mistake is in the notes for later sessions.
- **A stricter reading than specified.** The API client came back treating a 429 without a
  problem body as an unknown answer. An edge rule in front of the Worker answers exactly like
  that, so it was changed to "rate limited".
- **A test suite that failed one run in thirteen.** Client addresses were drawn at random.
  The reviewer measured the failure rate, and addresses now come from a counter.
- **A claim in the log that hid its limits.** "Nine deliberate breaks were each caught" was
  true of the nine tried. The reviewer broke six other rules without a test failing. The
  sentence was removed and the tests written.
- **A design given up.** The first idempotency design had an "in progress" state. Writing the
  database transaction showed it could not occur, and the contract lost a status code.

## Not done yet

`/ship-check`, `design-critic`, `analytics-qa` and `web-quality-auditor` have not run: the
page is not built beyond its skeleton and the signup. `experiment-analyst` runs on a fixture
labelled synthetic. No MCP server for PostHog is connected: the funnel in PostHog was built
through the browser.
