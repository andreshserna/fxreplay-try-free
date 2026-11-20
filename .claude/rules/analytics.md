---
paths:
  - "src/lib/analytics/**"
  - "src/lib/experiments/**"
  - "src/middleware.*"
  - "scripts/experiment/**"
  - "docs/analytics-plan.md"
  - "docs/experiment-proposal.md"
  - "docs/experiments/**"
---

# Analytics and experiments

- **Events exist only in the typed registry.** Types, runtime validation and the table in
  `docs/analytics-plan.md` are generated from it. The table is never edited by hand. Add or
  change an event with `/track-event`.
- Call sites use the vendor-neutral `track()`. No vendor SDK is called outside an adapter.
- Every event carries an anonymous id, attribution when it is known (UTMs plus the affiliate
  parameters `via` and `aff`), experiment assignments, the release SHA and an event id for
  deduplication. Events sent by the browser also carry a session id and a device class.
  Events emitted by the server carry neither: they join the visitor's browser events by
  anonymous id.
- **No PII in any payload.** Never an email, a name, or text a visitor typed.
- Each event states the decision it informs. An event that informs none is removed.
- Analytics never blocks rendering or the signup. If a destination fails or is blocked, the
  signup still completes. The page works with no analytics key at all.
- `signup_completed` is emitted on the server after the commit. It is the source of truth and
  is reconciled against the users table.
- Experiments are assigned at the edge, sticky per visitor, and rendered without flicker or
  layout shift. The exposure event is recorded by the edge when it serves the variant's document, timed
  at serving.
- The analysis plan is written before any data exists: hypothesis, primary metric, guardrails,
  minimum detectable effect, sample size and duration from the script, and a decision table.
  Whole weeks only. No peeking unless the design is sequential. Scaffold with
  `/new-experiment`.
- Sample sizes and results come from `scripts/experiment/`, never from mental arithmetic.
  Synthetic data is labelled synthetic wherever it appears.
- After any tracking change, run the `analytics-qa` agent.
