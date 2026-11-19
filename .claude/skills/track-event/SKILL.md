---
name: track-event
description: Add or change an analytics event end to end, covering the registry, types, call site, test and regenerated docs, then verify it with the analytics-qa agent. Use for any change to what the page tracks.
argument-hint: "[event_name] [what it should measure]"
---

Add or change this event: $ARGUMENTS

Analytics is code here. The registry is the single source of truth, and the docs are
generated from it. Follow the steps in order.

1. **Name the decision first.** Write one sentence: which decision this event informs, and
   who makes it. If there is none, stop and say so: the event should not exist.
2. **Edit the registry** in `src/lib/analytics/`. One entry carries:
   - the name, `object_action` in snake case and past tense (`signup_submitted`);
   - the trigger, precise enough that two people would instrument it identically;
   - the properties with their types, each one necessary;
   - where it fires: client or server;
   - the decision from step 1.
   Context (anonymous id, session id, attribution, device class, experiment assignments,
   release SHA, event id) is attached by the tracker. Do not repeat it as properties.
3. **Regenerate:** `npm run gen`. This rewrites the types, the runtime validators and the
   event table in `docs/analytics-plan.md`. Never edit generated output by hand.
4. **Add the call site** with `track()`. It fires exactly once per occurrence, never blocks
   rendering or the signup, and never throws into the UI.
5. **Test it.** A unit test for the payload. If the event is part of the funnel, extend the
   end-to-end funnel test so it asserts this event fires once, in order, with its properties.
6. **Run the checks:** `npm run typecheck`, `npm test`, `npm run gen:check`.
7. **Verify in a browser:** run the `analytics-qa` agent on the change with the URL of a
   running build. Fix what it finds and run it again.
8. **Record it.** A new or renamed event gets a line in `docs/decisions/log.md`. A change to
   the funnel or to the primary metric is an important decision: use `/adr`.

Never put PII in a payload: no email, no name, no text a visitor typed.
