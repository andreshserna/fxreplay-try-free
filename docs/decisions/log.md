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
- **The plain-form path is progressive enhancement, not an invention.** It is what GOV.UK's
  service manual requires ("make your page work with HTML first"), what React Router states
  as a principle ("everybody has JavaScript disabled until it's loaded"), and what SvelteKit's
  form actions and Astro's own actions provide. Read on 2026-11-18. It was kept to its
  smallest form: one endpoint on the same code path and four static pages.
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
- **Deployed to Cloudflare** at a `workers.dev` address, with the canonical URL built in.
  Checked on the live site: the arm and the visitor cookie on `/`, the security headers on
  Worker and asset responses, the cache rules, a 422 for a bad email, and a 401 on the user
  list without a token. Secrets were generated on the deploying machine, outside the
  repository, and uploaded with the deploy.
- **Back to React for the island.** Preact was built and measured first: 25 KB against 82,
  and identical lab scores. With no budget separating them, the team's own stack won.
  [ADR 0017](0017-react-for-the-island.md), which supersedes 0016.
- **The page follows the "replay" direction,** chosen from three rendered hero options: the
  product is shown, not described, by an original illustration of a replay with a simulated
  trade still open. The "offer card" direction is kept as experiment 4 in the backlog.
- **Seven sections, each answering one objection:** what it is (hero), can I believe it (three
  sourced figures), how it works, who it is for, what the catch is (the free plan's limits,
  stated), what else (six questions), and the form again.
- **The figures bar shows only what fxreplay.com shows.** Their own count of traders is worded
  as theirs, the number of markets on the free plan is a count of their Markets page, and no
  rating is shown: the Trustpilot page could not be read at the source.
- **The illustration has its own tokens** (`chart-*`), each an alias of a kit color. Rising
  candles are Electric Blue and falling ones near-white, not green and red, so the picture
  reads as the brand and does not color a trade as good or bad.
- **No `style` attribute anywhere.** The first version of the illustration passed its numbers
  through style attributes, which the Content Security Policy blocks. The end-to-end test
  that fails on any policy violation caught it, and the geometry is now fixed in CSS.
- **Metadata, structured data and the share image.** Open Graph and Twitter tags on every
  page. A `WebPage` and a `FAQPage` in JSON-LD, built from the same list the FAQ section
  renders, so the two cannot disagree. The page claims no publisher: it is a demo and does
  not speak for the company. The share image is drawn from the tokens, the two families and
  the wordmark as shipped (`npm run gen:og`) and committed, so a build needs no browser.
- **The primary button keeps an edge when hovered or pressed** (`btn-border-primary`): the
  kit's hover and pressed fills fade into the ground. Recorded in the brand notes as a
  question for their design team.
- **`npm run dev` serves the landing page too.** The development server has no asset store
  to stream a prerendered arm from, so there "/" redirects to the visitor's arm. Found by
  running the command a reviewer would run first.
- **Changes from the design critique of the live page** (`design-critic`, with its own
  screenshots at three widths, both arms):
  - The risk reversal and the error message now share one slot under the button. Before,
    a line reserved for errors pushed "Free plan, no credit card" 44px away from the button
    on one arm and 12px on the other, so the arms differed in more than the element under
    test.
  - The moment of conversion is designed: the button keeps its width while busy, the hero
    illustration stays put when the form grows into the profile step, the copy that asked
    for the signup steps aside once the account exists, and the final state has a next
    action.
  - A call to action after the free plan's limits, the page's strongest argument. Until
    then the page had one button and one form, five phone screens apart.
  - The primary button's styles moved to the global stylesheet: the outcome pages of the
    plain form used the class without them and showed a bare link.
  - "Years of market days" became "A month of market days": the free plan replays one month
    per session, and the page's own plan card said so two sections later.
  - In the illustration, the play key is outlined, not filled like a second primary button,
    and the "step back" key is gone: rewind is a paid feature.
- **Hover styles apply only where a pointer can hover,** so a tapped button on a phone does
  not stay on its dark hover fill.
- **Changes from the analytics review** (`analytics-qa`, in a real browser against the local
  Workers runtime):
  - A batch the collector could not be reached with is kept and sent again when the
    connection returns. Before, a failure while offline was dropped, which is exactly when a
    failed signup happens and when the failure guardrail needs the event.
  - A page under `/variants/` opened directly is a preview, and the tracker records nothing
    there. The edge did not assign it, so its events would have named an arm the visitor was
    never given.
  - `signup_started` fires once per page load, as the registry says, not once per form.
  - The registry lists only what the page can send: two CTA locations, seven failure
    reasons. A value nothing emits is a promise the data cannot keep.
  - The tracker's request sends no referrer: the page's address can carry campaign
    parameters.
- **Changes from the web quality audit** (`web-quality-auditor`, traces and Lighthouse on the
  deployment, axe and a keyboard pass on every state):
  - A 404 page of our own, with a way back to the offer. The framework's default was a dead
    end for a visitor arriving from a mangled campaign link.
  - HTML reaches the browser without a validator on this host, so a repeat view downloads
    the page again (15 KB) while the performance review said it answered 304. The review
    now says what happens. Tried on the deployment: an `ETag` of our own on "/" (the
    release and the arm) survives only with `no-transform`, which also turns the edge's
    compression off, 55 KB instead of 15 KB on the first view. A first view is what
    campaign traffic is, so the validator was given up, not the compression.
  - The step heading after the signup is an `h2`: as an `h3` it had no parent heading once
    the closing section's own heading steps aside.
  - A status region announces "Creating your account…": the button's label changes, but a
    screen reader whose focus is in the field never hears it. Each form has a name.
  - Internal pages (outcomes, problem types, the 404) declare no canonical address, and the
    problem pages are never indexable. Before, they claimed "/" as canonical while `noindex`.
  - Title and description shortened to fit a search result whole, with the demo's
    disclaimer first. The structured data is one entity, not two for the same address.
  - Not done, with the measurement: preloading the body font. LCP is recorded at the first
    paint in the fallback face, so the preload would not move it and would compete with the
    headline's. Hydrating the closing form on visibility instead of on idle: it would save
    82 KB for visitors who never scroll, and cost a form that is not interactive for about
    a second when they do. The plain-form path covers that second, but without the profile
    step, so idle stays.
  - The performance review said three things the audit could not confirm on the
    deployment (the 304, the reason for the font preload, why CLS is low on Android).
    Corrected to what was measured.
- **Changes from the code review of the measurement and signup work** (`code-reviewer`, on an
  export of the commit, with its own build and browser):
  - An email typed before the form's script has loaded is kept. The script used to write
    its empty state over the field, and the hero form, the arm under test, is the one a
    visitor can reach that early. A browser test holds the scripts back to prove it.
  - The plain form's idempotency key is signed with the server's secret and has a shape the
    API's header cannot present. As a plain digest of the visitor id and the email it could
    be computed and replayed for a session cookie.
  - The plain form refuses another site's Origin and any body that is not a form, in its
    own code and with a test. Before, only a framework default stood there.
  - An exposure is a GET for a document, not a HEAD, a prefetch or an image tag on another
    site, and one address cannot mint them without a ceiling. More automated agents are
    flagged, including a request that names none.
  - The exposure and a plain-form signup carry the campaign from the address the server
    saw, so internal traffic can be excluded without the browser's events.
  - The tracker has one transport, `fetch` with `keepalive` and no referrer. The beacon it
    used on page hide could not drop the referrer.
  - Assignment is pinned by a test: four ids and their arms. A change to the hash would
    have moved every running visitor with all tests passing.
- **Code nothing used is gone,** from the code review's list: the API client's caller-supplied
  abort signal and its `replayed` flag, two pass-through methods in the Users API, two type
  guards, and a `dropped` list only tests read. 163 lines out, 76 in.
- **An experiment that is switched off records no arm.** Before, every user and conversion
  was stored with the control's name while nothing was being tested, which reads later as
  an experiment that ran. The page's events name no arm either.
- **Considered and left as they are,** from the same review: the visitor cookie keeps its
  name and accepts any id of up to 64 characters. A `__Host-` prefix matters on a domain
  shared with other sites, which is what it should get on a path of fxreplay.com. Signing
  it would not stop a script from choosing its arm, since it can discard ids until one
  lands where it wants: the sample-ratio check and the bot flag are the controls. The
  framework's own refusal of cross-site form posts stays on as a second barrier, though its
  403 does not pass through the middleware.
- **Lighthouse runs five times per arm in CI, three locally.** On a shared runner the median
  of three total-blocking-time values missed the 150 ms budget once (173 ms) and passed on a
  second run of the same commit (36 ms). The budget stays where it is. The sample grows.
- **The hero illustration's controls work.** It draws a play button, a step button and a
  speed, and a drawn control that does nothing is the first thing a visitor taps. Play
  reveals the candles behind the hatch, one per 0.6 s, at 1x, 2x or 4x. The continuation was
  chosen so the trade touches neither of its levels and ends back at its entry: the picture
  still shows no result. It is 1.4 KB of plain script, not a second island, inert without
  script, and the lab numbers did not move. This is the "signature hero interaction" the
  plan left to be decided.
- **`replay_demo_used`, a tenth event:** the first use of those controls, once per page
  load. It answers whether the interaction earns its place: do visitors who play it sign
  up more than those who do not.
- **No text below 16px.** The smallest step of the type scale was 13 to 14px, used for
  captions, labels and notices. It is now 16px, and secondary text is set apart by color
  and weight. A browser test reads every text element's computed size on both arms.
- **FAQ answers open and close by growing.** `interpolate-size` animates the height to and
  from `auto` where the browser has it. Elsewhere the answer opens at once and fades in.
  No script.
- **A call to action travels to the form instead of cutting to it.** `scroll-behavior:
  smooth`, off under reduced motion. The cursor enters the email field when the page has
  arrived (`scrollend`), not on the tap: focusing first raises a phone's keyboard mid-way.
- **A redesign against the category's own pages** ([research](../research/visual-patterns.md):
  five rendered sites, 2026-11-19). What they share and this page lacked:
  - **The steps are shown, not boxed.** Three alternating rows, each with an original
    drawing of its moment (a replay, a trade with its two levels, a journal). No site in the
    category shows steps as three numbered boxes; all show the product.
  - **A label only where it adds something.** The uppercase label above every section
    heading is gone, the one above the headline included. No site puts one on every section.
  - **The figures are a line of proof, lighter than the headline.** Stats rows exist on
    three of five sites and are never the loudest thing. "2003" became "23 years of EUR/USD
    history": a year is not a measure.
  - **The header stays, with a call to action in it,** as on four of five. It is an outline
    button, so the filled one still belongs to the hero and the form. A new
    `cta_location: header`.
  - **The illustration reaches the first phone screen:** its top is at 444px of 780 at 360
    wide, with its controls in view. Before, it started at about 520.
  - **No stock photographs.** Two were mocked up and dropped: one stock-looking photo was
    found on one of the five sites, outside its pitch. The category shows the tool.
- **The footer ends the page the way a replay ends:** a tape of candles that stops at the
  playhead, then the wordmark and the two notices side by side. Decoration in the hero's
  language, inline SVG, no request.
- **The Lighthouse check calibrates its CPU slowdown to the host.** Lighthouse's 4x assumes a
  high-end desktop and its documentation says to calibrate elsewhere. With a fixed 4x one
  commit measured a total blocking time of 173 ms and of 36 ms on two CI runners, and the
  redesign failed the gate at 162 ms while measuring 0 ms locally. The budget is unchanged.
  The check reads the host's benchmark and scales the slowdown (4x at 1750), which makes the
  local run harder (6.4x) and a slow runner's fairer. Tried first and dropped:
  `content-visibility` on the sections below the first screen cut layout work by a tenth and
  needed a script to keep anchors exact.
- **An evaluation sheet, `docs/evaluation-sheet.md`, linked from the top of the README.** A
  reviewer grades against the brief's list, and the deliverables are organized by document,
  not by that list. The sheet follows the brief line by line and only points: what was
  built, with what, and where to check it. It makes no claim another document does not hold.
- **Total blocking time is judged only on a host with four cores or more; below that it is
  reported.** After the calibration, three CI runs of four still missed the budget at about
  190 ms. Pinning Chrome and the server on one machine, at one benchmark: 0 ms on twelve
  cores, 0 to 10 ms on four, 109 to 122 ms on two. The number on a two-core runner is the
  runner's contention, which Lighthouse's own hardware guidance warns of. Given up: on the
  current runner a blocking-time regression does not fail the build. The budget itself is
  unchanged, every other budget is still judged on every push, and CI now publishes the
  Lighthouse table and reports with each run.
- **A public PostHog dashboard, linked from the evaluation sheet and the analytics plan.** A
  screenshot shows that the pipeline counted once. A dashboard lets a reviewer see it count:
  the funnel, the experiment by arm, exposures per arm, field Web Vitals, failures by reason
  and the bot flag. It holds aggregates only and is labelled as test traffic.
- **The four-core rule held on its first judged CI run.** On a four-core shared runner the
  same commit that measured 193 and 215 ms on two cores measured 13 and 7 ms, judged and
  passing. Blocking time is judged in CI again.
- **Two faults in the performance gate, found on one CI run and fixed.** Piping the check
  into `tee` to publish its table made the step report `tee`'s status: a run where
  Lighthouse could not audit the page passed. The step now sets `pipefail`. And a run
  Lighthouse cannot audit (`NO_NAVSTART`) is repeated up to three times, because it says
  nothing about the page. Three failures are an error, never a pass.
- **The illustration's pause test compares the replay's position, not what is drawn.** A
  candle revealed just before the pause was still fading in, and the test failed once on a
  faster runner. The page was right and the test raced it.
- **`docs/ai-workflow.md` answers the brief's four human-judgment questions directly, in
  the first person:** what the candidate did himself, what was delegated, what he sent
  back, and how the work was validated. The document described the system and what its
  reviewers caught, and left the person's part to be inferred. Only what the working record
  holds is stated.
- **The human-judgment section starts from the specification.** What the specification
  fixed before any code (the API's behavior, the funnel and the primary metric, the
  experiment's candidates, the AI system, the scope) is the larger part of the candidate's
  decisions, and the first version listed only the starting positions and the later calls.
  The delegated list is what was left to recommendation inside the specification.
- **`npm run preview` builds before it serves, and listens on `127.0.0.1`.** On a fresh
  clone the README's two commands failed: the adapter's preview needs a build and the
  script ran only the setup. Where `localhost` resolves to `::1` first, the server also
  listened only there while the tests default to `127.0.0.1:4321`. Both were found during
  the first ship-check and reproduced in a fresh clone.
