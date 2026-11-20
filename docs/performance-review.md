# Performance review

Measured on 2026-11-19 with Lighthouse 13.6, mobile profile with simulated throttling at its
default 4x CPU slowdown, median per experiment arm (`npm run lighthouse`: three runs locally,
five in CI). Each audit runs in a new Chrome profile, and the check fails if the document it
measured is not the arm it was asked for. The same command runs in CI on every push and
fails the build when a judged budget is missed.

**What a lab number here is worth.** Lighthouse's 4x assumes a high-end desktop as the host.
A faster host measures an easier run and a slower one a harder run, so each number below
names the machine it came from, and the run prints its own benchmark index beside it. An
earlier version of the check scaled the slowdown to the host's benchmark. It was removed
after the release gate found two faults in it: its first, unjudged run left a visitor cookie
that made every later run measure the same arm, and its cold reading of the benchmark
under-throttled CI by up to a third. The numbers in this document were measured again
after the fix.

**Total blocking time is judged only where Chrome has four cores or more.** On GitHub's
two-core shared runners the same page measured between 32 and 215 ms, and on four cores
between 0 and 29 ms. The benchmark times one thread. Blocking time is wall-clock time on
the main thread, and on two cores Chrome's other processes and the server compete with it.
Measured with the earlier check on one machine and one build, pinning Chrome and the server
to a number of cores:

| Cores given to Chrome and the server | TBT, median per arm |
|---|---|
| 12 | 0 ms, 0 ms |
| 4 | 10 ms, 0 ms |
| 2 | 109 ms, 122 ms |

Lighthouse asks for dedicated cores, recommends four and calls free CI environments
volatile (its `docs/variability.md`). Below four the check prints and stores the number and
does not judge it. Every other budget is judged on every push. This repository's CI runner
has four cores, so blocking time is judged there too. On a two-core host a regression in
blocking time would not fail the check: it is caught where it is judged, and in the field
by INP. Lighthouse sometimes fails to audit a run at all (`NO_NAVSTART`, cause not
established): such a run is repeated up to three times and counted in the output, never
passed.

## Core Web Vitals

| Metric | Budget | Local Workers runtime | CI, four-core runner | Deployed on Cloudflare |
|---|---|---|---|---|
| LCP | ≤ 2.0 s | 1.17 s, 1.18 s | 1.17 s, 1.19 s | 1.10 s, 1.04 s |
| CLS | ≤ 0.05 | under 0.001 | 0.001 | under 0.001 |
| TBT (lab stand-in for INP) | ≤ 150 ms | 0 ms | 1 ms, 10 ms | 0 ms |
| Performance score | ≥ 95 | 100 | 100 | 100 |
| Accessibility | 100 | 100 | 100 | 100 |
| Best practices | 100 | 100 | 100 | 100 |
| SEO | 100 | 66: `noindex` | 100, on a second build with indexing on | 69: the demo ships `noindex` on purpose |

Where a cell has two values they are the `cta_button` and the `inline_email` arm. Local and
deployed: this machine (12 cores, benchmark index about 2800), median of three runs
(`.artifacts/lighthouse/summary.json` and `live/summary.json`, written by the check). CI: run 44655382182 on commit `0c993dd` (benchmark index about 2700), median of five,
and of three for the indexable build. On the deployment the page is 15 requests and
184 KiB, none to another origin. The root document's first byte, from one location over one
day, took between 30 and 320 ms.

**Field data: none yet.** No real visitor has seen the page. The targets are p75 LCP ≤ 2.5 s,
INP ≤ 200 ms and CLS ≤ 0.1, and the page reports all three through the `web_vitals` event,
split by device class and experiment arm, so the first week of traffic answers what the lab
cannot: interaction latency on real phones. For scale, FX Replay's own homepage is at 3.3 s
LCP and 300 ms INP at p75 on phones (Chrome UX Report, `docs/research/brief.md`, section 5.5).

## The decisions behind the numbers

| Decision | Effect |
|---|---|
| Every arm of the page is a prerendered document | Nothing is rendered per request. Time to first byte is the asset store's |
| The largest element is text | LCP does not wait for an image. The hero illustration is inline SVG: no request, no decode |
| CSS travels in the HTML | No render-blocking request. The HTML, with every illustration inline, is 17 KB with brotli and 19 KB on the wire to Chrome, which is sent zstd |
| Fonts are self-hosted: two families, six files, 111 KB, four of them (64 KB) on a first view | Only the headline weight is preloaded: the headline settles into its face about 100 ms sooner. It does not move LCP, which is body text painted first in the fallback face. The fallbacks are metric-matched to Arial. Android ships no Arial and falls back to its own sans-serif unadjusted: measured with such a fallback at 360 px, CLS stayed at 0.0001, because the lines above the fold break in the same places |
| One island | 87 KB of script, compressed, all of it deferred: the island's 79 KB, and 8 KB of plain script for the page, the tracker and the playable illustration. Nothing blocks the first paint |
| No third-party script | The analytics tracker is 2.6 KB of our own code posting to our own origin ([ADR 0014](decisions/0014-first-party-event-collector.md)) |
| The form reserves the space for its error message | A validation error does not move the page |
| Motion is opacity and transform only, and off under `prefers-reduced-motion` | No layout work in the animation |

**JavaScript execution.** The island is React, 66 KB of the 79. Preact was built and measured
first at 25 KB in total, with identical lab scores, and React was kept as the team's own stack
([ADR 0017](decisions/0017-react-for-the-island.md)). The cost is known and it is the first
thing to revisit if field INP is poor on low-end phones.

**Third-party scripts.** None. When marketing needs ad pixels, they would load after
consent, off the critical path, with the Lighthouse budgets in CI as the limit they have to
fit inside.

## SEO

- **Metadata:** title, description, canonical, Open Graph and Twitter tags, a generated share
  image, the theme color.
- **Semantic structure:** one `h1`, a heading per section, `header`, `main` and `footer`
  landmarks, labelled sections, a list of steps as a list, the FAQ as native `details`.
- **Technical:** both arms declare the same canonical URL, so an experiment never creates a
  duplicate page. Internal pages (form outcomes, problem pages) are never indexable.
- **Structured data:** one entity that is both a `WebPage` and a `FAQPage`, built from the
  same list the FAQ renders. Google shows FAQ rich results only for government and health
  sites, so it is there for meaning, not for a richer listing.
- **Title and description** fit a search result whole: 35 and 105 characters.
- **Indexing is off by default** behind `ALLOW_INDEXING`, because the page carries another
  company's brand ([ADR 0009](decisions/0009-demo-carrying-a-third-party-brand.md)). With the
  flag on, the SEO audit scores 100: CI builds a second time with it on and judges it on
  every push (`ALLOW_INDEXING=true npm run preview`, then `npm run lighthouse -- --seo`).
- Not done: the project ships no `sitemap.xml` or `robots.txt`. One page does not need the
  first, and the second would only matter once indexing is on. (On the deployment the host
  answers `/robots.txt` with a file of its own: comments, no directives.)

## Accessibility

Target: WCAG 2.2 AA.

- **Checked by machine, in CI:** axe runs inside the end-to-end tests on both arms, on desktop
  and phone, in the resting state, with a validation error showing, on the profile step, on
  the final state and on every outcome page. The contrast of every color pair the interface
  uses is computed from the tokens (`npm run check:contrast`, 27 pairs). A browser test
  holds the page to its width at 320, 360 and 768 px: no sideways scroll (WCAG 1.4.10).
- **Forms:** a visible label, an error that is text plus an icon plus a border (never color
  alone), `aria-invalid`, the message tied to the field, focus moved to the field on a failed
  submit and to the heading when the step changes.
- **The button is never disabled.** While a request is in flight its label says so, a status
  region announces "Creating your account…" to a screen reader whose focus is in the field,
  and a second press is ignored.
- **Keyboard:** a skip link that shows above the header, a visible focus ring with an
  offset, native controls but for the profile step's options, which are drawn from the kit's
  colors and fall back to the browser's own under forced colors. What takes focus stops below the header that stays on
  screen (`scroll-padding-top`), and browser tests hold both.
- **Targets:** the form's controls are 52 px tall, the header's call to action and the
  illustration's keys 44 px.
- **Motion** stops under `prefers-reduced-motion`. The hero illustration has a text
  alternative that says what it shows.
- **Without JavaScript** the signup still works.
- Fixes the kit needed are in `docs/brand-notes.md`: field borders, link color and the
  focus ring are one step lighter than the kit's tokens to reach their thresholds.
- Not done: a pass with a screen reader by a person.

## Rendering strategy

Static first. The page is built once per experiment arm. At `/` a Worker reads the visitor's
cookie, hashes it to an arm and streams that arm's document from the asset store
(`src/server/landing.ts`). Only the API and that decision run code. Server rendering per
request was rejected: it would spend the Worker's CPU budget on HTML that never changes.

## Caching and CDN

| What | Cache-Control | Why |
|---|---|---|
| `/_astro/*` (scripts, fonts, images) | `public, max-age=31536000, immutable` | File names carry a content hash |
| Prerendered pages | `public, max-age=0, must-revalidate` | Always current. On this host their HTML carries no validator, so a repeat view downloads the document again: 17 to 19 KB, by the compression the browser takes |
| `/` | `private, no-cache`, `Vary: Cookie` | Decided per visitor. The same holds: no validator reaches the browser, so a repeat view is the same 17 to 19 KB |
| The API | `no-store` | Personal data and one-time answers |

Everything is served from Cloudflare's edge. The one compromise is `/`: because the arm is
chosen per visitor, no shared cache holds the landing document. The production fix is a
cache key that includes the arm.

HTML leaves this host compressed and without an `ETag`, so a repeat view is never a 304.
An `ETag` set by the Worker survived only with `no-transform`, which switched compression
off: 55 KB in place of 15 KB, the page's size at the time (curl against the deployment,
2026-11-19). Compression was
kept.

## Production risks

1. **Interaction on low-end phones** is unmeasured until field data exists. Watch INP by
   device class in the first week.
2. **The landing document is not shared-cached** (above). At scale every view is a Worker
   request: fine on a paid plan, and the first limit to hit on the free one, together with
   event batches.
3. **Third-party scripts.** The numbers above hold because there are none. The day a tag
   manager arrives is the day the budgets in CI earn their keep.
4. **Rate limits are per client address,** so visitors behind one carrier address share
   them. A signup wave from one mobile network could see "too many attempts".
5. **One write region for the database.** Signups from far away pay the round trip. The
   client's timeout and safe retry cover the slow tail.
6. **Experiment weight.** Each new arm is a full prerendered page, and a heavier variant can
   win on conversion while losing on speed. The Web Vitals guardrail in the experiment plan
   exists for that.
