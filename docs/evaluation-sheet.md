# Evaluation sheet

Every line of the challenge brief, in the brief's order and words: what was built, what it
was built with, and where to check it. A link or a command stands behind each line. What is
not done is listed at the end, not left out.

Live: https://fxreplay-try-free.mauricioserna123.workers.dev

## See the results without installing anything

| To see | Go to |
|---|---|
| The page, in the arm the edge assigns you | [the live site](https://fxreplay-try-free.mauricioserna123.workers.dev) |
| Each experiment arm by itself | [`/variants/cta_button/`](https://fxreplay-try-free.mauricioserna123.workers.dev/variants/cta_button/) (control), [`/variants/inline_email/`](https://fxreplay-try-free.mauricioserna123.workers.dev/variants/inline_email/) (variant) |
| Every check, on every push | [GitHub Actions](https://github.com/andreshserna/fxreplay-try-free/actions): lint, types, brand tokens, contrast, 354 unit and system tests, the API over HTTP, 54 browser tests with axe, the Lighthouse budgets. Each run's page shows the Lighthouse table, and the full reports download from it |
| Lighthouse on the live page, run from Google's servers | [PageSpeed Insights](https://pagespeed.web.dev/analysis?url=https%3A%2F%2Ffxreplay-try-free.mauricioserna123.workers.dev%2F). SEO reads low there on purpose: the demo ships `noindex` ([ADR 0009](decisions/0009-demo-carrying-a-third-party-brand.md)) |
| The analytics in PostHog, built from the page's own events | [A public dashboard](https://us.posthog.com/shared/-YCoEmJJKBpu1B7V5XPA-1M_Zt0K9g), no login needed: the funnel, the experiment by arm, exposed visitors per arm, field Web Vitals, failures by reason, the bot flag. All of it is test traffic: [how it was produced](analytics-plan.md#seen-working-end-to-end) |
| The events as they leave the page | Open the live site with the network panel filtered to `events`: batches to `/api/events`, same origin, no third-party request |
| The API answering | The three commands below |

```sh
SITE=https://fxreplay-try-free.mauricioserna123.workers.dev

# Create: 201 with the user. Sent again with the same key: the same answer, one account.
# (409 `email_taken` once that address exists under another key: change the address.)
curl -i -X POST $SITE/api/users -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: review-0000000000000001' -d '{"email":"reviewer@example.com"}'

# Validation: 422, an RFC 9457 problem with the field and a stable code.
curl -s -X POST $SITE/api/users -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: review-0000000000000002' -d '{"email":"not-an-email"}'

# List: 401 without the admin token. It is not open.
curl -i $SITE/api/users
```

## What to build

### 1. Landing experience

| The brief asks for | What was built | Built with | Check it |
|---|---|---|---|
| A clear value proposition | "Test your strategy before you trust it.", one sentence of what the product does, and the offer stated as three facts: free plan, no credit card, no time limit. Every claim traces to FX Replay's own pages | Astro, static HTML. Claims from [the research brief](research/brief.md) | The first screen of the live site. `src/components/landing/Hero.astro` |
| A primary CTA | One action, "Start for free": in the hero, in a header that stays in view, and after the free plan's limits. All lead to the same form. In the variant arm the hero holds the email field itself | Astro. Clicks are measured per location (`cta_clicked`) | Click any of them. `tests/e2e/signup.spec.ts` |
| A polished, production-quality interface | The brand kit's tokens enforced by a script, a fluid type scale with a 16 px floor, one spacing scale, original illustrations in one drawing language, a hero chart that plays when it is tapped | CSS custom properties generated from the kit. Inline SVG. Reviewed by the `design-critic` agent from its own screenshots | `npm run check:tokens`, [brand-notes.md](brand-notes.md), [what the category's pages do](research/visual-patterns.md) |
| Responsive behavior across common screen sizes | Phone first. On a phone the first screen holds the headline, the action, the offer and the chart | CSS grid and fluid sizes. Browser tests on a desktop and a Pixel 7 profile | Resize the live site. `playwright.config.ts` |
| Appropriate accessibility considerations | WCAG 2.2 AA as the target: contrast computed for every color pair, labelled fields, errors never by color alone, focus management, keyboard path, reduced motion, 52 px targets | axe inside the browser tests, a contrast script, Lighthouse | [performance-review.md, Accessibility](performance-review.md#accessibility). `npm run check:contrast` |

### 2. Signup flow

| The brief asks for | What was built | Built with | Check it |
|---|---|---|---|
| Appropriate user states | Resting, a field error, submitting, account created, the optional profile step, done, email already registered, rate limited, offline, timeout, server error | A pure state machine with no framework in it, and a thin React component over it | `src/components/signup/machine.ts`, `tests/unit/signup-machine.test.ts` |
| Validation | On blur and on submit, never on each keystroke. The same schema validates in the browser and on the server | Zod schemas shared by both sides | Type `abc` and leave the field. `src/lib/api/schemas.ts` |
| Error handling | Each failure has its own message and its own way forward. What was typed is never lost. Focus moves to the field | The typed API client maps every answer to one state of the form | Sign up twice with one address. `src/lib/api/client.ts`, `tests/unit/api-client.test.ts` |
| Loading / async behavior | The button never disables: it shows progress, announces it to a screen reader and ignores a second press. A timeout, then one retry with the same idempotency key | `fetch` with a timeout, `Idempotency-Key` | Throttle the network and submit |
| A successful conversion state | The account exists on the email alone. Then an optional step asks how the visitor trades, with "Skip" | The same API: create, then update | Sign up on the live site |
| Beyond the list | The signup also works with JavaScript off, and before the script has loaded | A plain HTML form posting to `/signup` | Disable JavaScript and sign up |

### 3. API integration

| The brief asks for | What was built | Built with | Check it |
|---|---|---|---|
| Creating a user | `POST /api/users`, idempotent, rate limited, with a honeypot | Astro endpoints on a Cloudflare Worker | [api.md, Create](api.md#create-a-user), the first command above |
| Updating a user | `PATCH /api/users/{id}`, authorized by a signed session cookie set at signup | HMAC-signed `__Host-` cookie | [api.md, Update](api.md#update-a-user) |
| Listing users | `GET /api/users`, paginated, behind an admin token | Bearer token from a secret | [api.md, List](api.md#list-users) |
| The signup calls the API | The form's only path to an account is this API. The optional step is the update | Typed client, shared schemas | The network panel during a signup |
| Persistence choice, rationale and trade-offs | A real database (Cloudflare D1, SQLite) behind a repository interface, so the same contract runs in memory in tests | D1, SQL migrations | [ADR 0003](decisions/0003-persistence-behind-a-repository.md), [ADR 0011](decisions/0011-cloudflare-workers-with-d1.md) |
| The API contract | Written before the code. RFC 9457 errors with stable codes, an example for every status | Markdown contract, held by tests | [api.md](api.md), [ADR 0006](decisions/0006-contract-first-users-api.md) |
| Validation, failures and asynchronous behavior | Tested in Node against an in-memory repository, and again over HTTP against the real Worker and a real D1 | Vitest, Node's test runner | `npm test`, `npm run test:api` |

## Analytics and measurement

| The brief asks for | What was built | Built with | Check it |
|---|---|---|---|
| Event taxonomy: name, trigger, properties, user and session context | Ten events in one typed registry. Each names its trigger, its properties and the decision it informs. The tables in the document are generated from the code | TypeScript. `track()` does not compile for an event that is not in the registry | [analytics-plan.md, Events](analytics-plan.md#events), `src/lib/analytics/registry.ts` |
| Funnel entry and intermediate steps | `landing_viewed`, `cta_clicked`, `signup_started`, `signup_submitted` | A 2.4 KB first-party tracker, no vendor script | [analytics-plan.md, Funnel](analytics-plan.md#funnel) |
| Primary conversion event | `signup_completed`, recorded by the server after the row is committed, so an ad blocker cannot lose it | Server event from the Worker | `src/server/analytics/` |
| Primary conversion metric | Signup conversion rate: visitors with an account within 7 days of their first view, over visitors with a view | Defined in the plan, computed in PostHog | [analytics-plan.md, Primary conversion metric](analytics-plan.md#primary-conversion-metric) |
| An analytics architecture | Browser to a collector on the same origin, which validates every event against the registry and forwards it to PostHog. A `dataLayer` push per event for ad platforms | Cloudflare Worker, PostHog capture API | [ADR 0014](decisions/0014-first-party-event-collector.md), [the diagram](analytics-plan.md#architecture-and-tooling) |
| Accurate and trustworthy data | Fifteen named risks, each with what prevents or detects it: no personal data in payloads, no double counting, no forged conversions, bots flagged, reconciliation against the database | Compile-time types, runtime validation, tests that drive the real page | [analytics-plan.md, Data quality](analytics-plan.md#data-quality), `tests/e2e/signup.spec.ts` |
| Seen working | Nine scripted visits on the deployed site, read back as a funnel in PostHog | PostHog | [The public dashboard](https://us.posthog.com/shared/-YCoEmJJKBpu1B7V5XPA-1M_Zt0K9g), [the account of it](analytics-plan.md#seen-working-end-to-end) |

## Experiment proposal

| The brief asks for | What was built | Built with | Check it |
|---|---|---|---|
| Hypothesis | Asking for the email in the hero, and creating the account on it, raises the share of visitors who create an account | Grounded in how their signup works today ([research](research/brief.md)) | [experiment-proposal.md](experiment-proposal.md) |
| Control | The hero ends in a button that leads to the form | A prerendered document per arm | [`/variants/cta_button/`](https://fxreplay-try-free.mauricioserna123.workers.dev/variants/cta_button/) |
| Variant | The hero ends in the email field. Nothing else differs | The same | [`/variants/inline_email/`](https://fxreplay-try-free.mauricioserna123.workers.dev/variants/inline_email/) |
| Success metric | Signup conversion rate over exposed visitors, both sides recorded on the server. Three guardrails | Sample size from a script: 6,690 visitors per arm | [The pre-registered plan](experiments/hero_signup.md), `scripts/experiment/sample-size.mjs` |
| Decision: ship, continue or reject | A decision table written before any data, read from the top | An analysis script and the `experiment-analyst` agent | [Decision criteria](experiment-proposal.md#decision-criteria) |
| Beyond the list | The experiment is not only proposed: it is wired. The edge assigns the arm before any HTML is sent, and the whole analysis was rehearsed on data labelled synthetic | Cloudflare Worker, Node statistics tested against values worked by hand | Reload the live site: same arm. [The rehearsal](experiments/hero_signup.synthetic-analysis.md) |

## Performance and production readiness

### Web performance

| The brief asks for | What was built | Built with | Check it |
|---|---|---|---|
| Core Web Vitals | On the deployment: LCP 1.17 s, CLS 0.001, TBT 0 ms, performance 100. Budgets fail the build, and where a number depends on the machine that measured it the review says so. Field data is reported by the page as an event | Lighthouse 13 in CI, the `web-vitals` library | [performance-review.md](performance-review.md#core-web-vitals), `npm run lighthouse`, the PageSpeed link above |
| Loading strategy | CSS inside the HTML, one preloaded font, the largest element is text, all script deferred | Astro's build | [The decisions behind the numbers](performance-review.md#the-decisions-behind-the-numbers) |
| Rendering strategy | Static first: one prerendered document per arm. Code runs only to pick the arm, for the API and for the collector | Astro prerendering, a Worker | [Rendering strategy](performance-review.md#rendering-strategy) |
| Asset optimization | Illustrations are inline SVG, fonts are self-hosted subsets, the page is 14 requests and 184 KiB | Astro fonts and assets | The network panel on the live site |
| JavaScript execution | One island hydrates: the signup form. React and Preact were both built and measured before choosing | React 19 | [ADR 0017](decisions/0017-react-for-the-island.md) |
| Third-party scripts | None | First-party collector | The network panel: one origin |

### SEO

| The brief asks for | What was built | Check it |
|---|---|---|
| Metadata | Title, description, canonical, Open Graph and Twitter tags, a generated share image | View source. [performance-review.md, SEO](performance-review.md#seo) |
| Semantic structure | One `h1`, a heading per section, landmarks, the steps as a list, the FAQ as native `details` | The accessibility tree in DevTools |
| Technical SEO | Both arms declare one canonical URL, internal pages are never indexable, indexing sits behind a flag | `src/layouts/Base.astro` |
| Structured data | One entity that is a `WebPage` and a `FAQPage`, built from the same list the FAQ renders | View source, `application/ld+json` |

### Accessibility

Explained in [performance-review.md, Accessibility](performance-review.md#accessibility):
what a machine checks on every push, what was designed in, and what is not done (a screen
reader pass by a person).

### Infrastructure

Each of the nine has a row in
[architecture.md, Deployment and infrastructure](architecture.md#deployment-and-infrastructure),
with what the demo does and what production would add.

| The brief asks for | In this demo |
|---|---|
| Hosting | Cloudflare Workers with static assets and D1 ([ADR 0011](decisions/0011-cloudflare-workers-with-d1.md)) |
| Deployment | `wrangler deploy`, migrations as files |
| CI/CD | GitHub Actions on every push: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |
| DNS | A `workers.dev` hostname. In production, a path on their own domain |
| CDN / edge | Assets from the edge with no code. The experiment arm is decided at the edge |
| Caching | Hashed files immutable for a year, HTML revalidated, the API `no-store` |
| Observability | Structured logs with a request id, field Web Vitals as an event, the release SHA on every event |
| Security | A strict CSP, security headers, signed cookies, origin checks, rate limits, a honeypot. `tests/e2e/security.spec.ts` |
| Reliability | Idempotent create, safe retries, analytics that can fail without touching the signup, a page that works without script |

## AI-native development

The system is in the repository, not only described: [`CLAUDE.md`](../CLAUDE.md),
[`.claude/`](../.claude/), [`.mcp.json`](../.mcp.json). The account of it is
[ai-workflow.md](ai-workflow.md).

| The brief asks for | What was built | Check it |
|---|---|---|
| Project-level instructions | `CLAUDE.md`: what the project is, how it is judged, the commands, ten invariants, how decisions are made. Six rule files that load only with the files they govern | [`CLAUDE.md`](../CLAUDE.md), [`.claude/rules/`](../.claude/rules/) |
| A reusable skill or workflow | Four skills: `/adr`, `/track-event`, `/new-experiment`, `/ship-check` | [`.claude/skills/`](../.claude/skills/) |
| Agents with clearly defined responsibilities | Seven, each with one job, its own tools and its own model. Reviewers have no write access, so the author of a change never grades it | [`.claude/agents/`](../.claude/agents/), [the table](ai-workflow.md#agents) |
| MCP where it provides value | Two in use: `chrome-devtools`, so an agent sees the real page, and `astro-docs`, for a framework newer than the model. Six proposed for production, with who uses each and why | [`.mcp.json`](../.mcp.json), [ai-workflow.md, MCP](ai-workflow.md#mcp) |
| Beyond the list: hooks | Before an edit, secrets, the brief and generated files are refused. After an edit, the file is formatted and checked against the brand rules. The hooks have their own tests | [`.claude/settings.json`](../.claude/settings.json), [`.claude/hooks/`](../.claude/hooks/) |

The brief's example areas, and the agent that covers each:

| Area | Agent | What it produced here |
|---|---|---|
| Research | `growth-researcher` | [research/brief.md](research/brief.md), [research/visual-patterns.md](research/visual-patterns.md) |
| Implementation | `implementer` | Code and tests from a written specification: the API client, the statistics, the attribution capture, the tracker |
| Analytics | `analytics-qa` | The events in a real browser against the registry |
| Testing and code review | `code-reviewer` | Findings on a diff it did not write, including tests that proved nothing |
| Accessibility and performance | `web-quality-auditor` | Lighthouse, axe, the keyboard path and the headers, on the deployment |
| Experiment analysis | `experiment-analyst` | [The rehearsal on synthetic data](experiments/hero_signup.synthetic-analysis.md) |
| Design | `design-critic` | The five changes with the most impact, from its own screenshots |

### Human judgment

| The brief asks | Where it is answered |
|---|---|
| What was delegated to AI | [ai-workflow.md, Agents](ai-workflow.md#agents) and [How the pieces work together](ai-workflow.md#how-the-pieces-work-together) |
| What was kept for a person | [`CLAUDE.md`, How decisions are made](../CLAUDE.md#how-decisions-are-made): the visual design, the headline and the wording of the offer are chosen by a person from rendered options. The release gate can only be invoked by a person |
| What AI output was rejected or corrected | Eleven cases with what was wrong and how it was found: [ai-workflow.md](ai-workflow.md#where-ai-output-was-corrected-or-rejected) |
| How AI-generated work was validated | Independent reviewer agents, tests written before the commit, measurements on the deployment, and [a log line or an ADR for every decision](decisions/log.md) |

## Deliverables

| # | Deliverable | Where |
|---|---|---|
| 1 | Working implementation: repository, live URL, local setup | [README.md](../README.md): two commands, no account, no configuration |
| 2 | Architecture overview | [architecture.md](architecture.md), with a diagram and what would change in production |
| 3 | Analytics plan | [analytics-plan.md](analytics-plan.md) |
| 4 | Experiment proposal | [experiment-proposal.md](experiment-proposal.md) |
| 5 | AI-native workflow | [ai-workflow.md](ai-workflow.md), and the system's own files |
| 6 | Performance review | [performance-review.md](performance-review.md) |

## What the brief says it looks for

| Quality | Where it shows most |
|---|---|
| Engineering and architecture decisions | [17 ADRs](decisions/), each with its real alternatives, and [a log](decisions/log.md) with one line per smaller decision |
| Analytics and experimentation approach | The conversion and the exposure are server events. The experiment plan was committed before any data |
| AI-native development workflow | Reviewers that cannot write, hooks that enforce rules, and a record of what the AI got wrong |
| Web performance and production thinking | Budgets that fail the build, numbers measured on the deployment, risks stated |
| Design and user experience | The live page, on a phone first |
| FX Replay's brand within the provided typography and color palette | [brand-notes.md](brand-notes.md): the kit's tokens rebuilt and enforced, its two open questions answered, each extension with its reason |
| Ownership, prioritization and technical judgment | What was left out and why: [README.md, What is not done](../README.md#what-is-not-done-and-what-would-come-next) |

## Not done

Stated where each belongs, and gathered in
[README.md](../README.md#what-is-not-done-and-what-would-come-next): no field data, no real
experiment result, no real authentication or email delivery, no screen reader pass by a
person, no consent banner.
