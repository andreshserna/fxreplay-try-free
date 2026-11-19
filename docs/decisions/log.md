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
