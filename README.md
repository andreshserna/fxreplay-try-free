# Try FX Replay Free

A take-home for the Growth Engineer role at FX Replay: a landing page, a signup flow and a
Users API, with the measurement, the experiment and the operations around them. The
direction and the product decisions are mine. The heavy implementation is Claude Code's,
inside a system that is itself part of the submission:
[who decided what](docs/ai-workflow.md#human-judgment).

> A candidate's demo. Not the official FX Replay site. Accounts created here exist only here.

**Live:** https://fxreplay-try-free.mauricioserna123.workers.dev

**Reviewing it?** [docs/evaluation-sheet.md](docs/evaluation-sheet.md) takes the brief line by
line: what was built for each, with what, and where to check it.

## The 60-second tour

1. **Open the live site.** You are in one arm of an experiment, decided at the edge before
   any HTML was sent. Reload: same arm. The other one is at
   [`/variants/cta_button/`](https://fxreplay-try-free.mauricioserna123.workers.dev/variants/cta_button/)
   or [`/variants/inline_email/`](https://fxreplay-try-free.mauricioserna123.workers.dev/variants/inline_email/).
2. **Sign up** with any address. Then try the states: a malformed email, the same email
   twice, the optional profile step, "Skip".
3. **Turn JavaScript off and sign up again.** It still creates the account.
4. **Open the network panel.** No third-party request. Events go to `/api/events` on the
   same origin, and the conversion is recorded by the server, not by the browser.

## Where each deliverable lives

| Deliverable | Where |
|---|---|
| Working implementation | This repository, and the live URL above |
| Architecture overview | [docs/architecture.md](docs/architecture.md) |
| API contract | [docs/api.md](docs/api.md) |
| Analytics plan | [docs/analytics-plan.md](docs/analytics-plan.md): the event tables are generated from the code |
| Experiment proposal | [docs/experiment-proposal.md](docs/experiment-proposal.md), the pre-registered plan in [docs/experiments/hero_signup.md](docs/experiments/hero_signup.md), and a rehearsal of the analysis on synthetic data in [docs/experiments/hero_signup.synthetic-analysis.md](docs/experiments/hero_signup.synthetic-analysis.md) |
| AI-native workflow | [docs/ai-workflow.md](docs/ai-workflow.md). The system itself: [CLAUDE.md](CLAUDE.md), [.claude/](.claude/) (rules, agents, skills, hooks), [.mcp.json](.mcp.json) |
| Performance review | [docs/performance-review.md](docs/performance-review.md) |
| Decisions | [docs/decisions/](docs/decisions/): 17 ADRs and a log with one line per smaller decision |
| Brand | [docs/brand-notes.md](docs/brand-notes.md): how the kit was implemented, answers to its two open questions, the contrast audit |
| Research | [docs/research/brief.md](docs/research/brief.md): every claim on the page traces to it |

## Run it

Node 24. No account and no configuration: local secrets and a local database are created on
the first run.

```sh
npm ci
npm run preview        # the build on the real Workers runtime, at http://localhost:4321
```

`npm run dev` works too, with hot reload. `npx astro preview stop` ends the preview.

## Check it

```sh
npm run lint && npm run typecheck      # format, lint, types
npm run check:tokens                   # no color outside the brand tokens
npm run check:contrast                 # every color pair the interface uses, against WCAG
npm test                               # 223 unit and contract tests
npm run test:system                    # 132 tests of the hooks, checkers, generators and statistics
```

With the preview running:

```sh
npm run test:api                       # the API contract over HTTP, against the Worker and a real D1
npm run test:e2e                       # 54 browser tests on desktop and phone, with axe
npm run lighthouse                     # the performance budgets, on both experiment arms
```

CI runs all of it on every push ([.github/workflows/ci.yml](.github/workflows/ci.yml)). The
end-to-end tests use an installed Chrome locally and Playwright's Chromium in CI
(`npx playwright install chromium` if you have neither).

## What it is made of

Astro 7 with one React island (the signup form), strict TypeScript, Cloudflare Workers with
D1. Pages are prerendered. A Worker runs only for `/` (to pick the experiment arm), the API
and the event collector. The page loads nothing from another origin.

## Assumptions

- **The offer is the free plan,** not the 5-day trial of the paid plans. FX Replay's own
  pages mix the two, and the page says which one it is.
- **Signup is email-first and simulated:** an email creates the account. No password, no
  verification email, no login.
- **Paid traffic lands on phones,** so the page is designed phone-first. Their homepage's own
  mix is mostly desktop, but that is all traffic, not campaign traffic.
- **A 10% baseline conversion and 1,500 visitors a day** size the experiment. Both are stated
  as assumptions and are replaced by the first week of real traffic.
- **Illustration, not screenshots.** No product imagery could be sourced with a clear
  license, so the hero is an original drawing with no tickers or prices.
- **Not indexed.** The page carries another company's brand, so it ships `noindex` behind a
  flag. With the flag on, the SEO audit scores 100.

## What is not done, and what would come next

- **Field data.** No real visitor has seen the page. Lab numbers are in the performance
  review. Interaction latency on real phones is the first thing to watch.
- **A real experiment result.** The experiment is wired and its plan is pre-registered. The
  only analysis so far is a rehearsal on data labelled synthetic.
- **Real authentication,** email verification and delivery: out of scope by the brief. The
  session cookie is the seam where their auth would plug in.
- **A screen reader pass by a person.** Accessibility is checked by axe in CI on the page,
  the validation error, the profile step, the final state and the plain-form pages.
- **Per-arm edge caching of the landing document,** the first optimization at real traffic.
- **Consent.** There is no banner. Nothing third-party loads, and the one cookie that is
  not strictly necessary is a first-party visitor id for analytics and the experiment. An
  analytics cookie generally needs consent under the EU's ePrivacy rules, so a production
  page would ask there. With ad pixels,
  marketing destinations would wait for the answer.
- **Their languages.** One more prerendered document per locale and arm.

How this would sit inside FX Replay's own Astro site is the last section of
[docs/architecture.md](docs/architecture.md).
