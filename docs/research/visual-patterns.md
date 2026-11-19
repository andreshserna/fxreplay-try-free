# Visual patterns in the category

What the pages traders already know do visually and in interaction, read from their rendered
pages. It complements `brief.md` (voice, claims, offer, funnel) and does not repeat it.

- **When and how.** All pages read on 2026-11-19 in Chrome through the chrome-devtools tools, in
  an isolated browser context, at 1440 × 900 and at 360 × 780 (DPR 2, mobile, touch). Sizes are
  computed styles read by a small script run in each page. Nothing was
  submitted, no account was created and no cookies were accepted. Edgewonk's banner was declined;
  the others offer no decline button, so their banners were hidden in the local DOM for the
  full-page captures and left visible in the hero captures.
- **Screenshots.** In `.artifacts/research/visual/` (gitignored), `NN-site-page-width-{hero,full}.jpeg`.
- **The sites.** Forex Tester stopped the browser at a Cloudflare "Verify you are human" check
  (`04-forextester-home-1440-blocked.jpeg`). That check was not attempted, and the site is
  missing from every count below. Two more products were added:
  - **TradingSim**, the most direct market-replay competitor: its logo reads "#1 Market Replay
    Platform", and its homepage assets sit in a folder named `delux-homepage-2026-10-17`, so the
    page is a month old.
  - **Edgewonk**, a trading journal that has run for years ("For over 10 years"). Its hero and
    stats row are the closest match to ours.

  Neither product's commercial success was verified.
- Black Friday promotions were live on TradeZella and Edgewonk and changed their first screen.

## 1. Site by site

URLs: our page https://fxreplay-try-free.mauricioserna123.workers.dev/; https://fxreplay.com/;
https://fxreplay.com/campaigns/futures; https://www.tradingview.com/; https://www.tradezella.com/;
https://www.tradingsim.com/; https://edgewonk.com/. All read on 2026-11-19.

| Site | Imagery | Hero | Section openers | Numbers and proof | Features / how it works | Motion and interaction | Type and density | Color |
|---|---|---|---|---|---|---|---|---|
| **Ours** (`00-*`) | One original SVG chart illustration. No product UI, photos or logos | Split at 1440: text on the left, a playable candle chart with a playhead and play/step/speed controls on the right. At 360 the chart starts at y≈520 of 780, so about a third of it shows. CTA "Start for free", then three dotted points: "Free plan · No credit card · No time limit" | Blue uppercase label (16px, letter-spacing 1.6px) above **all 5** H2s and above the H1 | Three numbers under the hero (44px, weight 900, same weight as the H1): 1M+, 173, 2003. No logos, ratings or testimonials | Three equal boxes with numbered badges 1-2-3 (32px squares), icon-free, text only | Playable hero; `<details>` FAQ (6); smooth scrolling; sticky chart at 1440 only; **nothing sticky at 360** | H1 72px/900 (38px at 360). Smallest text 16px. Text takes most of the first phone screen | Near-black (#030303), one blue, 3 gradients |
| **FX Replay home** (`01-*`) | **Real product UI everywhere**: hero workspace (1148 × 687), five 910px feature panels, a feature grid of UI fragments. People only as **named traders** in video testimonials | Centered H1 over a blue radial glow, white pill CTA "Get started for free", nothing under it. The full app workspace sits below, animated, with a "Pause hero animation" button. At 360 the UI starts at y≈352; the cookie notice covers the lower third | Small **sentence-case pill chips**, not uppercase ("The plan", "All features", "Real experiences", "Evidence over win rate"), 13px white, on 4 of 6 main sections; none on the FAQ | **No stats row.** "1M+" appears only in the meta description and the FAQ. Proof is three video testimonials with names | Stacked panels: pill label, a question as heading, one large UI image, two sub-features with icons. A sticky right rail keeps a CTA in view. Then an uneven grid of 5 cards, each a UI fragment. No numbered steps | Animated hero with pause; sticky CTA rail (1440); **fixed header with "Try for free" on mobile**; tabs; 7 accordions; canvas dot-field behind the closing CTA; smooth scrolling | H1 56px/700 with gradient fill (28px at 360). Content text 13–16px; legal 11px | Black, blue glow behind hero and closing band, gradient-filled headings |
| **FX Replay campaign** (`02-*`) | UI screenshots (604px rows), stock-ticker logos, **illustrated animal avatars** on Trustpilot quotes | Centered: wordmark, H1 86px, sub, blue CTA "Backtest Now", then "Start for free. No credit card required." in small type. Blue glow. No visual in the first phone screen | **Uppercase** thin off-white labels (14px, 1px spacing) on 4 of 5 content H2s and on the feature rows ("ASSETS", "PRICING", "WHY CHOOSE FX REPLAY", "TRAIN LIKE IT'S LIVE"); none on testimonials | No stats row. Trustpilot widget (4.1, 659) above a wall of dated quotes | Tabs (Journal / Prop firm / Mentor AI / Script), asset tabs, then alternating image-and-text cards | Tabs (14), sticky stacked cards, fixed header | Body 17px (14.4px at 360) | Black with a blue glow |
| **TradingView** (`03-*`) | **Autoplay muted video** of the Earth with chart lines (hero), a product video of the charts, live market widgets. No people seen | Centered H1 80px/600, sub, white CTA with a slanted corner "Get started for free", then "$0 forever, no credit card needed" (13px). Full-bleed video | **None** | No row. "Join 100 million traders" is the sub-headline sentence | After a dark product-video band, the homepage becomes a light market portal: live charts and lists, no feature steps | Autoplay intro video, then a looping one; a pinned 900px section; sticky header | Body 16px, legal 12px | Dark hero, then white |
| **TradeZella** (`05-*`) | Composite product screenshots with floating UI cards (hero 681 × 727), an autoplay product video, **named creators** in vertical video reels, illustrated avatars in a network graphic | Split: H1 80px/600 left, UI composite right; dark pill CTA "Get Started" with a **Trustpilot widget beside it**; 8 tool chips under it. At 360 the visual starts at y≈710, behind a promo bar | **Uppercase** violet labels (12–18px, 2px spacing) on 5 of 11 H2s at 1440 and 9 of 11 at 360; sections 1–6 also carry **180px faint numerals**; some openers are a dot plus sentence case ("• All your tools") | **Stats row under the hero**: 20.2B / 100K+ / 500+ / 4.8★ at **32px weight 600, muted grey**, each followed inline by a 14px caption, between hairlines, then a broker-logo strip. A second row of 80px numbers in cards further down | Tabbed product panels (text left, UI right); a carousel of 3 equal cards, **each holding a mini chat UI**; gradient cards with UI fragments; Backtest/Replay/Improve tabs over a full-width screenshot. No step badges | Fixed promo bar and nav; autoplay looping video; carousels; tabs (9); Webflow interactions (23 triggers) | Body 16–20px; smallest 14px card body, 10–12px labels | **Light** (white, lavender wash); purple-to-pink gradient on key words and CTAs; dark bands for AI sections |
| **TradingSim** (`06-*`) | **Real product UI** (hero 729 × 417 with caption "View full size"), a GIF of a bar-by-bar trade review, expert video embeds, partner logos. **One staged photo of an unnamed man at an iMac** (alt "Trading educator recording a TradingSim lesson at an iMac") in the **affiliate** section | Split on deep navy: teal uppercase label "TRADINGSIM DELUX · MARKET REPLAY SIMULATOR", H1 40px/700, sub, teal CTA "Start Your Free Trial" plus a text link; three check items under a hairline | **Uppercase** teal labels (12px, 1.8px spacing) on 7 of 11, **numbered as a sequence**: "01 / PLACE & MANAGE" … "04 / LEARN FROM THE SESSION" | Stats as a raster collage of tilted tiles (50k / 100M+ / ★4.8/5) beside two partner logos, under two expert videos | **Alternating rows**: 652px or 478px screenshot, H2, one sentence, 3 bold-led bullets, one text link. One 3-up row of 379px screenshots. Some rows have tabs over the image | GIF, tabs (16), sticky header, an in-page section nav, back-to-top | H1 40px; body 15–17px; captions 12px (10px at 360) | Navy hero, white body, teal CTA, purple frames around screenshots |
| **Edgewonk** (`07-*`) | Product UI composites (hero 710 × 631, rows of 618 and 648px), broker logos, icons8 icons. **No photos of people** | Split: H1 40px with green accent words, sub, green CTA. At 360 a Black Friday card fills the first screen and the H1 starts at y≈711 | **None** on product sections (only "LIMITED TIME OFFER" in the promo) | **Stats row under the hero**: 8M+ / 10+ years / 200+ / 4.7/5★ at **30px green**, centered, with 20px captions. Text testimonials with first names and a results disclaimer | **Three equal cards with icons** for trader stages (losing / break-even / profitable), then **alternating rows** of large UI images with checklists | Logo carousel (tabs), back-to-top; no video | Body 18px; smallest 12–12.5px | Light, green accent, a dark-green promo card |

## 2. What the category does

Counted over the five sites that rendered: FX Replay (home and campaign counted as one site),
TradingView, TradeZella, TradingSim and Edgewonk.

- **The product's own interface is the main image, 5 of 5.** FX Replay, TradeZella, TradingSim and
  Edgewonk use screenshots or composites of the UI; TradingView uses a video of its charts. It is
  the hero visual on 4 of 5 (TradingView leads with the Earth video).
- **A visual, not just text, reaches the first phone screen on 3 of 5:** FX Replay's UI at y≈352,
  TradingView's Earth video at y≈450, TradingSim's UI at y≈604. On TradeZella and Edgewonk a
  promotion pushes it out.
- **Features are shown as pictures of the product, never as text boxes, 5 of 5.** In practice that
  means alternating rows (TradingSim, Edgewonk, FX Replay campaign), tabbed panels (TradeZella,
  FX Replay campaign) or stacked panels (FX Replay home).
- **No numbered badges in small boxes for steps, 0 of 5.** Where a sequence is shown, the number
  belongs to the section: "01 /" in the label (TradingSim) or a 180px faint numeral (TradeZella).
- **An uppercase label above some headings, 3 of 5** (FX Replay campaign, TradeZella, TradingSim).
  No site puts one on every section. FX Replay's home uses sentence-case chips instead.
  TradingView and Edgewonk use none.
- **A rating or a count shows near the top on 4 of 5** (TradingView in its sub-headline,
  TradeZella's Trustpilot widget beside the CTA, the stats rows of TradeZella and Edgewonk,
  TradingSim's tiles). Stats rows: 3 of 5, always lighter than the H1.
- **People appear in video testimonials, 3 of 5.** FX Replay and TradeZella name them; on
  TradingSim the names were not checked. Stock photography of people: 1 image on 1 site
  (section 4).
- **The header or a rail keeps a CTA in view, 4 of 5** (FX Replay fixed header and sticky rail,
  TradeZella fixed nav, TradingSim sticky header, TradingView sticky header).
- **Motion comes from the product, not decoration, 4 of 5:** an animated workspace (FX Replay),
  video (TradingView, TradeZella), a GIF of a replay (TradingSim).
- Below the three-site bar: a risk-reversal line directly under the CTA appears on 2 of 5
  (TradingView's "$0 forever, no credit card needed", 13px; FX Replay campaign's "Start for free.
  No credit card required."). TradeZella puts a Trustpilot widget beside its CTA instead.
- **Dark is not the category norm: 3 of 5 are light** (TradeZella, TradingSim, Edgewonk), and
  TradingView turns light after its hero. FX Replay is the dark one, so our dark page follows the
  brand, not the category.

## 3. The three complaints, against the evidence

**1. A blue uppercase label above every heading. The complaint holds, but the problem is the
uniformity, not the label.** Three of five use uppercase labels; none uses one on every section,
and four of five put none above the H1 (TradingSim alone has one there). Ours runs on all five
H2s and the H1, in the same blue, and mostly restates the heading ("How a session works" over
the heading about a session). How the others avoid that look:

- TradingSim makes the label carry information: "01 / PLACE & MANAGE", in teal, 12px, only on the
  numbered feature rows.
- FX Replay's home turns it into a 13px sentence-case pill chip in white, the same chip style used
  inside the product panels.
- TradeZella mixes three forms (uppercase, dot plus sentence case, a 180px numeral).

To design from: remove the label above the H1 and above the FAQ and closing sections. Keep it
only where it numbers the steps or names the plan, and use FX Replay's chip style rather than
coloured uppercase.

**2. A row of three big numbers under the hero. The complaint holds, in its execution.** Stats
rows exist (TradeZella, Edgewonk, TradingSim), but every one is quieter than ours:

- TradeZella: 32px weight 600 in muted grey, captions of 2–3 words inline at 14px, between
  hairlines, followed by a logo strip.
- Edgewonk: 30px, captions of 2–4 words.

Ours is 44px at weight 900, the H1's weight, with two-line captions. One of its numbers, "2003",
is a year and not a measure. FX Replay itself shows no stats row, and TradingView puts its number
inside the sub-headline. Every other row includes a rating or an integration count. We cannot
show a rating (brief section 9: the Trustpilot page was not read).

To design from: either fold the claims into one proof line under the CTA ("Used by 1M+ traders,
by FX Replay's count · 173 markets on the free plan"), or keep a hairline band at about 28–32px,
weight 600, muted, with one-line captions. Drop "2003" as a number; it fits better as a fact in
the plan table.

**3. Three identical boxes with numbered badges for "how it works". The complaint holds.** No
site does this. Equal three-card rows do exist, but each card holds a picture of the product:

- TradeZella's agent cards: a mini chat UI in each.
- TradingSim's 3-up row: 379px screenshots.
- FX Replay's feature grid: a UI fragment per card.

The one text-and-icon trio, Edgewonk's, is a picker for the reader's stage, not a process.

To design from: one row per step, alternating sides, as TradingSim does. Each row shows the part
of the interface that step uses, at roughly 480–650px wide on desktop and full width on a phone,
next to an H3, one sentence and up to three short bullets:

- Replay: the hero chart stepping forward.
- Trade: an order with stop and target drawn on the chart.
- Review: a journal row with the result.

If numbers stay, put them in the label ("01 / Replay"), not in a badge.

**What the critique praised holds too.** A playable chart is the category's main move (motion
from the product). Heavy headlines are common: 80px at weight 600 on TradeZella and TradingView,
86px on the FX Replay campaign. A plain spec table has no equal on these pages; the closest is
FX Replay's own plan cards.

## 4. Stock photos

**Not used for the pitch in this category.** Of five sites, one shows a stock-looking photo:
TradingSim, a staged man at an iMac, placed in its affiliate section near the footer, not in the
pitch to traders. Whether it is stock or generated was not established. The people who appear
elsewhere are named traders and creators in video testimonials (FX Replay, TradeZella, TradingSim)
or illustrations (TradeZella's avatars, the animal avatars on FX Replay's campaign page).
Edgewonk and TradingView show no people.

**Recommendation: do not add stock photos.** In this category a face stands for a real, named
trader. An anonymous model would read as filler and work against "the record must be true". We
also have no named traders we may show: FX Replay's testimonial faces are not ours to reuse (brief
section 6). Spend the space on the interface instead.

## 5. Five changes, ranked for a trader arriving from an ad on a phone

1. **Bring a product-looking visual into the first phone screen.** At 360 our chart starts at
   y≈520. FX Replay shows its UI at y≈352 and TradingSim at y≈604; TradingView shows its video at
   y≈450. Remove
   the hero label, tighten the sub-headline on mobile, and bring the chart's top to about y≈400.
   Give the illustration the cues of the real workspace: a symbol and timeframe bar, Buy and Sell,
   a simulated position with stop and target. FX Replay's hero is the full app workspace with a
   blue glow behind it, and a CSS radial gradient gives us the same atmosphere. Do not use their
   assets: the brief found no licence, and their hero shows a Pro-only futures chart.
   *Performance:* inline SVG and CSS cost no request. Reserve the chart's aspect ratio so CLS stays
   at 0. Keep the H1 the likely LCP element. Avoid Lottie or video: FX Replay's Lottie hero sits on
   a homepage of about 734,000 characters of HTML whose phone LCP is 3.3 s at p75 (brief 5.5).
2. **Keep a CTA in view on mobile.** At 360 nothing on our page is sticky. FX Replay's own phone
   header keeps "Try for free" fixed at the top (57px), and 4 of 5 sites keep a header or rail in
   view. A slim sticky header (logo plus "Start for free") matches the brand's own pattern.
   *Performance:* CSS `position: sticky`, no JavaScript. Present from the first paint, so there is
   no shift. Add `scroll-margin-top` so anchors to the form are not hidden under it.
3. **Turn "how it works" into three alternating rows, one interface picture per step** (section 3,
   complaint 3). This is the evidence-backed fix for the "template" reading.
   *Performance:* below the fold. As inline SVG, no requests. As raster, use width and height,
   `loading="lazy"` and AVIF. Neither affects LCP. `content-visibility: auto` can keep render
   cost down.
4. **Demote the stats row to a proof line or a light hairline band; drop "2003"** (complaint 2).
   *Performance:* neutral to positive (less DOM).
5. **Cut the labels to the few that add information,** in FX Replay's chip style or as a step
   number, none above the H1 (complaint 1).
   *Performance:* none.

Keep as they are, with evidence: the risk-reversal line under the button (TradingView, FX Replay
campaign); 16px as the smallest text (the category goes down to 10–14px, so ours reads better on
a phone); the dark theme (FX Replay's brand, even though the category is mostly light).

## 6. Could not verify

- **Forex Tester:** blocked by a Cloudflare check, not rendered.
- **Hover states.** FX Replay's feature cards carry a hidden "Try now" button (opacity 0). A
  synthetic hover on one card did not reveal it, so the trigger is unknown.
- **Scroll-reveal animations** were checked only on FX Replay and TradeZella. Neither hides content
  below the fold before scroll; TradeZella has 23 Webflow interaction triggers whose effects were
  not traced. Whether FX Replay's closing-band canvas animates is unknown.
- **Truncated full-page captures.** TradingView at both widths and the FX Replay campaign at 360
  run past Chrome's 16,384px capture limit and are cut off. The 360 full-page captures were taken
  at DPR 1 for that reason; the hero captures are at DPR 2.
- **Whether TradingSim's photo is stock or generated,** and whether its expert videos show named
  people: the embeds were not played.
- **Competitors' field or lab performance:** not measured.
- **The success of TradingSim and Edgewonk:** chosen for relevance, not for verified results.
- **Rendering is emulated Chrome on one machine.** Real phones, other countries, and pages without
  the current Black Friday promotions may render differently.
