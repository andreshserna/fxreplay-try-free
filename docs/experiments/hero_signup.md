# Experiment: an email field in the hero against a button that leads to the form

- **Flag key:** `hero_signup`
- **Status:** proposed. Assignment and exposure are implemented and tested. No data exists.
- **Pre-registered:** 2026-11-18, written at commit `6542901`, before any data
- **Why this one first:** [ADR 0015](../decisions/0015-first-experiment-hero-signup.md)

## Hypothesis

Because FX Replay's hero today is a button that leads to a separate signup screen, where the
email does not yet create the account (`docs/research/brief.md`, section 4), and because each
extra step before an account loses visitors, we believe that **asking for the email in the
hero and creating the account on it** will raise the share of visitors who create an account,
for marketing traffic on every device. We will know from the signup conversion rate.

It can be wrong in two ways we would learn from: visitors may not be ready to give an email
before they have read the page (the rate does not move, or drops), or the field may collect
emails from people who never come back (the rate rises and the guardrail falls).

## Variants

| | Experience |
|---|---|
| Control, `cta_button` | The hero ends in one button, "Start for free", that takes the visitor to the signup form in the closing section of the same page. This is the pattern their site runs today. |
| Variant, `inline_email` | The hero ends in the email field and its button. Submitting it creates the account. Nothing else on the page differs. |

Allocation: 50 / 50, by a hash of the visitor id and the experiment key
(`src/lib/experiments/registry.ts`), decided at the edge before any HTML is sent. Audience:
every visitor to the landing page. Excluded from analysis: events flagged `is_bot`, and
internal traffic by source tag.

## Metrics

- **Primary: signup conversion rate.** Visitors with a `signup_completed` within 7 days of
  their first `experiment_exposed`, divided by visitors with an `experiment_exposed`. Both
  events are recorded on the server, so neither arm loses visitors to blocked scripts. The
  unit is the visitor.
- **Guardrail, signup quality:** `profile_completed` over `signup_completed`. Blocks a ship if
  the variant is more than 10% lower, relative. In production the stronger guardrail is
  "first replay session started", which this demo cannot observe.
- **Guardrail, failures:** `signup_failed` over `signup_submitted`, excluding `invalid_email`.
  Blocks a ship if the variant is more than 2 points higher.
- **Guardrail, speed:** p75 of LCP, INP and CLS from `web_vitals`, per arm. Blocks a ship if
  the variant misses a field target (2.5 s, 200 ms, 0.1) that the control meets.
- **Exposure:** the edge serves an arm of the page. Prefetches are not exposures.

## Sample size and duration

Baseline: 10%, **assumed**. FX Replay publishes no conversion rate, and this page has no
traffic yet. Minimum detectable effect: 15% relative (10% to 11.5%). Alpha 0.05, two-sided.
Power 0.8.

```
$ node scripts/experiment/sample-size.mjs --baseline 0.10 --mde 0.15 --daily-visitors 1500
Sample size: two-sided two-proportion z-test, two equal arms
  Baseline rate:      10%
  Minimum effect:     +15% relative
  Rates compared:     10% (control) vs 11.5% (variant)
  Alpha:              0.05 (two-sided)
  Power:              0.8
  Visitors per arm:   6690
  Visitors in total:  13380
  Daily visitors:     1500
  Days needed:        9
  Duration:           2 whole weeks
```

The 1,500 visitors a day is also an assumption, there to show how the duration is derived.
The first week of real traffic replaces both numbers, and the table is why that matters:

| Baseline | Detect +15% | Detect +20% |
|---|---|---|
| 5% | 14,190 per arm | 8,155 per arm |
| 10% | 6,690 per arm | 3,839 per arm |
| 15% | 4,190 per arm | 2,400 per arm |

Runs for whole weeks only, and for at least two, whatever the traffic: a trading audience
behaves differently at weekends, when the forex market is closed. One look at the end. No
peeking, and no stopping early on a good day.

## Decision table

| Result at the planned sample | Decision |
|---|---|
| Sample-ratio mismatch: chi-square p below 0.001 on exposed visitors per arm | Invalid. Fix assignment or exposure, then rerun. |
| Planned sample or two whole weeks not reached | Continue. |
| Rate up by 15% relative or more, 95% interval excludes zero, no guardrail breached | Ship the variant. |
| Rate up, interval excludes zero, effect below 15% | Ship the variant: it is better, by less than planned for. |
| Rate up, a guardrail breached | Do not ship. Redesign and rerun. |
| Interval includes zero | Keep the control. The question is closed at this sensitivity. |
| Rate down, interval excludes zero | Keep the control. |

The numbers come from `scripts/experiment/stats.mjs`: the two-proportion test with its
interval, and the sample-ratio check. `experiment-analyst` applies this table to the results.

## Risks and notes

- **Novelty.** There is none to wear off: every visitor is new to this page.
- **Returning visitors with cleared cookies** can land in the other arm. They count once per
  cookie. The effect dilutes the difference a little and biases it toward zero.
- **The variant's form sits above the fold, the control's below.** That is the treatment, not
  a confound, but it means the result is about "field in the hero", not about the field's
  design.
- **The promotion calendar.** A sale running during the test changes who visits
  (`docs/research/brief.md`, section 3.2). Both arms see the same traffic, so the comparison
  holds, but the baseline measured in such a fortnight is not the normal one.
- **Device mix.** The split by device class is reported, not tested: the sample is sized for
  the overall effect only.
