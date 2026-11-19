# Performance review

Measured on 2026-11-19 with Lighthouse 13.6, mobile profile with simulated throttling, median
of three runs per experiment arm (`npm run lighthouse`). The same command runs in CI on every
push, with five runs, and fails the build when a budget is missed.

**The CPU slowdown is calibrated to the machine that runs the check.** Lighthouse's default
4x turns a high-end desktop into a mid-tier phone and, by its own documentation, needs
calibrating anywhere else. On a fixed 4x the same commit measured a total blocking time of
173 ms and of 36 ms on two of GitHub's shared runners, and 0 ms on a fast laptop: the number
was the host's, not the page's. The check now reads the host's benchmark in a first, unjudged
run and scales the slowdown by it (4x at a benchmark of 1750, the middle of Lighthouse's
"high-end desktop" bracket), so every host simulates the same phone. On the machine these
numbers come from, that is 6.4x: harder than the default, not easier.

## Core Web Vitals

| Metric | Budget | Local Workers runtime | Deployed on Cloudflare |
|---|---|---|---|
| LCP | ≤ 2.0 s | 1.18 s | 1.17 s |
| CLS | ≤ 0.05 | 0.001 | 0.001 |
| TBT (lab stand-in for INP) | ≤ 150 ms | 0 ms | 0 ms |
| Performance score | ≥ 95 | 100 | 100 |
| Accessibility | 100 | 100 | 100 |
| Best practices | 100 | 100 | 100 |
| SEO | 100 | 100, on a build with indexing on | 69: the demo ships `noindex` on purpose |

Both arms measure the same within a few milliseconds. On the deployment the page is 14
requests and 184 KiB. The root document's first byte, from one location over one day, took
between 30 and 320 ms.

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
| CSS travels in the HTML | No render-blocking request. The HTML, with every illustration inline, is 21 KB compressed |
| Fonts are self-hosted: two families, six files, 112 KB | Only the headline weight is preloaded: the headline settles into its face about 100 ms sooner. It does not move LCP, which is body text painted first in the fallback face. The fallbacks are metric-matched to Arial. Android ships no Arial and falls back to its own sans-serif unadjusted: measured with such a fallback at 360 px, CLS stayed at 0.0001, because the lines above the fold break in the same places |
| One island | 90 KB of script, compressed, all of it deferred: the island's 82 KB, and 8 KB of plain script for the tracker and the playable illustration. Nothing blocks the first paint |
| No third-party script | The analytics tracker is 2.4 KB of our own code posting to our own origin ([ADR 0014](decisions/0014-first-party-event-collector.md)) |
| The form reserves the space for its error message | A validation error does not move the page |
| Motion is opacity and transform only, and off under `prefers-reduced-motion` | No layout work in the animation |

**JavaScript execution.** The island is React, 66 KB of the 82. Preact was built and measured
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
- **Title and description** fit a search result whole: 35 and 153 characters.
- **Indexing is off by default** behind `ALLOW_INDEXING`, because the page carries another
  company's brand ([ADR 0009](decisions/0009-demo-carrying-a-third-party-brand.md)). With the
  flag on, the SEO audit scores 100.
- Not done: the project ships no `sitemap.xml` or `robots.txt`. One page does not need the
  first, and the second would only matter once indexing is on. (On the deployment the host
  answers `/robots.txt` with a file of its own: comments, no directives.)

## Accessibility

Target: WCAG 2.2 AA.

- **Checked by machine, in CI:** axe runs inside the end-to-end tests on both arms, on desktop
  and phone, in the resting state, with a validation error showing, on the profile step, on
  the final state and on every outcome page. The contrast of every color pair the interface
  uses is computed from the tokens (`npm run check:contrast`, 18 pairs).
- **Forms:** a visible label, an error that is text plus an icon plus a border (never color
  alone), `aria-invalid`, the message tied to the field, focus moved to the field on a failed
  submit and to the heading when the step changes.
- **The button is never disabled.** While a request is in flight its label says so, a status
  region announces "Creating your account…" to a screen reader whose focus is in the field,
  and a second press is ignored.
- **Keyboard:** a skip link, a visible focus ring with an offset, native controls throughout.
- **Targets:** controls are 52 px tall.
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
| Prerendered pages | `public, max-age=0, must-revalidate` | Always current. On this host their HTML carries no validator, so a repeat view downloads the document again: 21 KB at most |
| `/` | `private, no-cache`, `Vary: Cookie` | Decided per visitor. The same holds: no validator reaches the browser, so a repeat view is 21 KB |
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
