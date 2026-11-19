# Scope and phases

Scope is decided by what makes the result better for a reviewer. What limits it is the
brief's rule against unnecessary complexity.

## Scope

**Build.** Tokens rebuilt from the kit and enforced; self-hosted fonts; the landing page; the
signup flow with every state; the three API operations with persistence and tests; typed
tracking with the funnel events and the server-side conversion; edge assignment with an
exposure event; a web-vitals event; PostHog live, with a funnel screenshot in the docs; CSP
and security headers; rate limiting; the experiment proposal, and `experiment-analyst` run on
a synthetic fixture; the documents; CI with typecheck, lint, token and contrast checks,
tests, axe, Lighthouse budgets and build; a live deployment; WCAG 2.2 AA; metadata,
structured data and an Open Graph image; the lab budgets met.

**Only if it earns its place.** Each is worth doing when it makes the experience or the
argument stronger, and worth skipping when it only adds surface: a no-JavaScript form
fallback; a signature hero interaction; a consent-aware tracker with a banner; error
tracking; Claude Code reviewing pull requests in CI; an internal users view. Decide each one
and log why.

**Out.** Real authentication, passwords, email delivery, payments, a CMS, a component
library, client state libraries, an analytics backend of our own, containers,
infrastructure-as-code. They would be unnecessary complexity. If one starts to look
necessary, tell the candidate first.

## Phases

| Phase | Output |
|---|---|
| 0. System | The repository, `CLAUDE.md`, rules, agents, skills, hooks, MCP, ADRs for the starting positions |
| 1. Ground | The research brief; tokens rebuilt and audited; fonts; brand notes; the API contract; taxonomy v0; hosting and the first experiment chosen; two or three rendered hero directions |
| 2. Foundation | Scaffold, CI, the Users API with persistence and tests, a skeleton deployed to a live URL |
| 3. Experience | The landing page and the signup flow: every state, responsive, accessible |
| 4. Measurement | Tracker, events, the server-side conversion, experiment assignment and exposure, analytics end-to-end tests |
| 5. Hardening | Audits by the reviewer agents, fixes, security headers, budgets enforced in CI |
| 6. Documents | The documents, the README tour, the `/ship-check` report |

Phase 2 does not depend on the visual direction, so it can start while that is being chosen.
The skeleton is deployed in Phase 2, so every later phase has a live URL and deployment
problems surface early.

A phase ends with `code-reviewer` on its diff and a short digest for the candidate: what
exists with its evidence, the decisions, what is provisional, and what was not verified.
