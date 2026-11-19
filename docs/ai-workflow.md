# AI-native workflow

I built this project with Claude Code. The direction and the decisions that carry the
product are mine. The heavy implementation is Claude Code's, inside a system that was
committed before any product code. That system has one job: make the AI's work checkable,
so it could be given a lot of it. A rule a machine can enforce is a hook or a CI step, not a
sentence. The author of a change never reviews it. Nothing is reported as done without
evidence.

Who decided what is in [Human judgment](#human-judgment).

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

## Human judgment

The brief's four questions, answered from the working record.

### What I did myself

- **Set the starting positions before any code existed** (ADRs
  [0001](decisions/0001-astro-react-islands-strict-typescript.md) to
  [0010](decisions/0010-agents-on-fable-at-max-effort.md)): the stack, one deployable, the
  offer as the free plan and not the trial, a signup that starts with the email alone, the
  API contract before the code, analytics as code, experiments assigned at the edge, a demo
  that stays out of search. Everything after was built against them.
- **Set the working agreement the AI operates under,** now in
  [`CLAUDE.md`](../CLAUDE.md#how-decisions-are-made): what it may decide on its
  recommendation, what it must brief me on at once with an ADR, what it must bring to me as
  rendered options and wait for (the visual design, the headline, the wording of the
  offer), and what it may never do alone (publish the repository, spend money, send
  anything to FX Replay).
- **Chose the visual direction** from three rendered heroes, kept a second one for the
  experiment backlog (number 4 in [the proposal](experiment-proposal.md#ranked-backlog)),
  and asked for the line of sourced figures under the hero.
- **Chose React for the island** after both were built and measured
  ([ADR 0017](decisions/0017-react-for-the-island.md)): Preact was smaller with the same
  lab scores, React is the team's stack and its cost was not a penalty here.
- **Changed how models are assigned** ([ADR 0012](decisions/0012-models-by-kind-of-work.md)),
  against my own starting position of every agent on the strongest model.
- **Reviewed the deployed page as a visitor would, more than once,** and sent it back each
  time (below).
- **Signed in to Cloudflare, created the PostHog project and set the analytics key
  myself.** Decided to make the repository and the PostHog dashboard public.
- **Asked for [the evaluation sheet](evaluation-sheet.md),** so a reviewer can grade
  against the brief's own list.

### What I delegated

The implementation and its tests, the research gathering, the reviews, and the drafting of
the documents. Also the technical decisions inside the starting positions: hosting and
persistence, the event taxonomy, the collector, which experiment goes first. Those were
taken on the AI's recommendation and each was written down at once, as an ADR with its
real alternatives or as a line in [the log](decisions/log.md), so I could read it and
overrule it. They stood unless I did. I overruled two: the island library and the model
policy.

### What I rejected or corrected

- **A play button that did nothing.** The hero illustration drew transport controls as
  decoration. Visitors tap what looks tappable. It is now a small playable replay, its
  first use is an event, and "anything drawn as a control responds" is a rule the AI loads
  with every component ([`.claude/rules/experience.md`](../.claude/rules/experience.md)).
- **Text under 16 px.** Captions, labels and notices were set smaller. The type scale now
  has a floor, and a browser test fails on any text below it.
- **An FAQ that snapped open and an anchor that jumped.** Both got a transition, off under
  reduced motion.
- **A page that read as generated.** I ran the page through an outside design critique and
  did not take the critique as law either: I had the AI study how the category's own pages
  handle the same sections ([research/visual-patterns.md](research/visual-patterns.md)).
  The labels above every heading went, the three numbered boxes became drawn rows, the
  figures became a quiet line, and the call to action stays in view.
- **My own request for stock photos.** That same study showed the category sells with the
  product, not with stock imagery. I dropped the photos before any was licensed.
- **A form without JavaScript, accepted only once checked.** I asked how established sites
  and frameworks handle it before agreeing to the pattern. The sources are in the log.
- **Every agent on the strongest model, and Preact.** Above.

The corrections the system's own reviewers made to the AI's work are a separate list,
[further down](#where-ai-output-was-corrected-or-rejected).

### How AI-generated work was validated

- **By the system, on every change:** hooks on each edit, tests run and diffs read before a
  commit, reviewer agents with no write access, budgets that fail the build, and
  measurements on the deployment instead of the local machine.
- **By me, on the result:** on the rendered, deployed page and not on reports of it. And by
  asking for the reasoning behind each decision I had not made myself (the island library,
  the form without JavaScript, the signup body, the analytics tooling), to be able to defend
  each one myself.
- **By a rule about the record:** nothing is written down as done unless it happened in
  that session. It is why this document can list claims the AI made and had to withdraw.

## Where AI improved execution

- **An independent review found a real hole.** `code-reviewer` showed, with a request against
  the built Worker, that the user list was open when the admin token was not set. The
  author's own test had passed an empty string, and a missing secret is `undefined`. It also
  found lost updates under concurrent requests, a quadratic regex, and six rules that no test
  held. All are fixed, each with a test.
- **Research from real requests.** The research agent read FX Replay's site and found that
  the free plan has no futures and tighter limits than its pricing card shows, and that
  their marketing site is already Astro with React islands. Both changed what was built.
- **Parallel work with a contract.** While the registry was being designed, three
  specifications ran in parallel on a cheaper model: the API client, the statistics, the
  attribution capture. Each came back with tests and a mutation check.
- **Measurement instead of opinion.** React and Preact were both built and measured before
  choosing between them. The budgets are a command that fails the build.

## Where AI output was corrected or rejected

By the system's reviewers and checks. What I sent back myself is under
[Human judgment](#what-i-rejected-or-corrected).

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
- **A signup that lost what was typed.** An email typed before the form's script loaded was
  wiped when it did, in the arm under test. Every browser test waited for the script first,
  so none could see it. `code-reviewer` held the scripts back in its own browser and showed
  it. Fixed, with a test that does the same.
- **A key that could be computed.** The plain form's idempotency key was a digest of public
  values. The reviewer computed it from outside and replayed it for a session cookie. It is
  now signed with the server's secret.
- **A claim true on one machine.** The performance review said a repeat view answers 304.
  `web-quality-auditor` measured the deployment: it does not. The first fix kept the
  validator by turning compression off, which the next measurement showed. It was reverted
  and the review says what was measured.
- **Events nobody could send.** `analytics-qa` found registry values no code emits, events
  dropped while offline, and preview pages counted as visits. All fixed.
- **A design given up.** The first idempotency design had an "in progress" state. Writing the
  database transaction showed it could not occur, and the contract lost a status code.

## Not done yet

`/ship-check` has not run. Every reviewer agent has run on the deployed page and its findings
are in the decision log, with what was not applied and why. `experiment-analyst` ran on a
fixture labelled synthetic: no experiment has real data. No MCP server for PostHog is
connected: the funnel in PostHog was built through the browser.
