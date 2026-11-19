# Decision log

One line per decision, newest last: what was decided and why. A decision that shapes the
project or is costly to reverse also has an ADR in this folder.

## Phase 0: the system (2026-11-18)

- **The starting positions are ADRs** [0001](0001-astro-react-islands-strict-typescript.md),
  [0002](0002-one-deployable.md), [0003](0003-persistence-behind-a-repository.md),
  [0004](0004-the-offer-is-the-free-plan.md), [0005](0005-email-first-signup-without-password.md),
  [0006](0006-contract-first-users-api.md), [0007](0007-analytics-as-code.md),
  [0008](0008-experiments-assigned-at-the-edge.md), [0009](0009-demo-carrying-a-third-party-brand.md),
  [0010](0010-agents-on-fable-at-max-effort.md). They were fixed before any code existed, so
  everything after is built against them.
- **What was assumed about FX Replay before the build is written down as assumptions**
  (`docs/research/assumptions.md`). Nothing from that list reaches copy or documents until
  the research confirms it at the source.
- **Node 24 LTS, `engines >=22.23.4`, npm as the package manager.** Astro 7.4.13 requires
  Node 22.23.4 or newer (npm registry, 2026-11-18). npm ships with Node, so a reviewer
  installs nothing else.
- **A minimal `package.json` in Phase 0.** No dependencies: the system has real, runnable
  commands before any product code exists.
- **Area rules live in `.claude/rules/` with `paths` frontmatter,** not in nested `CLAUDE.md`
  files. They can target file types across folders, they exist before the code does, and a
  reviewer finds the whole system in one directory.
- **The token rule is one dependency-free script shared by the edit hook and CI.** It flags
  hex colors, color functions with literal arguments, named colors in CSS, and references to
  primitive tokens.
- **Primitives are recognized from the generated stylesheet, not from a list.** A custom
  property declared with a literal color is a primitive. One declared with `var()` is an
  alias and is free to use. This is the kit's own definition, and the rule switches on by
  itself when the tokens land.
- **Generated files are recognized by an `@generated` marker in their first five lines,**
  not by a path list. The protection follows the file and a new generator needs no hook
  change.
- **The edit guard fails closed** (`onFailure: "block"`). A guard that lets every edit
  through when its script crashes is not a guard.
- **The edit guard also protects `brief/`.** The challenge and the brand kit stay as
  received.
- **Hooks find the repository with `git rev-parse --show-toplevel`,** not with
  `${CLAUDE_PROJECT_DIR}`. Claude Code's documentation says that variable keeps pointing at
  the launch directory when a session is moved with `/cd`, which would break a fail-closed
  guard. The scripts take the root from their own location.
- **The after-edit hook runs only the token rules for now.** Formatting and ESLint join it in
  the commit that installs them, so the hook never carries a step that does nothing.
  Provisional until Phase 2.
- **`growth-researcher` may write, but only under `docs/research/`,** enforced by a hook in
  its frontmatter. Its findings land in a file in its own words, and nothing else in the
  repository is its to change.
- **Every agent has an explicit tool allowlist.** Inheriting tools would hand a reviewer
  every connector attached to the session that starts it.
- **No skill forks.** `/ship-check` and `/track-event` have to start reviewer agents, so they
  run in the main conversation. ADR 0010's model rule therefore applies to agents only.
- **`chrome-devtools-mcp` is pinned to 1.13.0 and runs headless with an isolated profile,**
  a 1440x900 default viewport, and usage statistics and CrUX lookups off. Reproducible, a
  fresh visitor on every start, and a development tool that sends nothing to Google.
  Verified locally: 33 tools, screenshots at 360, 768 and 1440.
- **The PostHog MCP server is not configured yet.** It is added when the PostHog project
  exists, in Phase 4.
- **Permissions.** Allowed without asking: npm scripts, the project's node scripts,
  `git add` and `git commit`, both MCP servers, web search, and fetches to fxreplay.com and
  to the Astro and Claude Code docs. Always asked: `gh repo` commands and force pushes.
  Denied: reading env files. `npm install <package>` is deliberately not pre-approved, so
  every new dependency is seen.

## Phase 1: ground (started 2026-11-18)

- **`tokens/tokens.json` is rebuilt from the kit page by a script,** in the W3C design-tokens
  shape with hex strings, which is how the kit's README describes the file. The same script
  proves the committed file still matches the kit (`npm run check:kit`): 44 primitives, 60
  semantic tokens, every name unchanged.
- **One naming rule for CSS names:** the token's own name, lowercased, spaces to hyphens. The
  three brand primitives therefore become `--electric-blue`, `--black` and `--accent`. Their
  real names cannot be known without the kit's `tokens.css`; asked in the brand notes.
- **The kit's tokens and our extensions are separate files,** not blocks in one file.
  `tokens/tokens.css` is then exactly the file the kit's README describes and could be
  handed back to its authors.
- **`btn-bg-primary-disabled` aliases `dark-950`,** the value the kit page falls back to,
  because its real target (`blue-950`) is undefined and the stylesheet has to be valid. The
  token is never rendered. The brand notes propose repointing it to `dark-500`.
- **Browser target: Baseline "widely available".** It settles the kit's second open question:
  `color-mix()` has been widely available since 2025-11-09 (webstatus.dev), so
  `card-bg-translucent` is emitted with no fallback.
- **Five color extensions:** `border-field`, `border-field-error`, `border-focus`,
  `text-link`, `card-text-link`. Each is the smallest move inside the kit's palette that
  reaches WCAG AA where the kit's own pairing does not, and each is named in the kit's
  convention.
- **The hover and pressed edge for the primary button is not a token yet.** It changes how
  the brand's main control looks, so it is chosen from two rendered versions first.
- **Contrast pairs live in `tokens/contrast-pairs.json`.** `ui` pairs are enforced and may
  name only semantic or extension tokens. `kit` pairs are an audit and never fail the build.
  The tables in `docs/brand-notes.md` are generated from the same file.
- **Ratios are compared unrounded and shown truncated to two decimals,** so a displayed value
  never overstates the real one.
- **Hosting and persistence: Cloudflare Workers with D1**
  ([ADR 0011](0011-cloudflare-workers-with-d1.md)). One platform covers static assets, the
  API, edge logic, the database, rate limiting and the CDN, and development runs on the
  production runtime with a local database and no account.
- **The Users API contract is `docs/api.md`,** written before the implementation. Create is
  idempotent by key, so a retry after a timeout replays the first answer instead of reporting
  "already registered". Lists page by key, not by offset. `email_taken` reveals that an
  address is registered: a deliberate trade for a useful next step, bounded by rate limiting,
  and the first thing that would change in production.
- **Fonts go through Astro's Fonts API,** which downloads, self-hosts and preloads them and
  generates metric-matched fallbacks. Lato 400, 700, 900 and Nunito Sans 400, 600, 700, Latin
  subset, from the open-licensed Fontsource packages. Set up with the scaffold.
- **React or Preact for the island is decided by measurement,** not in advance. The form is
  written with hooks only, so both run it. The scaffold starts on React, the stack ADR 0001
  names, and the two are compared on bytes shipped and blocking time before the choice is
  recorded.

## Phase 2: foundation (started 2026-11-18)

- **Scaffolded by hand on Astro 7.4, `@astrojs/cloudflare` 14.4 and React 19,** with
  TypeScript 6 on Astro's `strictest` preset. Every file in the scaffold is one that was
  chosen, and the strictest preset catches unchecked index access and misuse of optional
  properties.
- **Fonts use the local provider, pointed at six files inside the Fontsource packages.** The
  package provider emitted every subset: 21 files, 27 `@font-face` rules and 5.4 KB of inline
  CSS. Naming the files gives exactly six, and the license still ships with the install.
  Only Lato 900, the headline face, is preloaded.
- **The page's CSS is inlined.** One page, a few kilobytes: inlining removes the only
  render-blocking request. To be confirmed by measurement in the performance pass.
- **Astro's session store is switched off.** The signup issues its own signed cookie, and the
  adapter would otherwise provision a KV namespace on deploy that nothing uses.
- **Images are optimized at build time only** (`imageService: 'compile'`). Nothing is
  transformed at request time, so the deployment needs no image service.
- **npm's install-script gate stays closed.** `workerd` and `esbuild` ask to run install
  scripts, and both work without them, so none is approved.
- **Framework telemetry is off** on the development machine, and will be in CI.
- **Prettier formats code and config, not Markdown or the token data.** Tables in the
  documents stay compact, `tokens.json` stays byte-identical to what its script writes, and
  the kit's logo files are never touched.
- **ESLint runs without type information.** One file lints in about a second, which is what
  an edit hook can afford. Types are checked by `astro check`.
- **Accessibility lint uses `eslint-plugin-jsx-a11y-x`.** The original plugin does not
  support ESLint 10, and Astro's own ESLint plugin lists this fork as its peer.
- **The edit hook now formats and lints** the touched file, then applies the token rules. A
  tool that is not installed is skipped, so the hook works on a fresh clone.
- **One open advisory, accepted:** a moderate denial-of-service report against `minimatch`
  inside the accessibility lint plugin. It is a development tool matching patterns we wrote.
  The offered fix is a downgrade that breaks the plugin.
- **The Users API is plain functions from `Request` to `Response`.** The Astro endpoints are
  three-line adapters, and one file (`runtime.ts`) knows about Cloudflare bindings. The whole
  contract is therefore testable in Node with a fake clock and no network.
- **Shared schemas use `zod/mini`.** The form and the server validate with the same rules,
  and the tree-shakable build keeps the form's bundle small. Issues are mapped to the
  contract's own field codes, so the library never leaks into the API.
- **The user and its idempotency key are written in one D1 batch,** which is one transaction.
  There is never a key without its user, so the `request_in_progress` answer was removed from
  the contract. When concurrent duplicates race, the losers replay the winner's answer.
- **Problem types come from one registry** that builds the error responses and one static
  page per type under `/problems/`, so the `type` URI of every error resolves, as RFC 9457
  intends.
- **The session is our own HMAC-signed `__Host-` cookie, valid for one hour.** It authorizes
  only the profile update. The API refuses to start with an empty signing secret.
- **The contract is tested at two levels.** In Node against the in-memory repository (every
  status code), and over HTTP against the real Worker with a real D1 (uniqueness under
  concurrent requests, double submit, concurrent profile updates, the rate limit).
- **`npm run dev` works on a fresh clone with no account.** A setup step writes random local
  secrets to `.dev.vars` and applies the D1 migrations to a local database. The database id
  is left out of `wrangler.jsonc`: Wrangler provisions the remote one on the first deploy.
- **Wrangler's usage metrics are off.**
- **The secrets the Worker needs are declared in `wrangler.jsonc`** (`secrets.required`),
  never their values. A deploy fails when one is missing, and type generation no longer
  depends on a local secrets file.
- **CI runs every check a machine can make:** formatting and lint, types, the token and
  contrast rules, generated files, the system's own tests, the API contract in Node, the
  build, and the same contract over HTTP against the built Worker. End-to-end, axe and
  Lighthouse budgets join it with the page. Actions are pinned to their current major.
- **The research is in `docs/research/brief.md`,** with the outcome of each starting
  assumption. Three things changed what gets built: the free plan has no futures and tighter
  limits than its card shows; "no card" is only safe to say about the free plan; and their
  marketing site is already Astro with React islands, so in production this page would be a
  route in that site, not a separate deployment.
- **Models are chosen by kind of work.** Fable for decisions and critiques, Opus 5.5 for work
  specified beforehand and checked by tests, through a new `implementer` agent. Replaces
  "Fable everywhere", whose token cost interrupted a review.
  [ADR 0012](0012-models-by-kind-of-work.md).
- **Nine events and one primary metric.** Signup conversion rate: visitors who complete
  signup within 7 days of their first landing view, over visitors who viewed the landing.
  Every event names the decision it informs.
  [ADR 0013](0013-event-taxonomy-and-primary-metric.md).
- **No vendor script on the page.** The tracker posts to a collector on the same origin,
  which enforces the registry and forwards to PostHog from the server.
  [ADR 0014](0014-first-party-event-collector.md).
- **The first experiment is `hero_signup`:** a button that leads to the form (what their site
  does today) against an email field in the hero (this page's bet).
  [ADR 0015](0015-first-experiment-hero-signup.md).
- **Each arm of the page is a prerendered document, and "/" picks one at the edge.** The
  Worker hashes the visitor's id, streams that arm from the asset store and records the
  exposure. No rendering per request, so the free plan's CPU limit is never in play, and no
  flicker, because the browser only ever receives one arm. The price: the document is
  `private, no-cache`, so it is revalidated instead of served from a shared cache.
- **The visitor id is an `HttpOnly` cookie set and read by the server.** Scripts never see it.
  The collector, the signup and the landing page attach it themselves, so the signup body no
  longer carries a visitor id or experiment arms, and neither can be forged.
- **Assignment stores nothing.** The arm is a hash of the visitor id and the experiment key,
  so it is the same at the edge, in the API and in a test, and experiments are independent
  of each other.
- **The registry has no free-text type.** A property is an enum, a number, a boolean or a
  narrow string shape that an email address cannot fit, so "no PII in analytics" is enforced
  by the type system and again by the collector.
- **Automated traffic is flagged, not dropped.** Events from agents that look automated carry
  `is_bot`, so the filter is a choice made in analysis and can be audited.
- **Findings of the Phase 2 review, all fixed.** The user list was open when the admin token
  was not set: the guard refused an empty string, and a missing secret is `undefined`. A
  profile update is now one SQL statement, so concurrent updates cannot overwrite each other.
  An expired idempotency key is removed inside the create transaction, so a fresh one is
  never erased. The body limit applies while the body is read, not after. An over-long email
  never reaches the shape check. The list's rate limit runs before the token check, so it
  bounds token guessing. A filled honeypot is logged, without the email.
- **Every rule the review could break without a test failing now has a test:** the re-check
  after a failed insert, the key's 24 hours, the limiters on update and list, the `Origin`
  on update, the key's shape, and the 405 of each route.
- **Tests do not depend on chance or skip silently.** HTTP tests take client addresses from
  a counter with a random start, and fail, not skip, when the admin token is missing.
- **The browser client has its own five-line table of the problems it handles,** held to
  the registry by a test, so the registry's prose is not shipped to the browser.
- **The island runs on Preact:** 25 KB of script instead of 84, measured, with the same
  end-to-end tests green on both. [ADR 0016](0016-preact-for-the-island.md).
- **The signup flow is a pure state machine with a thin component around it.** Every state
  and transition is tested without a browser, and 16 end-to-end tests then drive the real
  page on desktop and phone: the funnel events exactly once, each error state, a retry with
  the same key, a double submit, and axe at every step.
- **End-to-end tests run against the preview, like the HTTP tests,** with Playwright and
  axe. Locally they use the installed Chrome.
- **Our own type, space and shape scales live in `src/styles/scale.css`,** apart from the
  kit's color tokens: the kit leaves sizing open, and plain CSS needs no generator.
- **The signup works without JavaScript.** The form is a real form that posts to `/signup`,
  which creates the account through the same code path and redirects to a static page per
  outcome. It earned its place for a reason found in testing: a visitor who presses Enter
  before the script has loaded used to submit a form that did nothing useful. Now that press
  creates the account. The idempotency key of a plain form is derived from the visitor and
  the email, so a refresh or a second press is the same request.
- **The form further down the page hydrates when the browser is idle,** not when it scrolls
  into view, so it is ready before a visitor can reach it.
- **A strict Content Security Policy with no `'unsafe-inline'`.** Astro's built-in CSP hashes
  every inline script and stylesheet into each page's `<meta>`. Everything else is `'self'`,
  which is possible because the page loads nothing from another origin (ADR 0014). An
  end-to-end test runs the signup under the policy and fails on any violation.
- **The security headers have two senders with one source.** `public/_headers` covers what
  the asset store serves and a middleware covers what the Worker answers. A test keeps them
  equal. The header's policy carries `frame-ancestors`, which a `<meta>` cannot.
- **Known limit of the policy:** a `<meta>` policy governs only what follows it in the
  document, and Astro writes it at the end of the head. What precedes it is fixed at build
  time and holds no visitor input. Moving the whole policy into a per-page header is the
  production step, and it was left out as surface this demo does not need.
- **The Lighthouse budgets are a command and a CI step.** `npm run lighthouse` audits both
  arms on the mobile profile and judges the median of three runs. Its first run failed on a
  missing favicon, which is how the favicon got done.
- **The favicon is the kit's isotype, both files as shipped:** the white one for a dark
  browser interface and the black one for a light one, chosen by a media query.
