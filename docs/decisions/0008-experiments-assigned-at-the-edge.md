# 0008. Experiments are assigned at the edge

- **Status:** accepted
- **Date:** 2026-11-18
- **Phase:** 0

## Context

The brief asks for at least one A/B experiment and says it cares more about reasoning and
measurement methodology than about the experiment's complexity. A proposal on paper would
satisfy it. An experiment whose assignment is flawed produces a confident wrong answer, and
the most common flaws come from assigning in the browser.

## Options considered

1. **Assign at the edge.** The variant is chosen before the HTML is sent, kept sticky per
   visitor with a cookie, rendered without flicker or layout shift, and recorded with an
   exposure event.
2. **Assign in the browser** with the analytics vendor's flag client. The simplest to wire,
   but the page flickers or shifts while the flag loads, the assignment depends on a
   third-party script, and visitors who block it silently drop out of the experiment.
3. **Write the proposal and implement nothing.** The least surface, and no evidence that the
   measurement plan can actually be carried out.

## Decision

Assignment happens at the edge, is sticky per visitor, and renders without flicker. An
exposure event is logged. The analysis plan is written and committed before any data exists.

## Consequences

- Variants cost nothing in layout shift or script weight.
- Assignment does not depend on a third-party script, and it is stored with the user at
  creation.
- The HTML now varies per visitor, so the caching strategy has to say how: this is a real
  trade-off against a fully static page and it is documented as one.
- **Cost to change later:** moderate. The assignment function is small, but it ties the
  experiment to the hosting platform's edge runtime (ADR 0003).
