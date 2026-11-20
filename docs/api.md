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
- A cross-site request (by `Sec-Fetch-Site`, or else `Origin`) with a form content type
  (`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`) or none is
  refused by the framework before the handlers run, with a plain 403 that carries no problem
  body.

## The user

```json
{
  "id": "usr_01JD3K8Q9ZC4N7V2M5XW6T8RBE",
  "email": "ada@example.com",
  "profile": { "markets": ["forex", "indices"], "experience": "intermediate", "goal": "prop_firm" },
  "created_at": "2026-11-18T23:29:22.000Z",
  "updated_at": "2026-11-18T23:31:05.000Z"
}
```

| Field | Rules |
|---|---|
| `id` | `usr_` plus a ULID. Opaque to clients, sortable by creation time |
| `created_at`, `updated_at` | ISO 8601 in UTC, with milliseconds |
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
  "attribution": {
    "first_touch": { "source": "instagram", "medium": "paid_social", "campaign": "try_free", "via": "partner42", "landing_path": "/", "at": "2026-11-17T14:02:11Z" },
    "last_touch": { "source": "google", "medium": "cpc", "landing_path": "/", "at": "2026-11-18T23:27:40Z" }
  },
  "website": ""
}
```

Only `email` is required. `website` is a honeypot: people never see it.

Three things are stored with the user so acquisition data survives when client analytics are
blocked. `attribution` comes from the body, because only the browser saw the landing URL. The
visitor's anonymous id and experiment arms do not: the server reads its own `HttpOnly` visitor
cookie and computes the arms from it, so a client can neither forge nor forget them. Sending
`anonymous_id` or `experiments` in the body is a validation error. A request without the
visitor cookie gets a new anonymous id, set in the response, and is stored with
`experiments: {}`: no arm was ever served under that id, so none is credited, and its
`signup_completed` carries no assignment.

After the row is committed, and only then, the server emits the `signup_completed` event
(`docs/analytics-plan.md`). A replay emits nothing.

**201 Created.** `Location: /api/users/usr_01JD…`, the user as above, and a session cookie:
`__Host-session`, signed, `HttpOnly; Secure; SameSite=Lax; Path=/`, valid for one hour. It
authorizes exactly one thing: updating this user's profile.

**Idempotency.** A repeat of the same key with the same body answers 201 again, with the
user as it is now, a fresh session cookie and `Idempotency-Replayed: true`. It emits no event.
A retry after a timeout therefore never shows "already registered" to the person who just
registered. Concurrent duplicates of one request get the same answer too: the database picks
the winner and the rest replay it. Keys are honored for 24 hours. After that a key counts as
unused, and the request that reuses it replaces it in the same transaction that creates its
user, so a fresh key is never erased.

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_json` | The body is not JSON |
| 400 | `idempotency_key_missing` | No `Idempotency-Key`, or not in the allowed shape |
| 409 | `email_taken` | The email already has an account. The UI offers the way to log in. Also a reused key past its 24 hours, when the email is the same |
| 413 | `payload_too_large` | Body over 8 KB |
| 415 | `unsupported_media_type` | Not `application/json` |
| 422 | `validation_failed` | A field is invalid. `errors` lists each one |
| 422 | `idempotency_key_reused` | The key was used in the last 24 hours with a different body |
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

A request with a filled honeypot is answered like a success and discarded: no row, no event,
no session cookie. The server logs `signup discarded: honeypot` with the request id, and
nothing else.

### The same signup from a plain form

`POST /signup`, `application/x-www-form-urlencoded`, field `email`. For a browser that has not
run the page's script. It creates the user through the same code and the same rules, sets the
same cookies, and answers `303 See Other` to a static page: `/signup/done/`,
`/signup/email-taken/`, `/signup/invalid/` or `/signup/try-again/`.

- **Repeats.** It has no idempotency header, so the key is derived on the server from the
  visitor cookie and the email, signed with the server's secret: repeating the form repeats
  the request. The key has a shape the `Idempotency-Key` header does not accept, so it cannot
  be presented to `POST /api/users`. Without the visitor cookie a repeat is a new request,
  and lands on `/signup/email-taken/`.
- **Other sites.** A post whose `Origin` is not the site's answers **403** `forbidden`, and
  a body that is not `application/x-www-form-urlencoded` lands on `/signup/invalid/`. The
  framework refuses a cross-site form post before this handler runs, with a plain 403 that
  does not pass through the middleware.
- **Attribution.** The campaign parameters of the page the form was posted from (its
  `Referer`, same origin only) are stored as the user's first and last touch.

## Update a user

`PATCH /api/users/{id}`. Authorized by the session cookie issued at creation, and only for
that user. The body is a partial `profile`. A field that is absent is left alone, a field set
to `null` is cleared, and repeated markets are stored once. Unknown fields are rejected. The
database applies the patch in one statement, so concurrent updates of different fields all
land.

```json
{ "markets": ["forex", "indices"], "experience": "intermediate", "goal": "prop_firm" }
```

**200 OK** with the user.

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_json` | The body is not JSON |
| 401 | `unauthenticated` | No session cookie, or it is expired or tampered with |
| 403 | `forbidden` | The session belongs to another user, or the `Origin` is missing or not the site's |
| 404 | `not_found` | The session is valid, but its own user no longer exists |
| 413 | `payload_too_large` | Body over 8 KB |
| 415 | `unsupported_media_type` | Not `application/json` |
| 422 | `validation_failed` | A field is invalid. `errors` lists each one |
| 429 | `rate_limited` | Too many updates from this session. `Retry-After` in seconds |
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
      "created_at": "2026-11-18T23:29:22.000Z",
      "updated_at": "2026-11-18T23:31:05.000Z"
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
| 429 | `rate_limited` | Too many requests from this address, checked before the token. `Retry-After` in seconds |

Any other method on these paths answers **405** `method_not_allowed` with an `Allow` header.

## The event collector

`POST /api/events` receives the page's analytics events. It is not part of the Users API, and
only the page's tracker calls it. [The analytics plan](analytics-plan.md) has the events.

```http
POST /api/events
Content-Type: application/json

{
  "context": { "page_path": "/", "session_id": "…", "device_class": "mobile", "release": "cb06628" },
  "events": [
    { "name": "signup_started", "properties": { "form_location": "hero" },
      "event_id": "0b0f…", "occurred_at": "2026-11-19T10:04:11.201Z" }
  ]
}
```

**202 Accepted**, always with the count, never with the reasons, so a caller learns nothing
about the rules by probing:

```json
{ "accepted": 1, "rejected": 0 }
```

- At most 25 events and 16 KB. An event that is not in the registry, is server-only, or has a
  property of the wrong shape is rejected. An unknown key is dropped and the event is kept.
- The server adds what a browser must not choose: the visitor id (from the `HttpOnly`
  cookie, set here if absent), the country, whether the agent looks automated, and the time
  when the browser's is more than a day old or five minutes ahead.

| Status | `code` | When |
|---|---|---|
| 403 | `forbidden` | An `Origin` that is not the site's |
| 429 | `rate_limited` | More than 120 requests a minute from one address |
| 413 | `payload_too_large` | A body over 16 KB |
| 400 | `invalid_json` | A body that does not parse |
| 422 | `validation_failed` | Not `{ context, events }`, or more than 25 events |

## Abuse controls

| Control | Where |
|---|---|
| Rate limit on create, per client IP | First thing in the handler, before the database is touched |
| Rate limit on update, per session | After the session and `Origin` checks, before the body is read |
| Rate limit on list, per client IP | Before the token is checked, so it also bounds guessing the token |
| Honeypot field | In the create handler |
| Content type, body size, strict schemas | After the rate limit and authorization, before anything is stored. The size limit stops reading at 8 KB, so a larger body is never buffered |
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
