# Experiment proposal

One experiment is specified in full and wired end to end. Three more are ranked behind it.
The method matters more than the idea: the plan is committed before any data exists, both
sides of the metric are recorded on the server, and the decision table is written first.

## The experiment: where the signup starts

The full pre-registered plan is [experiments/hero_signup.md](experiments/hero_signup.md). In
short:

| | |
|---|---|
| **Hypothesis** | FX Replay's hero today is a button that leads to a separate signup screen, and the email typed there does not yet create the account. Each step before an account loses visitors. Asking for the email in the hero and creating the account on it will raise the share of visitors who create one |
| **Control** | The hero ends in a button, "Start for free", that leads to the form further down the page. Their pattern today |
| **Variant** | The hero ends in the email field. Submitting it creates the account. Nothing else differs |
| **Success metric** | Signup conversion rate: visitors with a `signup_completed` within 7 days of first exposure, over exposed visitors. Both recorded on the server |
| **Guardrails** | Profile completion not more than 10% lower (relative). Signup failure rate not more than 2 points higher. No field Web Vital target missed that the control meets |
| **Sample** | 6,690 visitors per arm to detect a 15% relative lift on an assumed 10% baseline (alpha 0.05, power 0.8), from `scripts/experiment/sample-size.mjs`. Whole weeks only, at least two |

### Decision criteria

| Result at the planned sample | Decision |
|---|---|
| The split between arms fails the sample-ratio check | **Invalid.** Fix assignment or exposure and rerun |
| The planned sample or two whole weeks not reached | **Continue** |
| Rate up, 95% interval excludes zero, no guardrail breached | **Ship the variant** |
| Rate up, a guardrail breached | **Reject as designed.** Redesign and rerun |
| Interval includes zero | **Reject.** Keep the control |
| Rate down, interval excludes zero | **Reject.** Keep the control |

The table is read from the top and the first row that holds decides. No peeking: one look,
7 days after the last exposure, so every visitor has had the full window. A baseline of 10% and 1,500 visitors a day are assumptions
that the first week of traffic replaces, and the plan shows how the sample moves with them.

### What makes the result believable

- **Assignment happens at the edge,** before any HTML is sent, from a hash of the visitor id
  and the experiment key. No flicker, no layout shift, and no visitor dropped because a
  script was blocked (`src/server/landing.ts`).
- **Exposure and conversion are server events.** The denominator and the numerator have the
  same blind spots, which is to say none that differ by arm.
- **The arm is stored with the user** at signup, so a result can be re-derived from the
  database alone.
- **The analysis is a script,** not a dashboard read by eye: `scripts/experiment/analyze.mjs`,
  on statistics tested against values worked by hand. It states facts and which rows of the
  table hold. The `experiment-analyst` agent applies the table.
- **The method was rehearsed before any data.** The analyst ran the whole procedure on a
  result set labelled synthetic, recomputed every number independently, and reviewed the
  plan. It found thirteen places where the plan was ambiguous or unsafe, and each is closed
  by a dated amendment: [the report](experiments/hero_signup.synthetic-analysis.md), [the
  amendments](experiments/hero_signup.md#amendments).

## Ranked backlog

Ranked by what is learned per visitor spent.

| # | Experiment | Why it is next | Why it is not first |
|---|---|---|---|
| 2 | **The risk-reversal line under the call to action** ("Free plan. No credit card. No time limit." against nothing) | Their campaign pages have such a line and their homepage hero does not, so they have an open question already. Cheap to build | A smaller expected effect needs several times the traffic |
| 3 | **The profile step before or after the account** | It trades signups for signup quality, which the first experiment's guardrail will have started to measure | It needs the baseline funnel first |
| 4 | **The offer as the hero.** The hero becomes the free plan itself: a card that states the limits and holds the form ("Free means free. Here is exactly what you get."). It was one of the three rendered hero directions | It attacks the ambiguity between the free plan and the trial, which their own pages show | It changes the whole hero, so it runs once the smaller questions about the current one are answered |
| 5 | **The headline: the trader's doubt against the benefit** ("Is your edge real, or a lucky streak?" against "Test your strategy before you trust it.") | The message is the largest lever on a landing page after the offer | Two things should not change in the hero at once |
