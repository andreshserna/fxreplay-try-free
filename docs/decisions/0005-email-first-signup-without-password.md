# 0005. Signup is email-first with no password; profiling comes after the conversion

- **Status:** accepted
- **Date:** 2026-11-18
- **Phase:** 0

## Context

The brief asks for a signup or a simulated signup, says explicitly that FX Replay's
authentication does not need to be recreated, and asks for an API that creates, updates and
lists users with the integration being a meaningful part of the experience. Every field
before the conversion costs conversions. The demo carries another company's brand.

## Options considered

1. **Email only, then an optional profile step.** Step 1 creates the user and is the
   conversion. Step 2 asks what they trade, their experience and their prop-firm goal, and
   calls the update endpoint.
2. **One longer form** (email, password, name, experience). More data per signup, fewer
   signups, and the update endpoint has no natural caller.
3. **Email and password.** Looks more like a real signup, but it collects credentials on a
   demo that wears someone else's brand, which is a liability with no benefit.

## Decision

Step 1 takes an email and creates the user: that is the conversion. Step 2 is optional
progressive profiling after the conversion and is what calls `PATCH`. No password is
collected and account creation is simulated. Listing users is internal, protected by a
token, and never public.

## Consequences

- The fewest possible fields stand between a visitor and the measured event.
- All three API operations have a real caller or a real protection story.
- `PATCH` needs authorization without a login: a signed, httpOnly session cookie issued at
  creation.
- Profile completion becomes a signup-quality signal for the experiment's guardrails.
- **Cost to change later:** moderate. Real authentication (email verification, SSO) would
  replace the simulated step at one boundary: the create call hands off to it.
