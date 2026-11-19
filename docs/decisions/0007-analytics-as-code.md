# 0007. Analytics is code: one typed registry, a neutral `track()`, a server-side conversion

- **Status:** accepted
- **Date:** 2026-11-18
- **Phase:** 0

## Context

The brief asks to treat analytics as part of the product and to explain how the data is kept
accurate and trustworthy. The usual failures are well known: event names typed by hand in
several places, a tracking plan in a document that no longer matches the code, and a
conversion count that depends on a script ad blockers remove.

## Options considered

1. **A typed event registry as the single source.** Types, runtime validation and the
   taxonomy table in the docs are generated from it. Call sites use a vendor-neutral
   `track()`. PostHog is the destination, with a `dataLayer` adapter for ad platforms. The
   primary conversion is emitted on the server after the user row is committed.
2. **Call the vendor SDK directly** where events happen. Nothing to build, and nothing to
   stop a typo, a missing property or drift between the plan and the code.
3. **Tag manager only.** Marketing can change tracking without a deploy, but the definitions
   live in a UI outside version control and review.
4. **A customer data platform** such as Segment. Clean fan-out to many tools, and one more
   vendor, script and bill than this page needs.

## Decision

Option 1. The page must also work with no analytics key at all, against console and test
adapters.

## Consequences

- An event that is not in the registry does not compile, and the docs cannot drift because
  they are generated.
- The conversion count survives ad blockers and can be reconciled against the users table.
- PostHog covers product analytics, flags and experiments in one place.
- The registry and its generator are code to maintain, and any third-party script has to fit
  the performance budgets.
- **Cost to change later:** low for the vendor (write another adapter). High for event names
  once dashboards and experiments depend on them.
