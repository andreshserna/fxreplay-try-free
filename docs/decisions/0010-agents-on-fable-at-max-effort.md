# 0010. Every agent runs on Fable at the highest effort level; reviewers are read-only

- **Status:** superseded by 0012
- **Date:** 2026-11-18
- **Phase:** 0

## Context

The brief grades the system built around AI, not the number of prompts. The system here has
one author and several reviewers: the main session implements, and separate agents with
fresh context and no write tools review, so the author never grades its own work. The
requirement for those agents: do not trade quality for tokens, and never fall back to
another model silently.

## Options considered

1. **Fable at the highest effort level for every agent and forked skill.**
2. **Cheaper models for the reviewers.** Lower cost and faster reports, with shallower
   reviews of the work that most needs depth.
3. **Inherit the session's model and effort.** Nothing to configure, and the quality of a
   review then depends on how the session happened to be started.

## Decision

Every agent sets `model: fable` and `effort: max`. Claude Code's documentation lists `max`
as the highest level Fable supports and as a valid value for the `effort` field of an agent
(code.claude.com/docs/en/model-config and /sub-agents, read on 2026-11-18). No skill in this
repository forks, so the rule has no skill to apply to today.

## Consequences

- Reviews do not vary with the session's settings.
- The same documentation warns that `max` can overthink and show diminishing returns. This
  is accepted knowingly. If reviews turn slow without finding more, the level is revisited
  with evidence and logged.
- Token use is high, and Fable usage may bill to usage credits depending on the plan.
- A fallback is visible, not silent: an agent that switched model says so in the first line
  of its report, and `/ship-check` copies that line into its report.
- **Cost to change later:** trivial. Two lines per agent file.
