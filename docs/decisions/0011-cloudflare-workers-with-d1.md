# 0011. Hosting and persistence: Cloudflare Workers with D1

- **Status:** accepted
- **Date:** 2026-11-18
- **Phase:** 1

## Context

One deployable (ADR 0002) has to serve a static landing page, three API endpoints, and
request-time logic at the edge: experiment assignment (ADR 0008) and rate limiting. Email must
be unique in the database itself (ADR 0003). A reviewer has to run everything locally without
an account, and the brief asks how hosting, deployment, DNS, CDN, caching and security would
be operated. Platform facts below are from the Astro and Cloudflare docs, read 2026-11-18.

## Options considered

1. **Cloudflare Workers with D1.** One platform for static assets, the Worker, a SQL
   database, rate limiting, CDN, DNS and WAF. Astro's adapter runs `dev` and `preview` on
   `workerd`, the production runtime, and D1 runs locally with no account. The price is a
   runtime that is not Node, and 10 ms of CPU per request on the free plan.
2. **Vercel with a managed Postgres.** The most familiar Astro path, a Node runtime and good
   previews. It needs a second vendor and a connection string even for local runs, a third
   service for rate limiting, and edge middleware runs in a different runtime from the API.
3. **A Node server with a SQLite file** on a small host. The simplest model: one process,
   `node:sqlite`, local equals production. It has no edge, so assignment and rate limiting
   happen at the origin, and CDN and WAF become a separate product in front.

## Decision

Cloudflare Workers with D1, on the free plan. Static assets are served by the asset layer and
the Worker runs only for the API and for request-time decisions.

## Consequences

- Development, preview and production share one runtime, so "works locally" means more.
- Edge assignment, rate limiting, caching and security headers live in the same deployable.
- Requests for static assets are free and unlimited. Worker requests are capped at 100,000 a
  day and D1 at 100,000 rows written a day: far above a demo, and stated in the docs as the
  first limits to watch.
- The Worker has to stay thin: 10 ms of CPU per request. Libraries must run on `workerd`.
- The rate limiting binding is approximate and per location. It stops abuse. It is not a quota.
- **Cost to change later:** moderate. D1 sits behind the repository interface, one file.
  Leaving Workers would mean reworking edge assignment, rate limiting and the deploy pipeline.

Sources: docs.astro.build/en/guides/integrations-guide/cloudflare,
developers.cloudflare.com/workers/platform/pricing, /d1/platform/pricing,
/d1/best-practices/local-development, /workers/runtime-apis/bindings/rate-limit.
