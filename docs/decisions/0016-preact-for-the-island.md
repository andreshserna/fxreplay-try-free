# 0016. The island runs on Preact

- **Status:** accepted
- **Date:** 2026-11-18
- **Phase:** 3

## Context

ADR 0001 chose Astro with one hydrated island and left its library to measurement. The island
is the signup form: a reducer, four hooks and no library on top. FX Replay's site uses React
islands (`docs/research/brief.md`, section 5.1). Both were built from the same component and
measured on the variant that puts the form in the hero, with Lighthouse 13.6, mobile profile,
median of three runs against the local Workers runtime, on 2026-11-18.

| | JavaScript on the page, gzipped | LCP | TBT | Script start-up |
|---|---|---|---|---|
| React 19 | 84 KB (66 KB of it the runtime) | 0.80 s | 0 ms | 67 ms |
| Preact 11 | 25 KB | 0.76 to 0.80 s | 0 ms | 43 to 58 ms |

The same 16 end-to-end tests pass on both.

## Options considered

1. **React.** Their stack and the larger ecosystem. It meets every lab budget here. It costs
   59 KB of script that a phone on a slow network downloads before the form in the hero
   becomes interactive.
2. **Preact.** The same hooks and the same JSX, one seventh of the runtime. The lab numbers
   barely differ, because the script does not block rendering. The difference is download
   and start-up on real phones, where paid traffic lands, and it is paid by the one element
   the page exists for.
3. **No library:** a hand-written script. The smallest, and it would re-implement state,
   rendering and focus handling that the tests now get from a known library.

## Decision

Preact, without the compatibility layer: the form uses nothing beyond hooks.

## Consequences

- 70% less script for the same behavior, with room in the budget for the rest of the page.
- The component is not a drop-in for a React codebase: two import lines and the DOM
  attribute spelling differ. Moving it is an hour, not a rewrite.
- A React-only library would need `preact/compat`, which costs a few kilobytes back.
- **Cost to change later:** low. One integration line in `astro.config.mjs`, the imports of
  one file, and the end-to-end tests to prove nothing moved.
