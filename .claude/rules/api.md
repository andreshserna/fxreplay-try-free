---
paths:
  - "src/pages/api/**"
  - "src/server/**"
  - "src/lib/api/**"
  - "docs/api.md"
---

# Users API

- **Contract first.** Change `docs/api.md` and the shared schemas before the implementation.
  The same schemas validate on the client (for the user's benefit) and on the server (the
  authority).
- Three operations:
  - `POST` creates a user. Public, idempotent through `Idempotency-Key`, rate limited, with a
    honeypot field against bots.
  - `PATCH` updates profile fields. Authorized by the signed, httpOnly session cookie issued
    at creation.
  - `GET` lists users with cursor pagination. Requires the admin token. Never public.
- Errors are RFC 9457 problem details with a stable machine `code`. The UI maps codes to
  states in one place. Nothing matches on message text.
- Email is normalized before storage and unique at the database level, not only in code.
- Create stores first-touch and last-touch attribution and the experiment assignment with the
  user, so acquisition data survives when client analytics are blocked.
- Persistence sits behind the repository interface. Tests use the in-memory implementation.
  Everything runs locally without creating an account anywhere.
- The primary conversion event is emitted on the server after the user row is committed,
  never before.
- This is a simulated signup. No passwords, no credentials, no real authentication.
- Secrets come from the environment. They are never hard-coded, logged or returned. Email
  goes to the database and nowhere else: not to logs, not to analytics.
- The frontend reaches the API through the one typed client: a timeout, safe retries and a
  single mapping from API errors to UI states. Components do not call `fetch` themselves.
