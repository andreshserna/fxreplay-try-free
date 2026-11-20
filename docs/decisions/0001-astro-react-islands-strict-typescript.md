# 0001. Astro with React islands and strict TypeScript

- **Status:** accepted
- **Date:** 2026-11-18
- **Phase:** 0

## Context

The page is a marketing landing whose job is conversion, so its speed is part of the product:
the lab budget is LCP ≤ 2.0 s and TBT ≤ 150 ms on a mobile profile. It has one interactive
piece, the signup form. The job post for this role asks for "marketing and growth web
experiences using Astro, React, TypeScript, HTML, and CSS", and FX Replay's own marketing
site has run on Astro 6 with React islands since 2026-10-04 (`docs/research/brief.md`,
sections 5.1 and 8).

## Options considered

1. **Astro, static by default, with one hydrated island.** Ships HTML and CSS and no
   JavaScript except where an island asks for it. It is the stack the role names.
2. **Next.js.** One framework for pages and API with a large ecosystem, but it ships a client
   runtime to every page and brings more machinery than a single form justifies.
3. **Plain HTML, CSS and a small script.** The least to ship and nothing to explain, but no
   typed components, no shared schemas between form and API, and it does not show the stack.

## Decision

Astro (current stable) with strict TypeScript. The landing is static HTML. Only the signup
form hydrates. Whether the island runs on React or Preact is left open and gets its own
decision card (it did: [ADR 0016](0016-preact-for-the-island.md), then
[ADR 0017](0017-react-for-the-island.md), which stands).

## Consequences

- The performance budgets are reachable by default instead of by optimization.
- Every piece of client JavaScript has to be asked for, which keeps hydration a decision.
- The current Astro major is newer than the model's training data, so the API is checked
  against the `astro-docs` MCP server instead of memory.
- **Cost to change later:** high. Templates, routing and endpoints would be rewritten. This
  position needs a strong reason to move.
