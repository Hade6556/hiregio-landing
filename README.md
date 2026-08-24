# HireGio landing page

A single-file landing page. Everything the page needs — styles, script, icons,
the mascot — is inlined in `index.html`, so it has no build step and no
dependencies at runtime. Open it and it works.

## Look at it

Double-click `index.html`, or serve it:

    python3 -m http.server 8788
    # then http://127.0.0.1:8788/

Serving it is closer to the real thing: opening off `file://` works, but the
scroll-snap paging and the WebGL field behave better over http.

## Edit it

`index.html` is the whole site and the source of truth. It is heavily commented
— most non-obvious rule says why it is there and what broke without it.

**`DESIGN.md` is worth reading before changing anything.** It documents the
spacing ladder, the paging system, the type scale, the phone breakpoints and
the reasoning behind each, including several things that look wrong until you
know what they are load-bearing for.

Two rules that will bite otherwise:

- **Every margin, padding and gap is a rung of one ladder** (`--s1`, `--s2`,
  `--s3` …) derived from `--u`. A test fails on any raw pixel value in a
  spacing declaration.
- **The page must stay one self-contained file.** No relative `src`, no CDN.
  Google Fonts is the only permitted external origin, and a test asserts it.

## Tests

    npm install
    npx playwright test

76 tests, all passing. They are not unit tests — they pin the design: that the
hero ends on the fold, that cards in a row are the same height, that the phone
gets its own type scale, that scrolling does not drop frames, that no
percentage creeps back into a candidate row. If you change the design
deliberately, expect to update the test and its comment rather than delete it.

## The mascot

`mascot.png` (920x1522, transparent) is the source asset. It is inlined into
`index.html` as a WebP data URI, so **editing `mascot.png` alone changes
nothing** — the page carries its own copy.

The render arrived as a JPEG with a transparency checkerboard baked into the
pixels rather than a real alpha channel. `scripts/key-mascot-v2.cjs` cuts it:

    node scripts/key-mascot-v2.cjs path/to/source.jpg mascot.png 920

`scripts/key-mascot.cjs` is the older keyer, kept for reference — it handled a
previous render that was black-on-black and never cut cleanly.
`assets/gio.png` is that superseded cut-out and is no longer referenced.

The other `scripts/gio-*.cjs` files are one-off experiments from a design
comparison and are not part of the build.

## Hosting

There is no deploy config. The page is one file, so anything that can serve a
static file will do — drag the folder onto Netlify Drop, push it to GitHub
Pages, or email the file.
