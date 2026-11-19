# 0017. The island runs on React

- **Status:** accepted
- **Date:** 2026-11-18
- **Phase:** 3

## Context

ADR 0016 measured the signup island on React and on Preact and chose Preact for its size. The
measurement stands, and it cuts both ways:

| | JavaScript on the page, gzipped | LCP | TBT | Lighthouse performance |
|---|---|---|---|---|
| React 19 | 82 KB | 0.80 s | 0 ms | 100 |
| Preact 11 | 25 KB | 0.76 to 0.80 s | 0 ms | 100 |

Lighthouse 13.6, mobile profile, median of three runs, local Workers runtime, 2026-11-18.

No budget of the project separates the two. The script does not block rendering, so the
57 KB shows up nowhere in the lab scores: it is download and start-up on a slow phone. Against
that, FX Replay's job post names React and their marketing site is built with React islands
(`docs/research/brief.md`, sections 5.1 and 8).

## Options considered

1. **Stay on Preact.** The smaller page. A component that their team would have to adapt
   before it could live in their codebase, and a second UI runtime to know.
2. **React.** The stack the team already runs. Every budget is met with room to spare, and
   the island drops into their site as it is.

## Decision

React. When the measured difference changes no budget, fit with the team's stack is worth
more than the kilobytes.

## Consequences

- The page carries about 57 KB more script than it has to. It stays inside every budget,
  and the budgets are enforced in CI, so the cost is visible if it grows.
- The component is portable to their site without changes.
- The Preact measurement is kept as evidence that the cost was known when it was accepted.
  If field data showed slow interaction on low-end phones, the switch is one integration
  line and the imports of one file, with the same end-to-end tests to prove it.
- **Cost to change later:** low.
