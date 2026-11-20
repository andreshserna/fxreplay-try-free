# 0002. One deployable: the Users API lives in the Astro project

- **Status:** accepted
- **Date:** 2026-11-18
- **Phase:** 0

## Context

The brief asks for a Users API (create, update, list) that the signup flow calls, so the
integration is part of the experience and not a separate demonstration. It also says a
smaller, thoughtfully executed solution beats a large one with unnecessary complexity.

## Options considered

1. **Server endpoints in the same Astro project.** One repository, one pipeline, one
   deployment, same origin.
2. **A separate API service.** Independent scaling and deployment, and a hard boundary
   between teams. It also means a second pipeline, CORS, cross-site cookies and two things
   to keep in step, for three operations.
3. **A backend-as-a-service** (the brief allows Notion or similar). Fastest to stand up, but
   it hides the contract design, the validation and the failure handling, which are what the
   brief says it wants to see.

## Decision

The API is a set of server endpoints in the same Astro project as the landing page.

## Consequences

- Same origin: no CORS, a simple `SameSite` session cookie, shared schemas imported by both
  sides.
- One pipeline. (As built: CI on every push and a manual deploy. A preview URL per change
  is the production setup, in `docs/architecture.md`.)
- The API scales and deploys with the site. That is fine at this size and would be the first
  thing to revisit under real load.
- **Cost to change later:** moderate, kept low on purpose. Endpoints stay thin adapters over
  a service and a repository interface (ADR 0003), so they can move behind another host
  without touching the logic.
