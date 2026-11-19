# Analytics plan

## Events

<!-- events:start -->
<!-- Generated from src/lib/analytics/registry.ts by `npm run gen`. Do not edit: change the registry and run the command. -->

| Event | Fires | Trigger | Properties | Decision it informs |
| --- | --- | --- | --- | --- |
| `landing_viewed` | browser | Once per page load, after the landing page has rendered in a browser. | none | The denominator of the funnel: whether traffic from a source is worth buying. |
| `cta_clicked` | browser | A visitor activates a call to action that leads to the signup form. | `cta_name`: `start_free`<br>`cta_location`: `hero`, `proof`, `plan`, `faq`, `closing` | Which calls to action earn their place on the page. |
| `signup_started` | browser | The first input into the email field, once per page load. | `form_location`: `hero`, `closing` | Whether visitors are lost before the form (interest) or in it (friction). |
| `signup_submitted` | browser | The form passes client validation and a create request is sent. | `form_location`: `hero`, `closing`<br>`attempt`: integer, 1 to 50 | How many attempts never become accounts. |
| `signup_failed` | browser | A submission ends in anything other than an account, including client validation. | `form_location`: `hero`, `closing`<br>`attempt`: integer, 1 to 50<br>`reason`: `invalid_email`, `email_taken`, `rate_limited`, `offline`, `timeout`, `network`, `server`, `unexpected` | Which failure to fix first, and whether a release broke the signup. |
| `signup_completed` | server | The user row has been committed. Not emitted for an idempotent replay. | `user_id`: opaque id | The primary conversion. The numerator of the signup conversion rate. |
| `profile_completed` | server | A profile update that leaves at least one answer has been saved. | `user_id`: opaque id<br>`markets_count`: integer, 0 to 5<br>`experience`: `beginner`, `intermediate`, `advanced`, optional<br>`goal`: `strategy_testing`, `prop_firm`, `practice`, optional | Signup quality: the guardrail that stops a variant winning with empty accounts. |
| `experiment_exposed` | server | The edge serves a variant of the page to a visitor, before the HTML is sent. | `experiment`: opaque id<br>`variant`: opaque id | The denominator of each arm, and the sample-ratio check that validates a run. |
| `web_vitals` | browser | A Core Web Vital is final for this page load: once per metric. | `metric`: `LCP`, `INP`, `CLS`<br>`value`: number, 0 to 600000<br>`rating`: `good`, `needs-improvement`, `poor` | Whether real visitors get the page the lab budgets promise, by device and variant. |

<!-- events:end -->

## Context on every event

<!-- context:start -->
<!-- Generated from src/lib/analytics/registry.ts by `npm run gen`. Do not edit: change the registry and run the command. -->

| Field | Type | Meaning |
| --- | --- | --- |
| `event_id` | opaque id | Unique per event, for deduplication. |
| `occurred_at` | ISO 8601 timestamp, UTC | When it happened, ISO 8601 in UTC. |
| `anonymous_id` | opaque id | The visitor: a first-party cookie set at the edge. |
| `session_id` | opaque id, optional | The visit: ends after 30 minutes without activity. Browser events only. |
| `page_path` | site path, optional | The page, without query string. |
| `device_class` | `mobile`, `tablet`, `desktop`, optional | From the viewport width at page load. |
| `release` | opaque id | The git SHA of the build that emitted it. |
| `experiments` | `key:variant` pairs, comma-separated, optional | The variant of every running experiment, as `key:variant` pairs. |
| `first_source` | label (lowercase slug), optional | First touch: utm_source. |
| `first_medium` | label (lowercase slug), optional | First touch: utm_medium. |
| `first_campaign` | label (lowercase slug), optional | First touch: utm_campaign. |
| `last_source` | label (lowercase slug), optional | Last touch: utm_source. |
| `last_medium` | label (lowercase slug), optional | Last touch: utm_medium. |
| `last_campaign` | label (lowercase slug), optional | Last touch: utm_campaign. |
| `via` | label (lowercase slug), optional | The affiliate token, from ?via=. |
| `aff` | label (lowercase slug), optional | The source tag, from ?aff=. |
| `source` | `client`, `server`, optional | Where the event was emitted. Set by the server, never by the browser. |
| `country` | label (lowercase slug), optional | Two-letter country of the request, from the edge. Set by the server. |
| `is_bot` | boolean, optional | The user agent looks automated. Set by the server, to filter in analysis. |

<!-- context:end -->

## Experiments

<!-- experiments:start -->
<!-- Generated from src/lib/experiments/registry.ts by `npm run gen`. Do not edit: change the registry and run the command. -->

| Key | Control | Variants | Status | Plan |
| --- | --- | --- | --- | --- |
| `hero_signup` | `cta_button` | `cta_button`, `inline_email` | running | [experiments/hero_signup.md](experiments/hero_signup.md) |

<!-- experiments:end -->
