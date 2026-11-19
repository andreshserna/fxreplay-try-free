---
name: new-experiment
description: Scaffold a pre-registered A/B experiment from the template, with hypothesis, variants, primary metric, guardrails, minimum detectable effect and sample size from the script, flag key and exposure wiring. Use when proposing or implementing an experiment.
argument-hint: "[flag-key] [one-line idea]"
---

Scaffold this experiment: $ARGUMENTS

The plan is written and committed before any data exists. That is what makes the result
believable, and it is what `experiment-analyst` will hold the data to.

1. **Write the spec.** Copy [template.md](template.md) to `docs/experiments/<flag-key>.md`
   and fill in every section. The experiment chosen for the submission is the one
   `docs/experiment-proposal.md` presents.
2. **Hypothesis with its reasoning.** Because of an observation with a source, we believe
   this change will cause this effect for these visitors. A hypothesis that cannot be wrong
   is not one.
3. **Primary metric,** defined exactly: numerator, denominator, unit (unique visitors),
   window. By default it is the project's primary conversion metric.
4. **Guardrails** with thresholds: signup quality (profile completion and, in production,
   first replay session started), the Core Web Vitals, the error rate. A variant that only
   inflates low-intent signups must not ship.
5. **Numbers from the script, never by hand.** Run `scripts/experiment/sample-size.mjs` with
   the baseline rate, the minimum detectable effect, alpha and power. Paste the command and
   its output into the spec. Round the duration up to whole weeks: a trading audience behaves
   differently on weekends, when FX is closed. State where the baseline came from. If it is
   an assumption, say so.
6. **Decision table,** written now: the results that mean ship, continue and reject. Include
   the sample-ratio threshold that invalidates the run. No peeking unless the design is
   sequential, and then say which method.
7. **Wire it.** Add the flag key to the experiment registry in `src/lib/experiments/`.
   Assignment happens at the edge, sticky per visitor, and the variant renders in the HTML
   with no flicker or layout shift. Add the exposure event with `/track-event`: it fires
   before the variant renders and only for visitors who can see the difference.
8. **Commit the spec** before collecting data. If the plan must change later, change it in a
   new commit that says why. Never rewrite it in place.
9. **Record it.** Which experiment runs first is an important decision: use `/adr`.
