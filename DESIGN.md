# HireGio design system

Not invented. Every token below was measured off metaview.ai, juicebox.ai and
reval.site with `getComputedStyle`, then reduced to their common denominator.

## Ground rules

These are hard constraints, not preferences:

- No icon libraries. The only SVG on the page is the brand wordmark and three
  hand-drawn social marks, all at 1.6 stroke on a 24 grid.
- No emoji anywhere.
- No gradients except the WebGL wave background and its no-WebGL fallbacks.
- No em dashes, en dashes as separators, non-breaking or narrow spaces, or
  zero-width characters. Plain comma, colon, period, or hyphen.
- Hairline 1px borders instead of shadows. One exception: the hero product frame.
- One accent colour. It appears on the CTA, links, step numbers and match scores.
  Nowhere else.

## Colour

| Token | Value | Job |
|---|---|---|
| `--bg` | `#FBFAF7` | page ground, warm cream |
| `--bg-alt` | `#F3F1EC` | alternating section band |
| `--surface` | `#FFFFFF` | cards and mockups |
| `--ink` | `#17191B` | primary text |
| `--ink-2` | `rgba(23,25,27,0.68)` | body and lead text |
| `--ink-3` | `rgba(23,25,27,0.62)` | labels, captions, timestamps |
| `--line` | `#E5E2DA` | every hairline |
| `--accent` | `#1E6B4E` | CTA, links, step numbers |
| `--dark` | `#0F1F19` | the one dark band |
| `--signal-no` | `#A8442E` | only inside product mockups |

Both grey tiers are held above WCAG AA 4.5:1 on `--bg-alt`, the darkest ground
either sits on: `--ink-2` gives 5.76:1, `--ink-3` gives 4.73:1. The step between
them is small by necessity, so the label tier separates itself with uppercase,
0.1em tracking and smaller size rather than with colour alone.

## Type

DM Sans, the same face reval.site uses. Metaview (Euclid Circular A) and
Juicebox (Roobert, Haas Grot) are licensed, so they were not options.

| Role | Size | Weight | Tracking |
|---|---|---|---|
| h1 | 72px | 500 | -0.035em |
| h2 | 48px | 500 | -0.025em |
| h3 lead | 26px | 500 | -0.01em |
| h3 base | 21px | 500 | -0.01em |
| lead | 21px | 400 | -0.01em |
| body | 17px | 400 | normal |
| eyebrow | 12px | 500 | 0.1em, uppercase |

h3 has exactly two tiers. `--h3-lead` heads a full section row, `--h3-base`
labels a card or a plan. Running prose is capped at 62ch so lines land between
45 and 75 characters.

## Space and shape

Container 1280px, gutter 40px, section rhythm 144px desktop and 88px under
900px. Radii come from one ladder and nothing sits outside it:
`--r-card` 18, `--r-md` 12, `--r-btn` 10, `--r-sm` 6, `--r-xs` 4, `--r-tag` 999.

Every interactive target is at least 44px in its smaller dimension.
