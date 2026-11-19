---
paths:
  - "src/pages/**/*.astro"
  - "src/components/**"
  - "src/layouts/**"
---

# The experience

## Landing

One page, mobile first. Paid social and affiliate traffic is assumed to land on phones: an
assumption, documented as one. Every section answers an objection that stands between a
visitor and the signup. If it answers none, cut it. The expected shape:

1. A hero with the value proposition, the primary CTA and the risk reversal (free, no card).
2. Product proof that shows replay instead of describing it.
3. Who it is for: strategy testing, prop-firm preparation.
4. An honest summary of the free plan and its limits.
5. Social proof, only if it is real and sourced.
6. An FAQ for the remaining objections.
7. A closing CTA.

## Signup

- States: idle, validating, submitting, success, field errors, email already registered
  (with a path to log in), rate limited, network failure or timeout (retry keeps the input),
  server error.
- A double submit is harmless.
- Validation runs on blur and on submit, not on every keystroke.
- Focus moves to the first error, and status changes are announced to assistive technology.
- Success is a real conversion state. It leads into the optional profile step, and then to a
  clear next action.
- The submit button is never disabled. While a request is in flight it stays on the active
  fill with a spinner and `aria-busy`.
- Only the signup form hydrates. Everything else is static HTML, with one small plain
  script: the controls of the hero illustration.
- Anything drawn as a control responds when it is tapped. An illustration does not show a
  button that does nothing.
- No text is set below 16px.

## How a section gets built

Build it. Screenshot it at 360, 768 and 1440 through `chrome-devtools`. Critique it against
the brand kit and the page's job: hierarchy, CTA prominence, rhythm, alignment, states. Fix
what is plainly off. Then show the candidate, with at most three pointed questions, and
iterate. Keep each loop small. Run `design-critic` on each finished section.

Craft lives in the details: a fluid type scale, one spacing scale, a consistent radius and
border system, every interactive state designed, a favicon and a social image from the
isotype.
