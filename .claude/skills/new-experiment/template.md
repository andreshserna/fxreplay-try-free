# Experiment: title

- **Flag key:** `flag-key`
- **Status:** proposed | running | decided
- **Pre-registered:** YYYY-MM-DD, commit `SHA` (before any data)
- **Owner:**

## Hypothesis

Because **[observation, with its source]**, we believe **[change]** will cause **[effect]**
for **[audience]**. We will know from **[primary metric]**.

## Variants

| | Experience |
|---|---|
| Control | The baseline, described so someone could rebuild it. |
| Variant | Exactly what changes, and nothing else. |

Allocation: 50 / 50. Audience: who is eligible and who is excluded (bots, internal traffic).

## Metrics

- **Primary:** name, numerator / denominator, unit, window.
- **Guardrails:** each with the threshold that blocks a ship.
- **Exposure:** when a visitor counts as exposed.

## Sample size and duration

Baseline: N% (source, or "assumed"). Minimum detectable effect: N% relative. Alpha: 0.05.
Power: 0.8.

```
$ node scripts/experiment/sample-size.mjs ...
(paste the output)
```

Runs for N whole weeks. No peeking.

## Decision table

| Result | Decision |
|---|---|
| Sample-ratio mismatch at the stated threshold | Invalid. Fix assignment or exposure and rerun. |
| Planned sample or duration not reached | Continue. |
| Primary metric up by the minimum detectable effect or more, interval excludes zero, no guardrail breached | Ship. |
| Primary metric up, a guardrail breached | Reject, or redesign and rerun. |
| Interval includes zero at the planned sample | Reject. Keep the control. |
| Primary metric down, interval excludes zero | Reject. |

## Risks and notes

What could make this result misleading, and what we do about each.
