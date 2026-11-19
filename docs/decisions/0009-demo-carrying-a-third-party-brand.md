# 0009. This is a demo that carries someone else's brand

- **Status:** accepted
- **Date:** 2026-11-18
- **Phase:** 0

## Context

The challenge asks for a thoughtful interpretation of FX Replay's brand, with their logo,
colors and typefaces, on a page that will be deployed to a public URL. It is not their site.
A visitor or a search engine could take it for the real thing, and anything invented on it
would be said in their name.

## Options considered

1. **Build it as if it were theirs,** indexable, with illustrative testimonials and numbers.
   It looks finished, and it puts invented claims under a real company's logo.
2. **Mark it as a demo and keep it out of search,** with SEO fully implemented behind a
   switch and every claim sourced.
3. **Strip the brand** and use a neutral one. No risk of confusion, and it fails the part of
   the brief that asks for their brand to be interpreted.

## Decision

`noindex` by default through an environment flag, with SEO fully implemented and switchable.
A discreet notice says this is a candidate challenge demo and not the official FX Replay
site. No invented testimonials, numbers or logos, and no promises of profit. Every factual
claim in the copy traces to fxreplay.com.

## Consequences

- SEO work is real and auditable, with the flag on, without the demo competing with their
  site in search.
- Copy is limited to what the research can source, which also keeps it honest.
- Social proof appears only if it is real and verified at its source.
- **Cost to change later:** low. Going live for real is a flag and the removal of the notice.
