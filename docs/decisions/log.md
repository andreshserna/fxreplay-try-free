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
