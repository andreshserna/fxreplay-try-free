---
name: adr
description: Record an important decision as an ADR in docs/decisions and link it from the decision log. Use when a decision shapes the project or is costly to reverse, such as hosting and persistence, the API contract, the event taxonomy or the primary metric, which experiment goes first, the island library, a change to a starting position, a dependency with real weight or any third-party script.
argument-hint: "[short title of the decision]"
---

Record this decision: $ARGUMENTS

Every decision in this project is defended live in a technical review, so the ADR must hold
a reason a person can repeat in one breath.

1. List `docs/decisions/` and take the next four-digit number.
2. Copy [template.md](template.md) to `docs/decisions/NNNN-short-title.md` and fill it in:
   - **Context:** the forces at play, in three or four sentences. Facts about FX Replay carry
     their source, or are marked unverified.
   - **Options considered:** at least two real alternatives, each with the honest case for
     it. An option nobody would choose is not an option.
   - **Decision:** one or two sentences.
   - **Consequences:** what gets easier, what gets harder, and what it would cost to change
     later.
3. Keep it under about forty lines. Link to evidence instead of pasting it.
4. Add one line to `docs/decisions/log.md` that links to the ADR.
5. Brief the candidate at once, in four lines: the choice, the alternatives, why, and what it
   would cost to change later. Then continue on that choice unless told otherwise.

An ADR states a decision and its reasons, not the conversation that led to it. When a
decision replaces an earlier one, do not rewrite the old ADR: set its status to
`superseded by NNNN` and write a new one.
