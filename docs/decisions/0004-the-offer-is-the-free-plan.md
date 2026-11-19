# 0004. The offer is the free plan

- **Status:** accepted
- **Date:** 2026-11-18
- **Phase:** 0

## Context

The scenario is "Try FX Replay Free" and the metric is account creation. According to a
first read of fxreplay.com (assumptions 3 to 6 in `docs/research/assumptions.md`, to be
verified), the site presents two different "free" things: a free Beginner plan with no card
and no time limit but tight limits, and a 5-day free trial of the paid plans. Its own pages
use both messages and disagree on whether the trial needs a card. A visitor who cannot tell
what "free" means hesitates.

## Options considered

1. **The free plan.** No card, no time limit, limits stated plainly. The lowest-friction path
   to an account.
2. **The 5-day trial of a paid plan.** Shows the full product and may convert to revenue
   sooner, but it is time-boxed and the card question is unresolved on their own site.
3. **Offer both and let the visitor choose.** Repeats the ambiguity and splits the primary
   call to action.

## Decision

The page offers the free plan and says honestly what it includes and what it does not.

## Consequences

- One promise, one call to action, one risk reversal: free, no card.
- Free signups may be lower intent. The experiment's guardrails watch signup quality (profile
  completion and, in production, first replay session started) so a variant cannot win by
  inflating empty accounts.
- Every limit quoted on the page needs a source on fxreplay.com.
- **Cost to change later:** low. It is copy and one section. A paid-trial path is a likely
  live requirement and would be added next to this one, not in place of it.
