# Starting assumptions about FX Replay

What was believed about FX Replay before the build, from a first read of their public site
on 2026-11-18, and what the research found. The evidence for each line is in section 8 of
`docs/research/brief.md`. Only what held may reach copy, design or documents.

| # | Assumption | Outcome |
|---|---|---|
| 1 | The job post for the Growth Engineer role names Astro, React and TypeScript as the stack for marketing and growth web, and lists ownership of analytics and tracking architecture, A/B tests, Core Web Vitals, caching, CDN and edge behavior, rendering strategies, technical SEO, structured data and accessibility. | **Held.** The post is still public, and it is quoted in the brief |
| 2 | The product lets traders replay historical markets, place simulated trades, and journal and review them. The features it leads with are replay mode, a prop-firm challenge simulator, a live journal, an AI mentor and performance analytics. Markets: forex, futures, stocks, crypto, indices. | **Mostly held.** The fifth lead feature is FXR Script, not performance analytics, and "Live Journal" is a separate paid feature |
| 3 | There is a free "Beginner" plan with no card and no time limit. The pricing page lists its limits as 2 backtesting sessions, 1 indicator and 1 week of data retention. | **Held, incomplete.** Also 50 trades per session, 1 month of history per session, one chart, and no futures |
| 4 | Separately, there is a 5-day free trial of the paid plans: Intermediate at $17.99 a month and Pro at $35 a month. | **Held.** Those are USD list prices. Visitors see regional prices |
| 5 | The homepage uses both "Start for free. No credit card required." and "Start your 5-day free trial". | **Did not hold.** Neither is on the homepage. The first is on two campaign pages, the second on the about page |
| 6 | Their pricing FAQ and a support article disagree on whether the trial needs a card. | **Held.** The pricing FAQ says no card. Three help-center passages say a payment method is required |
| 7 | Affiliate traffic exists: indexed URLs carry `?via=` and `?aff=` parameters. | **Partly held.** `via` is the affiliate token. `aff` is their own source tag, not an affiliate id |
| 8 | The site has Spanish pages under `/es/`. | **Held.** Eight languages in all |
| 9 | The marketing site runs on Webflow (inferred from URL patterns such as `/playground/pricing-copy`). | **Did not hold.** It is Astro 6 with React islands, moved off Webflow on 2026-10-04 |
| 10 | Third-party sites report a Trustpilot rating of about 4.2 to 4.3 from roughly 650 reviews. | **Count held, score did not.** 4.1 from 659 reviews, read from Trustpilot's widget data. The Trustpilot page itself still has to be read by a person |
