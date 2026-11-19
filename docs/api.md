# Users API

The contract the signup flow is built against. It was written before the implementation
(ADR 0006), and `tests/unit/users-api.test.ts` and `tests/api/users.http.test.ts` hold the
implementation to it. Three operations, one resource, same origin as the site.

## Conventions

- JSON in, JSON out. Requests send `Content-Type: application/json`. Bodies over 8 KB are
  refused.
- Every response carries `Cache-Control: no-store` and an `X-Request-Id`.
- Errors are RFC 9457 problem details (`application/problem+json`). `code` is the stable
  machine string a client switches on. `type` is the same identity as a URI, and it resolves:
  `/problems/<code>` is a page that describes the problem. `detail` is for people and may
  change.
- Unversioned while its only client ships in the same deployable. Changes are additive. The
  first external consumer gets a `/v1` prefix.
- Same origin only: no CORS headers. A request that carries the session cookie must also
  carry an `Origin` equal to the site's.

## The user

```json
{
  "id": "usr_01JD3K8Q9ZC4N7V2M5XW6T8RBE",
  "email": "ada@example.com",
  "profile": { "markets": ["forex", "indices"], "experience": "intermediate", "goal": "prop_firm" },
  "created_at": "2026-11-18T23:29:22Z",
  "updated_at": "2026-11-18T23:31:05Z"
}
```

| Field | Rules |
|---|---|
| `id` | `usr_` plus a ULID. Opaque to clients, sortable by creation time |
| `email` | Trimmed and lowercased before storage, 254 characters at most, unique in the database. Checked for shape only: deliverability is a production concern |
| `profile.markets` | Any of `forex`, `futures`, `stocks`, `crypto`, `indices`. Optional |
| `profile.experience` | One of `beginner`, `intermediate`, `advanced`. Optional |
| `profile.goal` | One of `strategy_testing`, `prop_firm`, `practice`. Optional |

The profile vocabulary is provisional until the research confirms how FX Replay names these.
The list operation also returns `attribution`, `experiments` and `anonymous_id`.

## Create a user

`POST /api/users`. Public. This is the conversion.

| Header | |
|---|---|
| `Idempotency-Key` | Required. 16 to 64 characters of `A-Z a-z 0-9 _ -`. One key per signup attempt, reused on every retry of it |

```json
{
  "email": "Ada@Example.com ",
  "anonymous_id": "0b5c1b0e-6a54-4d0f-9d43-2f6f0e7a9c11",
  "attribution": {
    "first_touch": { "source": "instagram", "medium": "paid_social", "campaign": "try_free", "via": "partner42", "landing_path": "/", "at": "2026-11-17T14:02:11Z" },
    "last_touch": { "source": "google", "medium": "cpc", "landing_path": "/", "at": "2026-11-18T23:27:40Z" }
  },
  "experiments": { "hero_signup": "inline_email" },
  "website": ""
}
```

Only `email` is required. `attribution`, `experiments` and `anonymous_id` are stored with the
user so acquisition data survives when client analytics are blocked. `website` is a honeypot:
people never see it.

**201 Created.** `Location: /api/users/usr_01JD…`, the user as above, and a session cookie:
`__Host-session`, signed, `HttpOnly; Secure; SameSite=Lax; Path=/`, valid for one hour. It
authorizes exactly one thing: updating this user's profile.

**Idempotency.** A repeat of the same key with the same body returns the original response
again, with `Idempotency-Replayed: true`. A retry after a timeout therefore never shows
"already registered" to the person who just registered. Concurrent duplicates of one
request get the same answer too: the database picks the winner and the rest replay it. Keys
are kept for 24 hours.

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_json` | The body is not JSON |
| 400 | `idempotency_key_missing` | No `Idempotency-Key`, or not in the allowed shape |
| 409 | `email_taken` | The email already has an account. The UI offers the way to log in |
| 413 | `payload_too_large` | Body over 8 KB |
| 415 | `unsupported_media_type` | Not `application/json` |
| 422 | `validation_failed` | A field is invalid. `errors` lists each one |
| 422 | `idempotency_key_reused` | The key was used before with a different body |
| 429 | `rate_limited` | Too many attempts. `Retry-After` in seconds |
| 500 | `internal_error` | Unexpected. Safe to retry with the same key |
| 503 | `service_unavailable` | The database is unreachable. `Retry-After`. Safe to retry with the same key |

```json
{
  "type": "https://example.workers.dev/problems/validation-failed",
  "title": "The request has invalid fields",
  "status": 422,
  "code": "validation_failed",
  "detail": "1 field needs attention.",
  "instance": "/api/users",
  "errors": [{ "field": "email", "code": "invalid_format", "message": "Enter an email like name@example.com." }]
}
```

`email_taken` reveals that an address is registered. That is a deliberate trade: the person
gets a useful next step, and rate limiting bounds enumeration. In production the same request
would answer neutrally and send an email instead, which needs the email delivery this demo
leaves out.

A request with a filled honeypot is answered like a success and discarded: no row, no event.

## Update a user

`PATCH /api/users/{id}`. Authorized by the session cookie issued at creation, and only for
that user. The body is a partial `profile`. A field set to `null` is cleared. Unknown fields
are rejected.

```json
{ "markets": ["forex", "indices"], "experience": "intermediate", "goal": "prop_firm" }
```

**200 OK** with the user.

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_json` | The body is not JSON |
| 401 | `unauthenticated` | No session cookie, or it is expired or tampered with |
| 403 | `forbidden` | The session belongs to another user, or the `Origin` is not the site's |
| 404 | `not_found` | No such user |
| 422 | `validation_failed` | A field is invalid. `errors` lists each one |
| 429 | `rate_limited` | Too many updates. `Retry-After` in seconds |
| 500, 503 | as above | `PATCH` is idempotent, so it is safe to retry |

## List users

`GET /api/users?limit=20&cursor=…`. Internal. Requires `Authorization: Bearer <admin token>`.

| Parameter | |
|---|---|
| `limit` | 1 to 100. Default 20 |
| `cursor` | Opaque, from the previous page's `next_cursor`. Newest first |

```json
{
  "data": [
    {
      "id": "usr_01JD3K8Q9ZC4N7V2M5XW6T8RBE",
      "email": "ada@example.com",
      "profile": { "markets": ["forex", "indices"], "experience": "intermediate", "goal": "prop_firm" },
      "anonymous_id": "0b5c1b0e-6a54-4d0f-9d43-2f6f0e7a9c11",
      "attribution": { "first_touch": { "source": "instagram", "medium": "paid_social", "landing_path": "/", "at": "2026-11-17T14:02:11Z" }, "last_touch": null },
      "experiments": { "hero_signup": "inline_email" },
      "created_at": "2026-11-18T23:29:22Z",
      "updated_at": "2026-11-18T23:31:05Z"
    }
  ],
  "next_cursor": "dXNyXzAxSkQzSzhROVpDNE43VjJNNVhXNlQ4UkJF"
}
```

Pagination is by key, not by offset: a page never shifts when new users arrive. `next_cursor`
is `null` on the last page.

| Status | `code` | When |
|---|---|---|
| 401 | `unauthenticated` | Missing or wrong token. `WWW-Authenticate: Bearer` |
| 422 | `validation_failed` | `limit` or `cursor` is invalid |
| 429 | `rate_limited` | `Retry-After` in seconds |

Any other method on these paths answers **405** `method_not_allowed` with an `Allow` header.

## Abuse controls

| Control | Where |
|---|---|
| Rate limit on create, per client IP | At the edge, before the database is touched |
| Rate limit on update, per session | Same |
| Honeypot field | In the create handler |
| Body size, content type, strict schemas | First thing in every handler |
| Unique email | In the database, so two concurrent requests cannot both win |

Limits are approximate by design: they stop abuse, they are not quotas.

## How the page uses it

One typed client is the only code that calls these endpoints. It adds the idempotency key,
gives up after 8 seconds, and retries once, with the same key, on a network failure, a
timeout, or a 500, 502, 503 or 504. It never retries a 4xx.

| The API answers | The form shows |
|---|---|
| 201, or a replay of it | Success, then the optional profile step |
| 422 `validation_failed` | The message under each field, focus on the first |
| 409 `email_taken` | "You already have an account", with the way to log in |
| 429 `rate_limited` | "Too many attempts", with when to try again |
| 5xx after the retry, timeout, offline | "We could not reach the server", the input kept, a retry button |
| Anything else | The same as a server error. It is logged as a contract violation |
