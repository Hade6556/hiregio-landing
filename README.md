<div align="center">

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:FBFAF7,100:F3F1EC&height=180&section=header&text=HireGio&fontSize=66&fontColor=17191B&fontAlignY=38&desc=One%20HTML%20file.%20No%20build.%20A%20measured%20design%20system%20pinned%20by%20tests.&descSize=17&descAlignY=62&descColor=1E6B4E" alt="HireGio landing banner" width="100%" />

**The HireGio landing page as a single self-contained `index.html`: styles, script, icons and the mascot inlined, a WebGL wave in the hero, and a Playwright suite that fails when the design drifts.**

[![Top language](https://img.shields.io/github/languages/top/Hade6556/hiregio-landing?style=for-the-badge)](https://github.com/Hade6556/hiregio-landing)
[![License](https://img.shields.io/github/license/Hade6556/hiregio-landing?style=for-the-badge)](#license)
[![Last commit](https://img.shields.io/github/last-commit/Hade6556/hiregio-landing?style=for-the-badge)](https://github.com/Hade6556/hiregio-landing/commits)
[![Stars](https://img.shields.io/github/stars/Hade6556/hiregio-landing?style=for-the-badge)](https://github.com/Hade6556/hiregio-landing/stargazers)

[![HTML5](https://img.shields.io/badge/HTML5-single%20file-E34F26?style=for-the-badge&logo=html5&logoColor=white)](index.html)
[![WebGL](https://img.shields.io/badge/WebGL-hero%20wave-990000?style=for-the-badge&logo=webgl&logoColor=white)](index.html)
[![Playwright](https://img.shields.io/badge/Playwright-design%20tests-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](tests/)
[![Bun](https://img.shields.io/badge/Bun-lockfile-000000?style=for-the-badge&logo=bun&logoColor=white)](bun.lock)

</div>

---

## What it does

It is the marketing page for HireGio, an AI hiring product with a mascot called Gio. The page is a stack of full-screen panes with scroll-snap paging: hero, how it works, agents, proof, pricing, a dark call to action, and FAQ. Everything the page needs is inside `index.html`, so it can be opened from disk, emailed, or dropped on any static host.

> **[screenshot placeholder]** Capture the hero at 1440×900 with the wave mid-animation and Gio in the two-column layout, then the "how it works" pane on a 390-wide phone. A short screen recording of the scroll-snap paging would also help.

## Features

- **Single file, no runtime dependencies.** The only external origin is Google Fonts, and a test asserts that.
- **WebGL wave** in the hero with no-WebGL fallbacks.
- **Scroll-snap paging** that always comes to rest on a section top, with keyboard tab navigation that scrolls the focused tab into view.
- **A measured design system.** Every colour, spacing rung, radius and type size was measured off three reference sites and reduced to a common denominator. `DESIGN.md` records the tokens and why each exists.
- **One spacing ladder.** Every margin, padding and gap is a rung derived from one unit, and a test fails on any raw pixel value in a spacing declaration.
- **Accessibility floors**: grey text held above WCAG AA 4.5:1, 44 px touch targets, a reduced-motion path that skips the hero sequence and keeps the toggles.
- **A phone type scale** of its own below the breakpoints.
- **Design-pinning tests** rather than unit tests: the hero ends on the fold, cards in a row share a height, scrolling does not drop frames, the FAQ grows instead of clipping.

## Tech stack

| Layer | Choice |
|---|---|
| Page | One `index.html` of about 300 KB, heavily commented, mascot inlined as a WebP data URI |
| Graphics | Hand-drawn SVG wordmark and three social marks, a WebGL field for the hero |
| Tests | `@playwright/test` against `python3 -m http.server 8788`, config in `playwright.config.js` |
| Asset tooling | `scripts/key-mascot-v2.cjs` cuts the mascot's transparency; the other `scripts/gio-*.cjs` files are one-off experiments |
| Package manager | Bun lockfile; npm works too |

## Quick start

```bash
git clone https://github.com/Hade6556/hiregio-landing.git
cd hiregio-landing
python3 -m http.server 8788      # http://127.0.0.1:8788/
```

Double-clicking `index.html` also works. Serving it over http is closer to the real thing: the scroll-snap paging and the WebGL field behave better than on `file://`.

### Run the tests

```bash
npm install                      # or: bun install
npx playwright test              # starts the http server itself, see playwright.config.js
```

The suite pins the design. If you change the design on purpose, update the test and its comment rather than deleting it.

## Usage

- **Edit the page.** `index.html` is the source of truth. Read [`DESIGN.md`](DESIGN.md) first: it explains the spacing ladder, the paging system, the type scale and the phone breakpoints, including several things that look wrong until you know what they hold up.
- **Replace the mascot.** `mascot.png` (920×1522, transparent) is the source asset, but the page carries its own inlined copy. Re-cut from a new render with `node scripts/key-mascot-v2.cjs path/to/source.jpg mascot.png 920`, then re-inline it.
- **Deploy.** There is no deploy config. Push to GitHub Pages, drag the folder onto Netlify Drop, or copy the file to any web server.

Two rules that bite if ignored:

1. Every spacing value must be a rung of the ladder (`--s1`, `--s2`, `--s3`, ...) derived from `--u`.
2. The page must stay one self-contained file: no relative `src`, no CDN.

## Contributing

1. Run `npx playwright test` before and after your change.
2. Keep to the design rules in `DESIGN.md`: no icon libraries, no emoji, no gradients outside the wave, hairline borders instead of shadows, one accent colour.
3. When a test must change, say in the pull request which design decision moved and why.
4. Do not add a build step or a dependency to the page itself.

The page title still reads "HireGio Landing Draft". **[placeholder: set the final title and meta description]**

## License

No license file is in the repository yet, so the default "all rights reserved" applies. **[placeholder: add a LICENSE file; the badge above updates by itself]**
