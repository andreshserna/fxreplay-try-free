# Research brief: FX Replay "Try FX Replay Free"

Researched on 2026-11-18 (evening, UTC-5; their servers stamped the first response 2026-11-19
02:23 UTC). Every fact below was read in that session unless it says otherwise.

How to read it:

- `verified` = seen at the source in this session. `reported` = a third party says so.
  `unknown` = could not be established.
- Seen from desktop Chrome with a Colombian IP address, plus an emulated 390 px phone. Their site
  localizes prices by country, so each price says where it was read.
- No form was submitted, no account was created, nothing was typed into any site. Research
  stopped at the first signup screen. Steps after it come from their help center and from the
  public JavaScript bundle of their app, and are labelled "read in the bundle, not seen".
- No page contained instructions addressed to automated readers. Trustpilot's own site refused
  automated access; that was respected (see section 9).

## 1. Summary

1. **Lead with the Beginner plan.** Their words: "no credit card required, no trial period, and
   no automatic conversion to a paid plan." Three of their pages agree on this.
2. **Never put "no card" next to "trial".** The pricing FAQ says the trial needs no card; three
   help-center passages say the 5-day trial needs a payment method and converts automatically.
3. **State the limits; they are tighter than the pricing card shows:** 2 sessions in total (not
   per month), 1 month of history per session, 50 trades per session, 1 indicator, 1 chart, and
   sessions disappear from the list after 1 week (hidden, not deleted).
4. **The free plan has no futures.** Do not show a futures chart (their own hero shows MNQ) and
   do not promise seconds data, multi-chart, rewind or the Monte Carlo simulator. Free covers
   forex, indices, metals and part of crypto. Prop Firm Simulator on free: `unknown`.
5. **Voice:** second person, short sentences, proof over hype, headings written as the trader's
   own doubt ("Is your edge real, or a lucky streak?", "Test it before you trust it.",
   "Confidence comes from proof, not guesswork."). Verbs: replay, test, review, refine.
6. **CTA and risk reversal as they write them:** "Get started for free" (hero), "Start for free"
   (plan card), "Try for free" (phone header). Their campaign pages put "Start for free. No
   credit card required." directly under the button; their homepage hero does not.
7. **Do not print dollar prices.** Prices are set per country (we were shown COP). "Free" is the
   only price every visitor sees the same.
8. **Their signup is already email-first, but the email does not create the account:** email,
   then username and password, then a plan choice behind a captcha, then email verification.
   The signup screen never repeats the offer. Creating the account on the email alone, and
   keeping the offer visible through the form, are both real changes.
9. **Social proof that is real:** Trustpilot 4.1 ("Great"), 659 reviews, read from Trustpilot's
   widget data on their own page. Not 4.2 to 4.3. Their own claim is "Trusted by 1M+ traders."
10. **Their marketing site moved from Webflow to Astro 6 with React islands on 2026-10-04**, the
    stack the job post names. On phones the homepage still misses the field targets (LCP 3.3 s,
    INP 300 ms at p75), and about three of four homepage loads are desktop. A promotion runs
    from 2026-11-18 to 2026-11-29, so this fortnight is not a baseline.

## 2. Claims we may use

Strict: each row quotes the source. All read on 2026-11-18. A date in the source column is the
date their page gives for itself.

| # | Claim | Exact wording at the source | Source | Status |
|---|---|---|---|---|
| 1 | The free plan needs no card and does not expire | "FX Replay's free plan is genuinely free — no credit card required, no trial period, and no automatic conversion to a paid plan. You keep access to core backtesting features indefinitely." | https://fxreplay.com/pricing, FAQ | verified |
| 2 | Same, second source | "Yes. There's a free plan that requires no credit card and never expires." | https://fxreplay.com/, FAQ | verified |
| 3 | Same, help center | "You can start on the Beginner plan, which is completely free with no credit card required." | https://support.fxreplay.com/articles/what-is-fx-replay ("Updated October 7, 2026") | verified |
| 4 | No payment data for free | "Does the Free plan require a payment method? No. Free plans are billed $0 and require no payment information." | https://support.fxreplay.com/faqs | verified |
| 5 | The plan's name and price | "Beginner", "Free", "Free for everyone" | https://fxreplay.com/pricing, plan card | verified |
| 6 | Limits on the card | "2 backtesting sessions", "1 indicator", "1 week data retention" | same | verified |
| 7 | Limits in the table | "Trades per session: 50", "Max session duration: 1 month", "Go to feature: 3 times per hour", "Multichart: —" | https://fxreplay.com/pricing, "Compare every plan" | verified |
| 8 | Sessions are a total, not an allowance | "the session limit counts every session on your account. It doesn't reset when your subscription renews. To create more, delete old sessions or upgrade." | https://support.fxreplay.com/articles/what-are-the-differences-between-fx-replay-plans-and-their-pricing ("Updated November 16, 2026") | verified |
| 9 | Old sessions are hidden, not deleted | "Older sessions aren't deleted. They're hidden from your list, and upgrading to a plan that covers their date shows them again." | same | verified |
| 10 | What the product is | "FX Replay is a browser-based platform for backtesting and practising trading on real historical market data. Replay the market candle by candle, place simulated trades and review your results, all without risking real money." | https://support.fxreplay.com/articles/what-is-fx-replay | verified |
| 11 | A plain metaphor they use | "Think of it as a flight simulator for trading: repeat market conditions as often as you like and learn faster than waiting for setups in the live market." | same | verified |
| 12 | Who it is for | "New to trading: Learn to read charts and build your first strategy"; "An experienced trader: Test and refine a strategy before trading it live"; "Preparing for a prop firm challenge: Practise under real challenge rules" | same | verified (the third is about the product, not the free plan: see 3.1) |
| 13 | No coding | "No. FX Replay is designed for manual traders with no coding required." | https://fxreplay.com/, FAQ | verified |
| 14 | Forex is on the free plan | Asset data shipped with the page: `"ticker":"EURUSD"`, `"category":"Forex"`, `"availableTiers":["Pro","Intermediate","Beginner"]`, `"dataAvailability":"From 2003 to present"`. Visible column "PLAN AVAILABILITY" reads "Beginner" or "Pro only"; page total "Showing 310 of 310 assets" | https://fxreplay.com/markets | verified |
| 15 | Futures are not on the free plan | "Futures & CME data, seconds data and custom timeframes are available on Pro only." | help-center plans article (row 8) | verified |
| 16 | It is not a broker | "FX Replay is not a broker, does not execute real trades, does not facilitate live trading, and does not handle client funds." | Footer of https://fxreplay.com/ | verified |
| 17 | Charts | "Charting powered by TradingView lets you track economic events, monitor live prices, and more." | https://fxreplay.com/ | verified |
| 18 | Their reach, in their words | "Trusted by 1M+ traders." (meta description) and "Over 1 million traders have used it to accelerate their development before going live." (FAQ) | https://fxreplay.com/ | verified as their claim; no independent figure |
| 19 | Trustpilot | `"trustScore":4.1`, `"starsString":"Great"`, `"numberOfReviews":{"total":659, ... "fiveStars":501, "oneStar":71}` | Trustpilot widget data for FX Replay's TrustBox, loaded by https://fxreplay.com/campaigns/futures | verified at the widget; the Trustpilot page itself was not read |
| 20 | Their risk-reversal line | "Start for free. No credit card required." | https://fxreplay.com/campaigns/futures and /campaigns/backtest, under the CTA | verified |
| 21 | Leaving a paid plan returns you to free | "How do I cancel my subscription? Go to Account Settings → Subscription and select Cancel. Your account will revert to the Free plan." | https://support.fxreplay.com/faqs | verified |
| 22 | Paid plans, for reference only | "Intermediate: $17.99/month or $180/year"; "Pro: $35/month or $350/year"; "Prices are shown in USD. Taxes may apply depending on your location." | help-center plans article (row 8) | verified; regional prices differ (3.2) |
| 23 | The trial, if it is mentioned at all | "Intermediate and Pro both come with a 5-day free trial." and "You'll add a payment method to start the trial, but you won't be charged until the trial ends." | row 8 article; https://support.fxreplay.com/articles/setting-up-your-fx-replay-account ("Updated October 5, 2026") | verified |
| 24 | Text they attach to testimonials | "Testimonials may not reflect typical results and don't guarantee future success." | Footer of every page read | verified |

Derived by us, not their wording (usable only if described as a count): **173 of the 310
assets on their Markets page list "Beginner" under plan availability**: all 97 forex pairs, 31
indices, 13 metals, 7 energy, 6 bonds, 2 agricultural, 12 of 46 crypto, 5 of 88 stocks, and 0 of
20 futures. Counted from the data the page ships (`availableTiers` per asset).

Do not use:

- "no credit card" for the trial (their pages disagree: 3.4).
- "the #1 futures backtesting tool", "increase win rate, boost returns", "Everything you need to
  achieve profitability" (their campaign page): unsupported superlatives and outcome claims.
- "Traders who backtest consistently report identifying their edge [...] within the first 30–50
  trade sessions" (homepage FAQ): an outcome claim with no source.
- "120+ assets across 6 markets": the same page also says "Showing 10 of 310 assets".
- A Trustpilot score of 4.2 or 4.3, the Trustpilot logo or star graphics (terms not read).
- Any dollar price as "the" price.

## 3. The offer as their site states it

### 3.1 The free plan ("Beginner")

The sources are rows 1 to 9 of the table above. Every limit, from "Compare every plan" on
https://fxreplay.com/pricing (`verified`):

| Row | Beginner | Intermediate | Pro |
|---|---|---|---|
| Backtesting sessions | 2 | 10 | Unlimited |
| Indicators | 1 | 3 | Unlimited |
| Max session duration | 1 month | Unlimited | Unlimited |
| Go to feature | 3 times per hour | Unlimited | Unlimited |
| Trades per session | 50 | 200 | Unlimited |
| Data retention | 1 week | 6 months | Unlimited |
| Multichart | — | 2 charts | Unlimited |
| Economic calendar | "1 country, only past news, no past bubbles" | 2 countries | Unlimited |
| Auto break even | — | ✓ | ✓ |
| Rewind price | — | ✓ | ✓ |
| Seconds data | — | — | ✓ |
| Futures and CME data | — | — | ✓ |
| Custom timeframes | — | — | ✓ |
| Analytics dashboard | Limited | Unlimited | Unlimited |
| Strategies | — | 3 | Unlimited |
| Strategy analytics | — | ✓ | ✓ |
| Montecarlo simulator | — | ✓ | ✓ |
| RR simulator | — | ✓ | ✓ |
| Journal | ✓ | ✓ | ✓ |
| Screenshots | 1 | 2 | Unlimited |
| Checklists | 1 | 3 | Unlimited |

What the help center adds ("Plans & Pricing Compared", "Updated November 16, 2026", `verified`):

- "Session duration: how much historical time a single session can cover, not how long you
  spend testing."
- "Up to 6 assets per session, on every plan."
- Two Beginner rows the pricing page lacks: "Stocks: —" and "Live Journal and live-synced
  accounts: —".
- Under "Tools included on Intermediate and Pro": "Replay tools: Replay mode, Rewind, Prop Firm
  Simulator, Scalper mode and testing shortcuts". The pricing table has no row for the Prop Firm
  Simulator and its help article states no plan. **Whether the free plan includes the Prop Firm
  Simulator is `unknown`; this passage suggests it does not.** Describe it as part of the
  product, not as part of the free plan.

**No futures on free.** Pricing table: "Futures and CME data: —" for Beginner and Intermediate.
Markets page: every one of the 20 futures lists `"availableTiers":["Pro"]`. Their homepage title
is "FX Replay | Futures, Forex & Crypto Backtesting Platform" and its hero animation shows the
futures contract MNQ. What free does cover is in the count under the claims table (section 2).

### 3.2 The paid plans and their prices

`verified`. USD figures come from the server-rendered HTML of https://fxreplay.com/pricing (what
the page contains before it localizes) and from the help center.

| Plan | Monthly billing | Yearly billing | Exact wording |
|---|---|---|---|
| Intermediate | $17.99/month | $180/year, shown as "$15 USD /mo", "Save $35.88" | FAQ "How much does FX Replay cost annually?": "On annual billing, Intermediate costs $180/year ($15/month), saving $35.88 compared to monthly billing." |
| Pro ("Best deal") | $35/month | $350/year, shown as "$29.17 USD /mo", "Save $70" | Same FAQ: "Pro costs $350/year ($29.17/month), saving $70 compared to monthly billing. Both plans can also be billed monthly at $17.99 and $35 respectively. The free plan has no cost." |

- The billing toggle opens on "Yearly", which carries the badge "Save up to 17%".
- Card features, Intermediate: "10 backtesting sessions", "200 trades per session", "6 months
  data retention", "3 indicators", "2 charts", "Limited AI queries", "Standard market data".
- Card features, Pro: "Unlimited backtesting sessions", "Unlimited trades per session",
  "Unlimited data retention", "Unlimited indicators", "Unlimited charts", "Unlimited AI
  queries", "Expanded data and seconds-level intervals".
- "Does FX Replay accept crypto payments?" "Yes. FX Replay accepts cryptocurrency payments as a
  flexible payment option in addition to standard card billing."

**Prices are regional.** `verified`: the pricing page calls `GET https://fxreplay.com/api/pricing`,
which answered `"country":"CO","currency":"COP"` with Intermediate 33,600 monthly / 336,000
yearly and Pro 65,380 monthly / 653,800 yearly, and the page replaced the USD figures
(screenshot `img/01-pricing-plans-monthly-cop.jpeg`). The help center confirms: "Prices are set
by region, so each country sees its own price in its own currency. In the United Kingdom,
Germany, Spain, France and Chile, VAT is added at checkout."
(https://support.fxreplay.com/articles/limited-time-deal, "Updated November 17, 2026"). The
homepage footer and the signup screen still showed USD to the same visitor.

**A promotion is running.** `verified`: the API response carries
`"campaign":{"stage":"early_bird","endsAt":"2026-11-20T06:00:00.000Z"}` with a 13-month Pro
offer. Help center: "For 48 hours only, FX Replay offers a discounted 13-month Pro plan" and
"This deal is available in the app and in our emails only. You won't see it on our website or
pricing page." A noindexed page, https://fxreplay.com/black-friday, reads "Opens Nov 20",
"Lock in over 50% off*", "Until Nov 29".

### 3.3 The free trial of the paid plans

| Fact | Exact wording | Source | Status |
|---|---|---|---|
| It exists on both paid plans | CTA "Start free trial" under Intermediate and Pro | https://fxreplay.com/pricing | verified |
| Length | "FX Replay offers a 5-day free trial on the Intermediate and Pro plans [...] The Beginner plan is free, so it doesn't need a trial." | https://support.fxreplay.com/articles/does-fx-replay-offer-a-free-trial ("Updated October 21, 2026") | verified |
| Length, in the app | Button labels "Start For Free" and "Start 5-Day Free Trial" | `https://app.fxreplay.com/en-US/chunk-EF5M6YAR.js` | read in the bundle, not seen |
| The pricing page never states the length | No "5-day" or "5 day" in the HTML of https://fxreplay.com/pricing | same page | verified |
| Needs a payment method | "Add your billing address and payment method to confirm the trial."; "Do I need to add a payment method? Yes. You won't be charged during the trial." | trial article above | verified |
| Needs a payment method, second article | "Do I need a credit card to create an account? No. The Beginner plan is free. A payment method is only needed if you start a free trial of Intermediate or Pro." | https://support.fxreplay.com/articles/setting-up-your-fx-replay-account ("Updated October 5, 2026") | verified |
| Needs no card (pricing FAQ) | "Yes. Both Intermediate and Pro plans offer a free trial — no credit card required to start." | https://fxreplay.com/pricing, FAQ "Is there a free trial for paid plans?" | verified |
| Converts automatically | "at the end of the 5 days, your trial turns into a paid subscription and your first payment is taken, unless you cancel before the trial ends." | trial article | verified |
| New accounts only | "The free trial is only available when you first sign up for FX Replay. It can't be added to an existing account or used again later." | trial article | verified |
| No refund for a forgotten trial | "I forgot to cancel and was charged. Can I get a refund?" "No. [...] To avoid being charged, cancel before your trial ends." | trial article | verified |

### 3.4 Where their own pages disagree

1. **Does the trial need a card?** Pricing FAQ: "no credit card required to start" (repeated on
   https://fxreplay.com/es/pricing: "no se requiere tarjeta de crédito para comenzar"). Help
   center, in three places: a payment method is required. The help center looks more
   authoritative: its articles are dated (October 5 and October 21, 2026), they describe the
   steps, the authorization hold and the automatic conversion, and the app's own button reads
   "Start 5-Day Free Trial". The pricing FAQ carries no date. The trial itself was not tested,
   because that needs an account.
2. **Pro on yearly billing, per month.** Homepage FAQ and /campaigns/futures: "$29.16". Pricing
   card and pricing FAQ: "$29.17". ($350 / 12 = 29.1667.)
3. **Analytics on Intermediate.** Pricing table: "Analytics dashboard: Limited / Unlimited /
   Unlimited". Help center: "Analytics: 1 dashboard / Limited / Unlimited".
4. **Journal on Beginner.** Pricing table: "Journal ✓". Help center: "Live Journal and
   live-synced accounts: —". Probably two things, the "Backtesting Journal" and the "Live
   Journal" (both names are theirs), but the pricing page does not say so. Do not promise the
   Live Journal on free.
5. **Stocks on Beginner.** Help center: "Stocks: —". Homepage FAQ: "Pro plan users get access to
   futures and stocks data". Markets page: five stocks (AAPL, AMZN, MSFT, NVDA, TSLA) list
   Beginner. Do not mention stocks for the free plan.
6. **How many assets.** Homepage: "Practice on 120+ assets across 6 markets". Same page:
   "Showing 10 of 310 assets". Markets page: "Showing 310 of 310 assets" in nine categories.
7. **The card undersells the limits.** Three limits on the card, 21 rows in the table.

## 4. Their funnel today

Screenshots: `img/02-home-hero-desktop.jpeg`, `img/04-home-hero-mobile.jpeg`,
`img/03-app-signup-step1-desktop.jpeg`. Steps 2 to 6 follow their help article "How to Create
Your FX Replay Account" (https://support.fxreplay.com/articles/setting-up-your-fx-replay-account,
"Updated October 5, 2026").

| # | Where | What the visitor sees | Fields | Evidence |
|---|---|---|---|---|
| 0 | https://fxreplay.com/ | H1 "Trading with confidence starts with backtesting", sub "Execute more confidently and accomplish your trading goals.", one CTA "Get started for free" (white pill). Nothing under it. Header CTA "Get Started" (blue); on a 390 px phone a fixed header shows "Try for free". A cookie notice covers about the lower third of the phone screen on first load. | none | seen |
| 1 | `https://app.fxreplay.com/en-US/signup?aff=homepage`, a separate app (full page load) | Isotype, "Confidence comes from proof, not guesswork.", "Sign up with Google", "Or", one field, "Sign up with Email" (disabled until the email is valid), "Already have an account? Sign in", "By submitting this form, I confirm that I have read and agree to FX Replay's Terms of Service and Privacy Policy", then five paragraphs of legal text. Above the legal text the words "free" and "no credit card" do not appear. | 1: email (`type="email"`, placeholder "Enter your email", no visible label) | seen; **research stopped here** |
| 2 | `/onboarding/step1`, title "FX Replay - Step 1" | "Set your username and password (email sign-up only). Choose a username and create a password, then click Next. If you signed up with Google, you'll skip this step." The username is pre-filled from the email, at least 5 characters, checked for availability. Submitting calls `completeSignup({email, username, password, acceptedTerms: true})`: **this creates the account.** | 2: username, password | help center; details read in the bundle (`chunk-Y7LMXJVW.js`), not seen |
| 3 | `/onboarding/subscribe`, title "FX Replay - Subscribe" | "Choose your plan. Pick Beginner, Intermediate or Pro, and choose monthly or yearly billing". Heading in the app: " Please select the plan you want for your subscription. " Buttons "Start For Free" and "Start 5-Day Free Trial". Behind a captcha ("Captcha unavailable, plan selection blocked"). | plan, billing cycle | help center and bundle, not seen |
| 4 | Checkout | "Add your billing details and confirm your plan." Whether the free path shows this screen is `unknown`. | for a trial: "billing address and payment method" | help center |
| 5 | Dashboard | "Confirm your username. [...] Keep it or change it, then click Save Username, or click Skip for now." | optional | help center |
| 6 | Email | "Verify your email address. We'll send a confirmation link to your email." The app also has a waiting screen that polls every 5 s and offers a resend. An onboarding questionnaire exists in the bundle (`onboarding.questionnaire.*`, with skip); where it appears is `unknown`. | none | help center and bundle |

**Fields before an account exists:** three on two screens (email, then username and password),
or one click on Google. Between the account and the product stand a plan choice with a captcha
and an email verification.

Their own names for these steps (`verified` in `https://app.fxreplay.com/en-US/chunk-54VS5F2I.js`;
the first one was also seen on the wire as `POST https://app.fxreplay.com/tapi/event`):

```
auth:         "engagement.signup_step_auth"            funnel_step 1
accountSetup: "engagement.signup_step_account_setup"   funnel_step 2
planViewed:   "engagement.signup_step_plan_viewed"     funnel_step 3
planSelected: "engagement.signup_step_plan_selected"   funnel_step 4
completed:    "engagement.signup_step_completed"       funnel_step 5
```

- Their "completed" comes after the plan is selected, not at account creation.
- Steps are emitted in order and once per visit. A step out of order or already sent becomes
  `engagement.signup_step_refused` with a reason (`already_emitted`, `predecessor_missing`,
  `no_visit`, `visit_expired`). A visit expires after 30 minutes without activity and carries a
  `funnel_visit_id`.
- Error copy at account creation: "This email already has an account" / "Log in (with Google or
  your password) or reset your password."

**CTAs on the homepage** (`verified`, desktop): 24 links to the signup URL, 22 of them visible.
In page order: "Get Started" (header), "Get started for free" (hero), five image links in "The
plan", "Start backtesting free" beside "Explore backtesting", "Try now" five times, "Test" six
times (indicator cards), "Start for free" (testimonials), "Start backtesting" (closing band),
"Sign up" (footer). All carry `?aff=homepage` except the closing band (`?aff=backtest`). On the
pricing page "Start for free" and both "Start free trial" buttons point at the same URL with no
parameter, so the link does not tell the app which plan was clicked.

**Their campaign landing pages** (`verified`; screenshot `img/05-campaign-futures-hero-mobile.jpeg`):

- https://fxreplay.com/campaigns/futures: wordmark, H1 "Trade futures with confidence", sub
  "Build conviction through realistic simulation and data-backed insights, only with the #1
  futures backtesting tool.", blue CTA "Backtest Now", then "Start for free. No credit card
  required." Further down, plan cards (locked features shown at 40% opacity with a lock icon)
  and Trustpilot quotes with names and dates.
- https://fxreplay.com/campaigns/backtest: the homepage H1, "FX Replay is the most effective way
  to backtest your strategies.", "Backtest Now", the same risk-reversal line.
- https://fxreplay.com/campaigns/backtesting: title "Traders take years to improve. You don't
  have to.", CTA "Backtest now", and a pricing block with only Intermediate and Pro, each
  "Start free trial". The free plan is not in that block.

**Voice, from the pages above:** the homepage section heads are the reader's doubts, one per
feature: "Is your edge real, or a lucky streak?" (Backtesting), "Is the strategy failing—or is
execution drifting?" (FXR Journal), "Does your risk process hold when pressure rises?" (Prop Firm
Simulator), "What keeps repeating across your sessions?" (Mentor AI), "Can the refined rule
perform without discretion?" (FXR Script). Other lines: "Build trust in your strategy, one rep
at a time", "Test it before you trust it.", "Evidence over win rate", "Rehearse a full challenge
on historical data, where a mistake costs nothing." The pricing H1 is "Profitable Trading Is
Earned". The older campaign pages are louder ("#1", "Unlock Now", "Try it Risk-Free").

## 5. Stack and tags

Everything here was read from network requests or page source. Tags fired on first load, with
no click on the cookie notice.

### 5.1 The marketing site

| What | Evidence |
|---|---|
| Astro 6.1.9 with React islands | `<meta name="generator" content="Astro v6.1.9">`, `<meta name="ploy-astro-starter-version" content="1.0.0">`, `<astro-island ... client="load">`, `https://fxreplay.com/_ploy_static/_astro/client.s4xbq9TM.js`, `.../jsx-runtime.DXco-PnT.js` |
| Hosted on "Ploy", behind Cloudflare and CloudFront | `https://cdn.ploy.ai/...`, `POST https://fxreplay.com/_ploy/ingest`, response headers `server: cloudflare`, `via: 1.1 ... cloudfront.net (CloudFront)`, `cache-control: public, max-age=0, must-revalidate` |
| **Moved off Webflow on 2026-10-04** | Header comment of `https://fxreplay.com/js/wf-tracking.js`: "Copied verbatim on 2026-10-05 from the Webflow Cloud route [...] on Ploy /t/api/v1/* returns 404, so wf_page_viewed / wf_cta_clicked / wf_page_exited stopped at the 2026-10-04 cutover." |
| Webflow leftovers | Images on `https://cdn.prod.website-files.com/667eb56e859feb725a6a82a1/...` and `https://s3.amazonaws.com/webflow-prod-assets/...`; event names prefixed `wf_`; `fx-replay-2-0.webflow.io` among the GTM linker domains |
| Fonts | Three woff2 files preloaded from `cdn.ploy.ai`; computed families `Lato, "Lato Fallback"` (h1) and `"Nunito Sans", "Nunito Sans Fallback"` (body): the kit's two families, self-hosted, with metric fallbacks |
| Languages | `hreflang` for en, pt-BR, es, fr, de, ru, ko, ja; 56 URLs for each of the seven translations in `https://fxreplay.com/sitemap-0.xml` (451 URLs in all); `https://cdn.weglot.com/weglot.min.css?v=11` |
| Structured data | One JSON-LD `@graph` with `Organization`, `WebSite`, `WebPage` on the pricing page. No `Product`, `Offer` or `FAQPage` there; the help center does use `FAQPage` |
| robots.txt | `Content-Signal: search=yes, ai-input=yes, ai-train=no`; `Disallow: /playground/`, `/testing/`; GPTBot, ClaudeBot, CCBot disallowed |

### 5.2 Tags on the marketing site

| Tag | Evidence (request URL) |
|---|---|
| Consent: Finsweet ConsentPro | `https://api.consentpro.com/v2/cdn/runtime/667eb56e859feb725a6a82a1.js`. `dataLayer`: `consent default` with all four signals `denied` and `wait_for_update: 500`, then within the same load `consent-updated`, `analytics-activated`, `marketing-activated`, `personalization-activated`. GA4 hits carried `gcs=G111`. The notice has one button, "Ok, got it!". Seen from Colombia only |
| Google Tag Manager | `https://www.googletagmanager.com/gtm.js?id=GTM-MFTXX8VD` (container version 128) |
| GA4 | `https://analytics.google.com/g/collect?v=2&tid=G-FPSMFP09BR...` |
| Google Ads | `https://googleads.g.doubleclick.net/pagead/viewthroughconversion/11436627270/...`, `https://www.google.com/rmkt/collect/11436627270/...`; `AW-11436627270` with eight conversion labels in the container |
| Meta Pixel | `https://connect.facebook.net/en_US/fbevents.js`, `https://connect.facebook.net/signals/config/996920429503339?...` |
| TikTok Pixel | `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=D7TVQ1RC77UEO91ISC60&lib=ttq`, `POST https://analytics.tiktok.com/api/v2/pixel` |
| Microsoft Clarity and Microsoft Ads UET | `https://scripts.clarity.ms/0.8.69/clarity.js`, `https://www.clarity.ms/tag/uet/97251823` |
| Vibe (connected-TV ads) | `https://s.vibe.co/vbpx.js`, `https://t.vibe.co/pixel/s?aid=wHu5sC&...&a=page_view` |
| X (Twitter) | `static.ads-twitter.com` appears in the GTM container; no request seen |
| ActiveCampaign site tracking | `https://diffuser-cdn.app-us1.com/diffuser/diffuser.js`, `https://prism.app-us1.com/?a=652637595&u=...`, `https://trackcmp.net/t_prism_sitemessages.php?trackid=652637595...` |
| Rewardful (affiliates) | `https://fxr-website-assets.s3.us-east-1.amazonaws.com/scripts/rw.js` with `data-rewardful="7f2f00"` |
| Tolt (affiliates) | `https://cdn.tolt.io/tolt.js` with a `data-tolt` id |
| Intercom | `https://widget.intercom.io/widget/qmwb3la1` |
| BugHerd (a QA feedback sidebar, loading for public visitors) | `https://www.bugherd.com/sidebarv2.js?apikey=...`, `https://sidebar.bugherd.com/embed.js?apikey=...` |
| Trustpilot TrustBox (campaign pages) | `https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js` |
| Their own event pipeline | `https://tracking-project.s3-accelerate.amazonaws.com/fxr-tracking/script.min.js` (exposes `window.FXRTracking`), `POST https://app.fxreplay.com/tapi/pseudouser` (201), `POST https://app.fxreplay.com/tapi/event` (`page_view`, `wf_page_viewed`), `https://tracker.fxreplay.com/stella.js` with `POST https://tracker.fxreplay.com/v1/page` |
| Ploy analytics | `https://fxreplay.com/_p/v1.js`, `POST https://fxreplay.com/_ploy/ingest` (`"event":"page.viewed"`, `"library":{"name":"ploy-analytics","version":"1.1.6"}`) |

Their marketing event spec is in the open, in `https://fxreplay.com/js/wf-tracking.js`
("SOP global events, v1"):

- `wf_page_viewed`, once per load. Page identity comes from `window.FXR_PAGE`
  (`page_type`, `page_name`).
- `wf_cta_clicked` with `cta_name`, `cta_label`, `cta_location`, `cta_intent`, `destination`,
  `redirect_host`, `is_app_redirect`, `source_page_type`, `handoff_type` (`signup`, `login`,
  `trial`, `pricing`). "filter is_app_redirect=true for conversions".
- `wf_nav_clicked` with `nav_item`, `nav_section`.
- `wf_page_exited`, once: `active_seconds`, `max_scroll_pct`, `sections_viewed`.
- "The SDK auto-enriches session_id, pseudo_user_id, page_path/url, referrer, utm_*,
  gclid/fbclid/ttclid, device, browser."

GTM container, read from its first-party copy at `https://app.fxreplay.com/ute2/?id=GTM-MFTXX8VD`:
GA4 event tags `sign_up`, `generate_lead`, `begin_checkout`, `add_payment_info`, `purchase`,
`free_purchase`, `cta_clicked`, `scroll_depth`, `all_clicks`; custom-event triggers include
`sign_up_page_seen`, `email_registered`, `username_registered`, `send_email_verification`,
`complete_email_verification`, `trial_purchase`, `checkout_session_created`,
`backtesting_session_created`, `backtesting_session_started`.

### 5.3 The app's signup page

`verified` on `https://app.fxreplay.com/en-US/signup`: an Angular app (PrimeNG) with Firebase
(`https://firebaseinstallations.googleapis.com/v1/projects/fx-replay-prod/installations`);
Chargebee with hCaptcha (`https://js.chargebee.com/v2/chargebee.js`); Statsig behind a
first-party host (`POST https://statsig.fxreplay.com/v1/initialize?...`); Plasmic
(`https://codegen.plasmic.app/api/v1/loader/code/published?platform=react&projectId=...`);
Optibase (`https://app.optibase.io/script.js`); Appcues (`https://fast.appcues.com/211368.js`);
LogRocket (`https://cdn.lrkt-in.com/logger-1.min.js`); GTM and GA4 served first-party
(`https://app.fxreplay.com/ute2/?id=GTM-MFTXX8VD`,
`POST https://app.fxreplay.com/ute2/ag/g/c?v=2&tid=G-FPSMFP09BR...`); Microsoft UET
(`https://bat.bing.com/bat.js`, "Tag ID 97251823"); Vibe; Meta; Google Ads; Tolt; Rewardful. Fonts:
Lato and Nunito Sans from Google Fonts.

Three things about how they measure, all `verified` on the wire:

- **One first-party identity spans both sites.** The marketing site creates a "pseudouser" and
  stores it with a session id in the cookie `fxr_session_info` (`maxAge` 7,776,000 s, 90 days).
  The app reads the same cookie and sends the same `pseudoUserId`.
- **Attribution is stored server-side as touchpoints.** `POST https://app.fxreplay.com/tapi/touchpoints`
  with `"eventType":"signup_redirect"`, `url`, `referrer`; the response row has `utm_source`,
  `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `click_id` and a `uniqueness_hash`.
- **Experiment assignment is stored on the identity.** `PATCH /tapi/pseudouser/{id}` carried
  `"properties":{"plasmicABTests":{}}`. Statsig and Optibase also load. Which tool decides what
  is `unknown`.

### 5.4 Attribution and affiliate parameters

| Parameter | What it is | Evidence |
|---|---|---|
| `aff` | **Their own source tag, not an affiliate id.** It names the page or campaign that sent the click to signup | Values seen: `homepage`, `backtest`, `prop-firm-simulator`, `futures-campaign`, `backtest-campaign`, `backtesting-campaign`, `get-free-trading-strategies-campaign`. The app logs it as `"query":{"aff":"homepage"}`. It is set by hand and unevenly: on /campaigns/futures some CTAs carry `aff=homepage`, some `aff=futures-campaign`, some nothing. `https://fxreplay.com/pricing?aff=blog` is `reported` by a search index |
| `via` | The Rewardful affiliate token | `rw.js` reads the query string with `/via=([a-z0-9\-]+)/i` and stores `rewardful.referral`. `https://www.fxreplay.com/company/pricing?via=spendmoneysmart` is `reported` by a search index. On the app, `via` with `token` is also a partner entry that pre-fills and locks the email (`setFTMOEmail` in the signup code) |
| Tolt referral | A second affiliate tool | The app calls `window.tolt.signup(email)` when `window.tolt_referral` is set |
| `utm_*`, `gclid`, `fbclid`, `ttclid` | Captured by their SDK | Comment in `wf-tracking.js`; columns of the touchpoints row |
| `redirectURL` | Post-login redirect on the app | Signup component code |
| GA4 and Meta ids | Carried into their own events | `client_id_ga4`, `session_id_ga4`, `fbp` in the `engagement.signup_step_auth` payload |

Affiliate terms on https://fxreplay.com/affiliate (`verified`): "Commission: 20% recurring",
"Cookie Duration: 60 days", "Discount: 15% for referred users". So an affiliate visitor may
arrive expecting a discount on a paid plan, which a free-plan page does not mention.

### 5.5 Field performance

Source: Chrome UX Report through Google's CrUX Vis tool (https://cruxvis.withgoogle.com/), "as of
2026-11-14", 28-day window 2026-10-18 to 2026-11-14, p75. The PageSpeed Insights API could not
be used: without a key it answered HTTP 429 with `"quota_limit_value":"0"`; pagespeed.web.dev
answered "Unable to resolve https://fxreplay.com/".

| Scope | LCP | INP | CLS | Passes all three |
|---|---|---|---|---|
| Origin `https://fxreplay.com`, phones | 3,117 ms | 290 ms | 0.00 | no |
| Origin, desktops | 2,410 ms | 130 ms | 0.00 | yes |
| Origin, all devices | 2,602 ms | 172 ms | 0.00 | no (LCP) |
| Homepage URL, phones | 3,255 ms | 300 ms | 0.00 | no |
| Pricing URL, phones | 1,478 ms | 171 ms | 0.00 | yes |

- Around the move off Webflow (origin, phones): window ending 2026-10-03, LCP 7,899 ms and INP
  394 ms; first window fully after it (2026-10-04 to 2026-10-31), LCP 3,222 ms and INP 289 ms.
  The dates coincide; the cause is our inference.
- Device mix of the homepage URL in the latest window, from the CrUX History API response the
  tool loaded: desktop 73.8%, tablet 2.7%, so phones about 23.5%. This is all homepage traffic,
  including returning users on their way to log in. It says nothing about paid traffic.
- The homepage hero is a Lottie animation (`/animations/home-hero/hero-animation.json`) with a
  poster image; the homepage HTML is about 734,000 characters (fetched in the page, uncompressed).

## 6. Imagery we can source

No licence or permission for reuse was found. The footer reads "© 2026 FXReplay. All rights
reserved."; https://fxreplay.com/legal-regulatory/terms-conditions shows a title, one risk
sentence and "Last updated: October 05, 2022"; no press or brand-assets page is in the sitemap.
The brand kit they sent contains three logo files and no product imagery.

| Asset | Where it lives | What it shows | Caution |
|---|---|---|---|
| Hero poster and animation | `https://fxreplay.com/animations/home-hero/poster.webp` (1302 × 779), `.../hero-animation.json` | The replay workspace: candle chart, replay controls, Buy and Sell, Journal and Analytics tabs | The chart is MNQ, a futures contract (Pro only). It includes TradingView's chart and logo |
| Feature compositions | `https://cdn.ploy.ai/b73d16a9-dcf7-4e21-94e0-adf5b5dcb5ef/user/df680920-backtest.webp`, `2206f082-journal.webp`, `3d42c8ca-propfirm.webp`, `57301a2d-mentorai.webp`, `b32b8d17-fxrscript.webp` (1250 to 1500 × 602) | Composed panels of the interface with sample data. The first one viewed shows the journal table and an analytics panel | Sample figures such as "Account balance $36,000" and "Winrate 67.13%" read as results. The others were not viewed |
| Feature fragments | Same host: `d0ebbc4f-replay.webp` (638 × 159), `f12a1009-multipar.webp`, `67026609-economic-calendar.webp`, `bd717fe6-monte-carlo.webp`, `cce71f2e-seconds-timeframes.webp` | Small pieces of the interface. The first is a toggle: "Enable replay: Allows you to go back to any date greater than start date of a backtesting session." | Too small for a hero; several show paid features |
| Testimonial thumbnails | `https://s3.amazonaws.com/webflow-prod-assets/667eb56e859feb725a6a82a1/...` | Faces of three named traders, linked to videos | People's likeness; do not reuse |
| Social image | `https://cdn.prod.website-files.com/667eb56e859feb725a6a82a1/693f725a81c0fe96251a9a4b_pricing-thumbnail.png` | Pricing share card | Shows prices |

Reading: nothing here is cleanly sourced in the licence sense, and the best-looking asset shows a
market the free plan does not include. The fallback the project's copy rule allows (an original
illustrative replay visual) is the option with no open question. If real imagery is wanted, ask them.

## 7. Competitors

**TradingView** (https://www.tradingview.com/, `verified`; the replay tool most traders know).
Above the fold: H1 "Where the world does markets", "Join 100 million traders and investors
taking the future into their own hands.", CTA "Get started for free", and under it "$0 forever,
no credit card needed". The CTA opens the pricing page, whose first band is the free plan:
"Free, until you're ready", "$0 forever", "Sign up", "No credit card needed"; paid plans sit
below with "Try free". Fields: the dialog first asks for a method ("Continue with Google", "Show
more options", "Email"); "Sign up with email" has two fields, Email and Password ("Must be at
least 12 characters long with letters and numbers"), and "Create account". Risk reversal: price
and card in one line beside the button, and the free plan kept visually apart from the trials.

**Forex Tester Online** (https://forextester.com/; the closest product). The landing page was
read through the fetch tool because the browser was stopped by a bot check, so its wording is
`reported`: H1 "Accurate Backtesting for Confident Trading Results"; CTAs "See Plans & Save up
to COP300000" and "Try free demo"; under them "Cancel anytime. 30-Day Money-Back Guarantee." and
"No credit card required." Fields, `verified` at https://app.forextester.com/auth/register:
"Sign Up with Google", "Sign Up with Microsoft", then First Name, Last Name, Email, Password
("6 or more characters"), a consent checkbox, and a checkbox "Create an affiliate account". Four
fields and a checkbox. Its free-tier limits were not read.

**Backtrex** (https://backtrex.com/en, `verified`; automated backtesting, not manual replay;
included for its free-signup page). Above the fold: "Import. Backtrex does the rest.", H1 "Weeks
of backtesting. In just 2 minutes.", CTA "Run my first backtest", and under it "Create your
account in 30 seconds and run your first backtest. No credit card." Fields at
https://app.backtrex.com/register: "Sign up with Google", or a three-step form ("1 Account",
"2 Profile", "3 Terms") whose first step asks Email, Password and Confirm Password. Steps 2 and
3 were not seen. Its sub-headline ends "You know if it is profitable before you risk a cent.",
an outcome claim our rules exclude.

Across the three: the risk reversal is one short line directly under the primary CTA, all offer
Google sign-in, and none creates an account from an email alone. Email path: two fields
(TradingView), four and a checkbox (Forex Tester), three plus two more steps (Backtrex), three
on two screens (FX Replay).

## 8. The starting assumptions

Each line of `docs/research/assumptions.md`, checked at the source.

| # | Finding | Outcome | Evidence |
|---|---|---|---|
| 1 | The job post names Astro, React, TypeScript and the ownership areas | **Held** | The post is still public and closed ("Ya no se aceptan solicitudes", "Hace 2 meses"): https://ar.linkedin.com/jobs/view/growth-engineer-at-fx-replay-4454691089. "Build and evolve FX Replay's marketing and growth web experiences using Astro, React, TypeScript, HTML, and CSS." "Own advanced web analytics and tracking architecture, including events, attribution, funnels, conversion tracking, experimentation, and data quality." "Design and execute A/B tests and growth experiments from implementation through measurement." "Own Core Web Vitals, performance, caching, CDN/edge behavior, rendering strategies, technical SEO, structured data, and accessibility." It also asks for "DNS, CDN, hosting, CI/CD, observability, security, and production reliability", "reusable components, design systems, tokens", "GA4, GTM, PostHog/Amplitude, Segment/CDPs", and "Claude Code as a primary environment" |
| 2 | Replay, simulated trades, journal and review; lead features; markets | **Mostly held** | Product and markets: rows 10 and 14, and "Futures, Forex, Stocks, Indices, and Crypto" (homepage FAQ). The homepage's five lead blocks are Backtesting, FXR Journal, Prop Firm Simulator, Mentor AI and **FXR Script**; "performance analytics" is not one of them. "Live Journal" is their name for a separate, paid feature |
| 3 | Free "Beginner" plan, no card, no time limit; 2 sessions, 1 indicator, 1 week retention | **Held, incomplete** | Rows 1 to 7. The table adds 50 trades per session, 1 month per session, no multi-chart, no futures |
| 4 | A separate 5-day trial; Intermediate $17.99, Pro $35 a month | **Held** | Section 3.3 and row 22. Prices are USD list prices; visitors see regional prices |
| 5 | The homepage uses both "Start for free. No credit card required." and "Start your 5-day free trial" | **Did not hold** | Neither string is in the homepage HTML. The first is on /campaigns/futures and /campaigns/backtest; the second is a CTA on https://fxreplay.com/company/about. The homepage hero has "Get started for free" and nothing under it |
| 6 | The pricing FAQ and a support article disagree on the card | **Held** | Section 3.4, item 1 |
| 7 | Affiliate traffic exists; URLs carry `?via=` and `?aff=` | **Partly held** | Affiliates exist (Rewardful, Tolt, the affiliate page) and `via` is the affiliate token. `aff` is not an affiliate parameter: it is their own source tag (section 5.4). Both indexed URLs are `reported` by search, not opened |
| 8 | Spanish pages under `/es/` | **Held** | https://fxreplay.com/es (`lang="es"`, H1 "Operar con confianza empieza con un backtest"), https://fxreplay.com/es/pricing. Eight languages in all |
| 9 | The marketing site runs on Webflow | **Did not hold** | Astro 6.1.9 on Ploy since 2026-10-04 (section 5.1). `/playground/pricing-copy` now redirects to the homepage and `/playground/` is disallowed in robots.txt |
| 10 | Trustpilot about 4.2 to 4.3 from roughly 650 reviews | **Count held, score did not** | 4.1 from 659 (row 19) |

## 9. Could not verify

- **Anything behind account creation:** the screens after the email step (read in code and in
  the help center, not seen), whether the free path asks for billing details, what the trial
  checkout asks for, where the onboarding questionnaire appears, and what a Beginner account
  can really do.
- **Whether the free plan includes the Prop Firm Simulator.**
- **The Trustpilot page.** https://www.trustpilot.com/review/fxreplay.com answered "Your request
  has been blocked as it has been identified as coming from a bot that's against our terms of
  service". The numbers in row 19 come from Trustpilot's widget endpoint as loaded by FX
  Replay's page. The reviews themselves and Trustpilot's rules for quoting a score were not
  read. A person should open the page before the score reaches copy.
- **Lab performance** (no Lighthouse run, see 5.5) and **the device mix of paid traffic**.
- **Consent behavior for visitors in the EU or UK.** Seen from Colombia only.
- **USD prices as a US visitor sees them rendered.** Read in the static HTML and the help
  center; our session was shown COP.
- **Forex Tester's landing page in a browser**, and its free-tier limits.
- **The job post's exact date.** LinkedIn says "Hace 2 meses"; an aggregator
  (https://jaabz.com/jobs/266072-growth-engineer) says Aug 22, 2026 (`reported`).
- **What Ploy is**, beyond the headers and paths above. **Which experiment tool decides what.**
- **Their conversion rates, traffic sources and volumes.** Nothing public.
- **Which asset count is current** ("120+" or 310), and the eight other feature images not viewed.
- **Whether redirects keep `via` and UTM parameters.** Not tested, to avoid sending made-up
  parameters to their site.
- One request was made to `/playground/pricing-copy` to check finding 9 before their robots.txt
  was read; it redirected to the homepage. No other disallowed path was requested.
