# Architecture

One deployable on Cloudflare: an Astro site whose pages are static files, and a small Worker
that runs only where a request needs a decision. The page ships 25 KB of script, none of it
from a third party.

```
                           Cloudflare edge
 browser ───────────────►  ┌──────────────────────────────────────────────────────────┐
                           │ asset store, no code runs                                │
   hashed files, fonts     │   /_astro/*      immutable                               │
   static pages            │   /variants/*  /signup/*  /problems/*    revalidated     │
                           ├──────────────────────────────────────────────────────────┤
                           │ Worker (Astro's server entry)                            │
   the landing page        │   GET   /                pick the arm, stream its page ──┼──► asset store
   the signup              │   POST  /api/users       create, idempotent ─────────────┼──► D1 (SQLite)
   the profile step        │   PATCH /api/users/{id}  session cookie ─────────────────┼──► D1
   internal                │   GET   /api/users       admin token ────────────────────┼──► D1
   signup without script   │   POST  /signup          the same create, as a form      │
   analytics               │   POST  /api/events      validate, then forward ─────────┼──► PostHog
                           │   rate limits, security headers, visitor cookie          │
                           └──────────────────────────────────────────────────────────┘
```

## Structure

| Layer | Where | What it holds |
|---|---|---|
| Pages | `src/pages/`, `src/layouts/` | Prerendered HTML. One document per experiment arm |
| The island | `src/components/signup/` | The signup form: a pure state machine and a thin Preact component. The only code that hydrates |
| Shared contract | `src/lib/api/` | Schemas used by the form and the server, the problem registry, the typed client |
| Measurement | `src/lib/analytics/`, `src/lib/experiments/` | The event registry, the tracker, attribution, experiment assignment |
| Server | `src/server/` | Plain functions from `Request` to `Response`. One file, `runtime.ts`, knows Cloudflare |
| Data | `migrations/` | Two tables: `users`, and `idempotency_keys` |

The server code takes interfaces, not bindings, so the whole API contract runs in Node against
an in-memory repository, and again over HTTP against the real Worker and a real local D1.

## Major decisions and their trade-offs

| Decision | Why | What it costs | Record |
|---|---|---|---|
| Astro, static by default, one island | The page is content with one interactive piece. Speed is part of conversion | Anything interactive beyond the form needs a second island | [0001](decisions/0001-astro-react-islands-strict-typescript.md) |
| Preact for the island | 25 KB of script instead of 84, measured, same tests green | Not a drop-in for a React codebase: two imports differ | [0016](decisions/0016-preact-for-the-island.md) |
| One deployable | Page, API and edge logic ship and roll back together | The API scales with the site, not on its own | [0002](decisions/0002-one-deployable.md) |
| Cloudflare Workers with D1 | One platform for assets, edge logic, SQL with a real unique constraint, rate limiting | A runtime that is not Node, and 10 ms of CPU per request on the free plan | [0011](decisions/0011-cloudflare-workers-with-d1.md) |
| Email-first signup, no password | The lowest-friction path to an account. Their flow asks for three fields on two screens before one exists | A simulated account: no verification, no login | [0005](decisions/0005-email-first-signup-without-password.md) |
| Experiments assigned at the edge | No flicker, no layout shift, no dependency on a script | The landing document cannot sit in a shared cache | [0008](decisions/0008-experiments-assigned-at-the-edge.md) |
| A first-party event collector | No vendor script, and the event registry is enforced on entry | A Worker request per batch of events | [0014](decisions/0014-first-party-event-collector.md) |

Trade-offs worth knowing before a review:

- **`/` is `private, no-cache`.** Each arm is a prerendered file, so the Worker does no
  rendering, but the response is decided per visitor and revalidated. In production the fix
  is a cache key that includes the arm, so each arm is cached at the edge.
- **`email_taken` tells a visitor an address is registered.** A useful answer, bounded by
  rate limiting. With email delivery the answer becomes neutral and the detail goes by email.
- **Rate limits are keyed by client address** and are approximate per location. Visitors
  behind one carrier address share a limit. Production adds the visitor cookie to the key
  and a challenge only when abuse is detected.
- **The page's policy is a `<meta>`,** so it governs only what follows it in the document.
  The directives that do not depend on the page are also sent as a header.

## API and integration

The contract is [docs/api.md](api.md), written before the code. The form reaches it through
one typed client: a timeout, one retry with the same idempotency key, never a retry of a 4xx,
and one mapping from every answer to a state of the form. Errors are RFC 9457 problems with a
stable `code`, and nothing matches on message text. The same create runs behind `POST /signup`
for a browser that has not run the script, so the signup works before hydration and without it.

## Deployment and infrastructure

| Concern | In this demo | In production |
|---|---|---|
| Hosting | Cloudflare Workers with static assets, free plan | The same model on a paid plan: higher CPU and request limits |
| Deployment | `wrangler deploy`. D1 migrations are files applied by a command | Deploys from CI on merge, with a preview URL per pull request |
| CI/CD | GitHub Actions on every push: format, lint, types, token and contrast rules, generated files, more than 300 unit and system tests, the build, the API contract over HTTP, 38 browser tests with axe, the Lighthouse budgets | The same checks gate the deploy. A failed budget fails the build |
| DNS | A `workers.dev` hostname | A route on their own zone (below) |
| CDN and edge | Assets are served from the edge without running code. The Worker runs for `/` and the API | Cache the landing document per experiment arm |
| Caching | Hashed files are immutable for a year. HTML revalidates. API answers are `no-store` | The same, plus the per-arm cache key |
| Observability | Structured error logs with a request id and no personal data. Field Web Vitals as an event. Every event carries the release SHA | Alerts on the signup failure rate, on 5xx, and on the gap between conversions and user rows. Error tracking |
| Security | A strict CSP with no inline allowance, security headers on every response, signed `__Host-` session cookie, `HttpOnly` visitor cookie, origin checks, rate limits, a honeypot, secrets declared and never stored | A WAF rule in front, bot management, secret rotation |
| Reliability | Create is idempotent, the client retries safely, the form keeps its input on failure, analytics can fail without touching the signup, the page works without script | D1 read replication, a status page, a runbook for the reconciliation alert |

## If this became a production FX Replay system

Their marketing site is already Astro with React islands (`docs/research/brief.md`, section
5.1), so this would not be a second deployment next to it. It would be a route in that site.

1. **A path on `fxreplay.com`, not a subdomain.** The page inherits the domain's authority in
   search, first-party cookies need no cross-domain linking, and their existing visitor
   identity (`fxr_session_info`) replaces this demo's cookie.
2. **The signup hands off to their real authentication.** `POST /api/users` becomes a call to
   their signup service. Email-first stays: the account is created on the email, and the
   password and the plan choice move after it.
3. **Events go to the pipeline they already run** (`/tapi/event`), through the same registry
   and collector pattern. Only the forwarder changes.
4. **Consent.** Their consent tool decides what may be recorded. The server-side conversion
   stays, as it is needed to operate the service. Marketing destinations wait for consent.
5. **Their languages.** Each of their eight locales is one more prerendered document per arm.
6. **The island moves to React** if one runtime across their site is worth more than 59 KB on
   this page. It is a measured trade, and theirs to make.
7. **Email verification and abuse controls** that a demo leaves out: verification, a
   challenge on suspicious signups, deliverability checks.

## Not done

The site is not deployed yet: everything above was run on the local Workers runtime
(`workerd`) with a local D1. Behavior on Cloudflare's network (the client address header,
header rules from the asset store, D1 provisioning) is the first thing to verify after the
first deploy.
