# 0014. Events reach PostHog through a first-party collector, with no vendor script on the page

- **Status:** accepted
- **Date:** 2026-11-18
- **Phase:** 1

## Context

ADR 0007 names PostHog as the destination and asks that analytics never block rendering or
the signup. The usual way to reach PostHog is its browser SDK: a third-party script on a page
whose budget is 150 ms of blocking time, sending to a vendor host that ad blockers list. FX
Replay itself sends its events to a first-party endpoint (`POST app.fxreplay.com/tapi/event`,
`docs/research/brief.md`, section 5.2). PostHog accepts events from a server through its
capture API (posthog.com/docs/api/capture, read 2026-11-18).

## Options considered

1. **PostHog's browser SDK.** Autocapture, session replay and client-side flags for free. A
   vendor script inside the performance budget, a vendor host in the CSP, and silent loss of
   visitors who block it.
2. **The SDK behind a reverse proxy on our domain.** Fixes the blocking, keeps the weight.
3. **A first-party collector.** The page's small tracker posts batches to `/api/events` on
   the same origin. The Worker checks each event against the registry, adds what only the
   server knows, and forwards to PostHog's batch endpoint without making the visitor wait.

## Decision

Option 3. A `dataLayer` adapter stays in the browser for ad platforms.

## Consequences

- No third-party script and no vendor host: the CSP is `connect-src 'self'`.
- The registry is enforced at the door. An unknown event or property is dropped before it
  leaves, so personal data cannot reach the vendor by accident.
- Browser and server events share one path, one schema and one set of context fields.
- With no PostHog key the collector still validates and then discards, so the page and its
  tests run without an account.
- Given up: autocapture, session replay and client-side flags. None is used here: assignment
  happens at the edge (ADR 0008).
- Each batch is a Worker request, counted against the plan's daily limit. The tracker batches
  and flushes when the page is hidden.
- The collector is a public endpoint: it is rate limited and accepts only registered events.
- **Cost to change later:** low. The forwarder is one adapter. In production at FX Replay it
  would point at their existing event pipeline instead.
