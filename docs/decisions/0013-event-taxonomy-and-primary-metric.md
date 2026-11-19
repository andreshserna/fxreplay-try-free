# 0013. Event taxonomy and the primary metric

- **Status:** accepted
- **Date:** 2026-11-18
- **Phase:** 1

## Context

The goal is a higher conversion rate from marketing traffic to account creation, so the
metric and the events behind it have to be fixed before anything is instrumented: event names
are expensive to change once dashboards and experiments depend on them (ADR 0007). FX Replay
already publishes a marketing event spec with `cta_name` and `cta_location`, and its own
"signup completed" fires after the plan is chosen, later than the account is created
(`docs/research/brief.md`, sections 4 and 5.2).

## Options considered

1. **A short funnel of named events, each tied to a decision,** with the conversion and the
   exposure emitted on the server. It has to be designed, and it stays readable.
2. **Autocapture.** Nothing to design. Names become selectors, the funnel breaks on a
   redesign, and no event says which decision it serves.
3. **Mirror their event names** (`wf_cta_clicked`, `engagement.signup_step_*`). No mapping if
   the data were merged, but their steps (username and password, plan choice) do not exist
   in this flow, and their "completed" means something later than ours.

## Decision

Option 1. Nine events, `object_action` in the past tense:

| Event | Fires | The decision it informs |
|---|---|---|
| `landing_viewed` | browser, once per page load | The denominator: is traffic from a source worth buying |
| `cta_clicked` | browser | Which calls to action earn their place on the page |
| `signup_started` | browser, first input in the email field | Is the loss before the form (interest) or in it (friction) |
| `signup_submitted` | browser, a request is sent | How many attempts never become accounts |
| `signup_failed` | browser, with the reason code | Which failure to fix first |
| `signup_completed` | server, after the user row is committed | **The primary conversion** |
| `profile_completed` | server, after the profile is saved | Signup quality: the guardrail of every experiment |
| `experiment_exposed` | server, when a variant is served | The denominator of each arm, and the sample-ratio check |
| `web_vitals` | browser | Whether real visitors get the page the budgets promise |

**Primary metric: signup conversion rate.** Visitors with a `signup_completed` within 7 days
of their first `landing_viewed`, divided by visitors with a `landing_viewed`. The unit is the
visitor (anonymous id), split by first-touch source, device class and variant. In an
experiment the denominator is `experiment_exposed`. CTA properties use the names of their
published spec (`cta_name`, `cta_location`).

## Consequences

- Each event answers a question someone will ask. An event that stops doing so is removed.
- The numerator is counted on the server and can be reconciled against the users table.
- Our `signup_completed` means "account created". In their pipeline that is their second
  step, not their `completed`: a merge needs that mapping written down.
- A visitor who clears cookies counts twice in the denominator. Accepted and documented.
- **Cost to change later:** high for names and for the metric's definition once data exists.
  Low for properties, which are additive.
