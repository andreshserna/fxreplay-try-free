# 0015. The first experiment: an email field in the hero against a button that leads to the form

- **Status:** accepted
- **Date:** 2026-11-18
- **Phase:** 1

## Context

One experiment is specified in full and wired end to end (ADR 0008). It should test the
largest uncertain bet on the page, and its result should say something about FX Replay's live
funnel. Today their hero has a button that leads to a separate signup screen, and the email
typed there does not yet create the account (`docs/research/brief.md`, section 4). This page
bets the opposite: ask for the email in the hero and create the account on it (ADR 0005).

## Options considered

1. **Hero signup (`hero_signup`).** Control: a button in the hero that leads to the form
   lower on the page, the pattern they run today. Variant: the email field in the hero. It
   tests the page's central bet, the two arms differ in layout (which is what edge
   assignment exists for), and both are cheap to build from the same form.
2. **The risk-reversal line under the call to action.** Their homepage hero has none and
   their campaign pages do. Cheap, but a smaller expected effect needs far more traffic.
3. **The profile step before or after account creation.** It trades signups for signup
   quality, a question worth asking once the baseline funnel is known.

## Decision

Option 1 goes first. Options 2 and 3 open the ranked backlog in
`docs/experiment-proposal.md`, with the headline (a doubt against a benefit) after them.

## Consequences

- The primary metric is the project's own (ADR 0013), with profile completion as the
  guardrail, so an arm cannot win by collecting empty accounts.
- The page ships both arms. The control is not a throwaway: it is the fallback layout if the
  variant loses.
- A field in the hero may collect more low-intent emails. The guardrail and, in production,
  "first replay session started" are what catch that.
- **Cost to change later:** low. Experiments are entries in a registry, and the next one
  reuses the assignment, the exposure event and the analysis script.
