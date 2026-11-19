---
paths:
  - "src/**/*.{astro,css,tsx,jsx,ts}"
  - "public/**"
  - "tokens/**"
---

# Brand and styling

The source of truth is `brief/brand-kit/` (read-only). Our reading of it, the answers to its
two open questions and every extension we add are in `docs/brand-notes.md`.

- **Colors are semantic tokens only**: `var(--bg-primary)`. Never a primitive
  (`var(--dark-900)`), never a literal (hex, `rgb()`, a named color).
  `scripts/checks/token-usage.mjs` runs after every edit and in CI.
- `tokens/tokens.json` is the source, rebuilt from the kit with its names unchanged.
  `tokens/tokens.css` is generated from it: edit the JSON, then run `npm run gen`.
- **Our additions are extensions**: a field border, a link color for dark ground, a button edge,
  the type and spacing scales. They live in their own block, follow the kit's naming, and each
  one is listed in `docs/brand-notes.md` with its reason and the contrast before and after.
  A color extension aliases a value the kit already has. It never introduces a new color.
- Electric Blue stays the primary CTA fill and `bg-primary` stays the ground. When the only
  contrast fix would change how the brand looks, keep the brand, keep that pairing away from
  essential content, and write the recommendation in `docs/brand-notes.md`.
- Every foreground and background pair the UI uses is registered in the contrast check:
  4.5:1 for text, 3:1 for large text and for the boundaries of controls. A new pair is added
  to the check in the same change that introduces it.
- Two families: Lato for headings, Nunito Sans for body and UI. Self-hosted, only the weights
  in use, the headline face preloaded. No third family without asking the candidate.
- The logo files are used as shipped: no recolor, stretch or effects. The wordmark is the
  primary lockup. The isotype is for square contexts: favicon, app icon, avatar.
- Every interactive element has all its states designed: hover, focus-visible, pressed, busy,
  error, success. Focus is a 2px ring with a 2px offset.
- Motion explains something, and it is removed under `prefers-reduced-motion`.
- No effect is worth a layout shift or a slower LCP. Images carry their dimensions. If an idea
  needs either, show the candidate the cost before building it.
- Visual direction, the headline and the offer wording are the candidate's decisions. Bring
  rendered options at 360, 768 and 1440, not descriptions.
