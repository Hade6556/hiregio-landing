import { test, expect } from "@playwright/test";

// The landing page reads one section at a time. Every rule below is a promise
// the layout makes to the reader, and each one is cheap to break by adding a
// row to a mock or a line to a heading, so they are pinned here.
//
// The gate is 1100x760: at or above it the page pages, below it the sections
// stack in ordinary flow. See DESIGN.md, "Paging".

const PAGED = [
  { width: 1100, height: 760 },   // the gate itself, the tightest case
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const STACKED = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },   // wide enough, too short: falls back
];

const navHeight = (page) =>
  page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h"))
  );

// A pane sized with min-height always reports itself as fitting. To learn what
// its content actually wants, collapse the min-height, measure, put it back.
const naturalHeights = (page) =>
  page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = ".pane{min-height:0 !important}";
    document.head.appendChild(style);
    const out = [...document.querySelectorAll(".pane")].map((el) => ({
      id:
        el.id ||
        el.querySelector(".step-num,.h3,.eyebrow")?.textContent.trim().slice(0, 24) ||
        "?",
      height: Math.ceil(el.getBoundingClientRect().height),
    }));
    style.remove();
    return out;
  });

for (const size of PAGED) {
  const label = `${size.width}x${size.height}`;

  test(`${label}: every section holds its own content inside one screen`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/index.html");
    await page.waitForTimeout(600);

    const available = size.height - (await navHeight(page));
    const tooTall = (await naturalHeights(page)).filter((p) => p.height > available);
    expect(tooTall, `panes taller than the ${available}px a screen offers`).toEqual([]);
  });

  test(`${label}: nothing is clipped`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/index.html");
    await page.waitForTimeout(600);

    // min-height, not height: a pane that cannot fit grows rather than cutting
    // its content off. If this ever fails, something switched to a fixed height.
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll(".pane")]
        .filter((el) => el.scrollHeight > el.clientHeight + 1)
        .map((el) => el.className)
    );
    expect(clipped).toEqual([]);
  });

  test(`${label}: the first screen ends on the fold`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/index.html");
    await page.waitForTimeout(600);

    const fold = await page.evaluate(() => {
      const hero = document.querySelector(".hero").getBoundingClientRect();
      const next = document.querySelectorAll(".pane")[1].getBoundingClientRect();
      const trust = document.querySelector(".hero .pane-foot .logos").getBoundingClientRect();
      return {
        heroBottom: Math.round(hero.bottom),
        nextTop: Math.round(next.top),
        trustBottom: Math.round(trust.bottom),
        viewport: window.innerHeight,
      };
    });

    expect(Math.abs(fold.heroBottom - fold.viewport)).toBeLessThanOrEqual(1);
    expect(fold.nextTop).toBeGreaterThanOrEqual(fold.viewport - 1);
    expect(fold.trustBottom).toBeLessThan(fold.viewport);
  });
}

test("the wheel comes to rest on a section top, never between two", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/index.html");
  await page.waitForTimeout(700);

  const nav = await navHeight(page);
  // Every snap target on the page, not only the panes. How-it-works pins one
  // screen over four stops so the steps advance with the scroll, and those
  // three extra stops are rest positions too -- the pin does not move at any
  // of them, which is the whole point of it.
  const tops = await page.evaluate(() =>
    [...document.querySelectorAll(".pane, .hiw-stop")].map((el) =>
      Math.round(el.getBoundingClientRect().top + window.scrollY)
    )
  );

  const stops = [];
  for (let i = 0; i < 25; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(400);
    const y = await page.evaluate(() => Math.round(window.scrollY));
    if (stops.at(-1) === y) break;
    stops.push(y);
  }

  const bottom = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight
  );
  const stray = stops.filter(
    (y) => y < bottom - 2 && !tops.some((t) => Math.abs(t - nav - y) <= 2)
  );

  expect(stray, "rest positions that are not a section top under the nav").toEqual([]);
  expect(stops.length).toBeGreaterThanOrEqual(10);
  expect(stops.at(-1)).toBeGreaterThanOrEqual(bottom - 2);
});

test("nav links land the section flush under the header", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/index.html");
  await page.waitForTimeout(700);

  const nav = await navHeight(page);
  for (const id of ["how", "agents", "proof", "pricing", "cta", "faq"]) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    await page.evaluate((target) => {
      history.replaceState(null, "", "#");
      location.hash = target;
    }, id);
    await page.waitForTimeout(400);

    const top = await page.evaluate(
      (target) => Math.round(document.getElementById(target).getBoundingClientRect().top),
      id
    );
    expect(Math.abs(top - nav), `#${id} sits ${top}px from the top, nav is ${nav}px`)
      .toBeLessThanOrEqual(2);
  }
});

test("opening every FAQ answer grows the pane instead of cutting it off", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/index.html");
  await page.waitForTimeout(600);

  await page.evaluate(() => {
    document.querySelectorAll("#faq details").forEach((d) => (d.open = true));
  });
  await page.waitForTimeout(300);

  const faq = await page.evaluate(() => {
    const el = document.querySelector("#faq");
    return { clipped: el.scrollHeight > el.clientHeight + 1 };
  });
  expect(faq.clipped).toBe(false);
});

for (const size of STACKED) {
  test(`${size.width}x${size.height}: below the gate the page flows normally`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/index.html");
    await page.waitForTimeout(600);

    const state = await page.evaluate(() => ({
      snap: getComputedStyle(document.documentElement).scrollSnapType,
      clipped: [...document.querySelectorAll(".pane")].filter(
        (el) => el.scrollHeight > el.clientHeight + 1
      ).length,
      sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
    }));

    expect(state.snap).toBe("none");
    expect(state.clipped).toBe(0);
    expect(state.sideways).toBe(false);
  });
}

// The complaint this system exists to answer: screens that each put their
// heading at a different height read as arbitrary, however carefully each one
// is spaced on its own. Every screen after the first opens with an eyebrow and
// a heading on the same two lines.
//
// The hero is the one exception and it is deliberate. It has no screen before
// it to align to, so it centres on the optical line instead, which is where a
// reader arriving cold actually looks. The tests below pin the exception as
// tightly as they pin the rule, so neither can drift into the other.
for (const size of PAGED) {
  test(`${size.width}x${size.height}: every screen after the hero opens on the same two lines`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/index.html");
    await page.waitForTimeout(600);

    const rows = await page.evaluate(() =>
      [...document.querySelectorAll(".pane")].map((pane) => {
        const top = pane.getBoundingClientRect().top;
        const eyebrow = pane.querySelector(".eyebrow");
        const heading = pane.querySelector(".h1, .h2");
        return {
          hero: pane.classList.contains("hero"),
          id: pane.id || pane.className,
          eyebrow: eyebrow ? Math.round(eyebrow.getBoundingClientRect().top - top) : null,
          heading: heading ? Math.round(heading.getBoundingClientRect().top - top) : null,
        };
      })
    );

    // Every screen opens the same way, hero included.
    expect(rows.filter((r) => r.eyebrow === null), "screens with no eyebrow").toEqual([]);
    expect(rows.filter((r) => r.heading === null), "screens with no heading").toEqual([]);

    const paged = rows.filter((r) => !r.hero);
    const eyebrows = [...new Set(paged.map((r) => r.eyebrow))];
    const headings = [...new Set(paged.map((r) => r.heading))];
    expect(Math.max(...eyebrows) - Math.min(...eyebrows), `eyebrow offsets: ${eyebrows}`).toBeLessThanOrEqual(1);
    expect(Math.max(...headings) - Math.min(...headings), `heading offsets: ${headings}`).toBeLessThanOrEqual(1);
  });

  test(`${size.width}x${size.height}: the hero opens a fixed distance under the nav`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/index.html");
    await page.waitForTimeout(600);

    const hero = await page.evaluate(() => {
      const pane = document.querySelector(".hero").getBoundingClientRect();
      const main = document.querySelector(".hero-main").getBoundingClientRect();
      const foot = document.querySelector(".hero .pane-foot").getBoundingClientRect();
      const eb = document.querySelector(".hero .eyebrow").getBoundingClientRect();
      const mascot = document.querySelector("img.hero-mascot").getBoundingClientRect();
      const row = document.querySelector(".hero .btn-row").getBoundingClientRect();
      const top = { top: Math.min(eb.top, mascot.top) };
      // Same block at both ends, or the offset mixes the figure's top with
      // the copy's bottom and measures nothing.
      const bottom = { bottom: Math.max(row.bottom, mascot.bottom) };
      return {
        // The whole hero row, copy and figure. The mascot column is the taller
        // of the two, so measuring the eyebrow alone now reports the copy being
        // centred against him rather than the hero floating.
        gapTop: Math.round(top.top - main.top),
        offset: Math.round((top.top + bottom.bottom) / 2 - pane.top - pane.height / 2),
        paneHeight: Math.round(pane.height),
        clearsStrip: row.bottom <= foot.top + 1,
      };
    });

    // Above true centre, because that is where the eye reads centre, but not
    // so far above that it is back to being a top-anchored screen.
    expect(hero.offset, "hero block centre relative to true centre").toBeLessThan(0);
    expect(Math.abs(hero.offset)).toBeLessThan(hero.paneHeight * 0.16);
    expect(hero.clearsStrip, "the hero row overlaps the trust strip").toBe(true);

    // The number this section exists to hold. Dead centring made this gap
    // grow with the window -- 107px at the gate, 293px on a tall screen --
    // and the hero read as unloaded. The surplus goes below the content now,
    // so the headline opens at the same distance under the nav on every
    // screen the page pages at.
    expect(hero.gapTop, `${size.width}x${size.height} opens ${hero.gapTop}px under the nav`)
      .toBeGreaterThan(15);
    expect(hero.gapTop).toBeLessThan(115);
  });
}

test("the gap above the headline does not grow with the window", async ({ page }) => {
  // Same rule, pushed past the sizes the rest of the suite covers. A 2560x1600
  // window has 763px more room than the gate does; none of it may land above
  // the eyebrow.
  const gaps = [];
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1512, height: 945 },
    { width: 1440, height: 1080 },
    { width: 1920, height: 1200 },
    { width: 2560, height: 1600 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/index.html");
    await page.waitForTimeout(600);
    gaps.push({
      size: `${size.width}x${size.height}`,
      ...(await page.evaluate(() => {
        const main = document.querySelector(".hero-main").getBoundingClientRect();
        const eb = document.querySelector(".hero .eyebrow").getBoundingClientRect();
        const row = document.querySelector(".hero .btn-row").getBoundingClientRect();
        const m = document.querySelector("img.hero-mascot").getBoundingClientRect();
        const top = Math.min(eb.top, m.top), bottom = Math.max(row.bottom, m.bottom);
        return {
          gapTop: Math.round(top - main.top),
          share: Math.round(((bottom - top) / main.height) * 100),
        };
      })),
    });
  }
  const worst = Math.max(...gaps.map((g) => g.gapTop));
  const best = Math.min(...gaps.map((g) => g.gapTop));
  expect(worst, `gaps: ${JSON.stringify(gaps)}`).toBeLessThan(120);
  expect(worst - best, `spread across a 700px range of window height`).toBeLessThan(60);
  // And the hero is genuinely occupied rather than a block adrift in cream.
  // 37% at 2560x1600, which is a very tall window; the mascot is capped at
  // 300px wide on purpose, so he cannot grow to fill one.
  expect(Math.min(...gaps.map((g) => g.share)), `occupancy: ${gaps.map((g) => g.share).join(" ")}`)
    .toBeGreaterThan(33);
});

test("the headline is two sentences at two sizes, and they form a block", async ({ page }) => {
  // The copy is a setup and a payoff, and they do different jobs: the setup
  // states the problem, the payoff answers it. Left as one paragraph,
  // text-wrap:balance broke it after "your" -- a noun phrase split in half and
  // the sentence boundary landing mid-line. Two spans at two sizes instead.
  //
  // Three things are pinned. Each sentence holds one line, so neither ever
  // breaks again. The payoff is decisively larger, because that is the line
  // meant to land. And the two lines come out close to the same width, which
  // is what makes the pair read as one rectangular block instead of a
  // lopsided pyramid -- it is the reason the sizes are the numbers they are.
  for (const size of [{ width: 1100, height: 760 }, { width: 1440, height: 900 }, { width: 2560, height: 1440 }]) {
    await page.setViewportSize(size);
    await page.goto("/index.html");
    await page.waitForTimeout(500);
    const h1 = await page.evaluate(async () => {
      await document.fonts.ready;
      const px = (el) => parseFloat(getComputedStyle(el).fontSize);
      const lines = (el) => Math.round(el.getBoundingClientRect().height / (px(el) * 1.02));
      const inkWidth = (el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        return Math.round(r.getBoundingClientRect().width);
      };
      const s = document.querySelector(".h1-setup");
      const p = document.querySelector(".h1-payoff");
      return {
        setup: Math.round(px(s)), payoff: Math.round(px(p)),
        setupLines: lines(s), payoffLines: lines(p),
        setupWidth: inkWidth(s), payoffWidth: inkWidth(p),
        colWidth: Math.round(document.querySelector(".hero-copy").getBoundingClientRect().width),
        clearance: Math.round(
          document.querySelector("img.hero-mascot").getBoundingClientRect().left
          - (() => { const r = document.createRange(); r.selectNodeContents(p);
                     return r.getBoundingClientRect().right; })()),
        // The accent is the page's interactive token. The headline is not
        // interactive, and a green line here would sit above a green button.
        payoffColour: getComputedStyle(p).color,
      };
    });
    const at = `${size.width}px wide`;
    expect(h1.setupLines, `setup wrapped, ${at}`).toBe(1);
    expect(h1.payoffLines, `payoff wrapped, ${at}`).toBe(1);
    expect(h1.payoff / h1.setup, `size interval, ${at}`).toBeGreaterThan(2.2);
    // Lower than it was, because the hero is two columns now and the copy
    // measures 634px at --maxw rather than the full page width.
    expect(h1.payoff, `payoff too small to be the headline, ${at}`).toBeGreaterThanOrEqual(60);
    // The block no longer tapers, and that is the design. The payoff is set
    // larger than the 634px copy column can hold and told not to wrap, so its
    // tail runs on past the column edge. The overhang is what stops the hero
    // reading as two boxes side by side.
    const overhang = h1.payoffWidth - h1.colWidth;
    expect(overhang, `payoff ${h1.payoffWidth}px in a ${h1.colWidth}px column, ${at}`)
      .toBeGreaterThan(20);

    // But NOTHING may cover a letter. He was in front of the tail for a while
    // and it swallowed the whole of the final "m" and the full stop, so
    // "Gio will find them." read as "Gio will find then". A mascot that edits
    // the headline is not depth, it is a bug. He clears it now.
    expect(h1.clearance, `only ${h1.clearance}px between the payoff and the mascot, ${at}`)
      .toBeGreaterThan(12);

    expect(h1.payoffColour, `the payoff must stay in ink, ${at}`).toBe("rgb(23, 25, 27)");
  }
});

test("on a phone the hero is generous, and the actions are still above the fold", async ({ page }) => {
  // This used to assert the hero fitted one screen. It no longer does and it
  // should not: the phone rhythm was re-derived to be deliberately airy, and a
  // figure now stands under the buttons. Fitting one screen was only ever a
  // proxy for the thing that matters, which is that a reader who has not
  // scrolled can read the promise and act on it.
  //
  // So the rule is now the real one. Everything down to and including both
  // buttons is above the fold; the hero is allowed to run past it for the
  // mascot and the trust strip; and it is bounded so it cannot run away.
  const rows = [];
  for (const size of [
    { width: 360, height: 740 },
    { width: 390, height: 844 },
    { width: 414, height: 896 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/index.html");
    await page.waitForTimeout(600);

    const d = await page.evaluate(async () => {
      await document.fonts.ready;
      const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h"));
      const fold = window.innerHeight;
      const r = (q) => document.querySelector(q).getBoundingClientRect();
      const avail = fold - nav;
      return {
        lastButtonBottom: Math.round(r(".hero .btn-row").bottom),
        leadBottom: Math.round(r(".hero .lead").bottom),
        fold,
        heroScreens: +(r(".hero").height / avail).toFixed(2),
        // The gaps that make the hero read as spacious rather than stacked.
        ebToH1: Math.round(r(".h1").top - r(".hero .eyebrow").bottom),
        leadToBtn: Math.round(r(".hero .btn-row").top - r(".hero .lead").bottom),
        figClearance: Math.round(r(".hero .pane-foot").top - r(".hero-figure").bottom),
        mascotToStripText: Math.round(r(".hero .pane-foot .eyebrow").top - r("img.hero-mascot").bottom),
      };
    });
    rows.push({ size: `${size.width}x${size.height}`, ...d });

    const at = `${size.width}x${size.height}`;
    expect(d.leadBottom, `the promise is below the fold, ${at}`).toBeLessThan(d.fold);
    expect(d.lastButtonBottom, `both actions must be above the fold, ${at}`).toBeLessThan(d.fold);
    // Airy, but not adrift.
    expect(d.heroScreens, `hero runs ${d.heroScreens} screens, ${at}`).toBeLessThan(1.75);
    // The rhythm the phone was re-derived to have: a heading is further from
    // its paragraph than its lines are from each other, and an action is
    // further still.
    expect(d.leadToBtn, `lead to buttons, ${at}`).toBeGreaterThan(d.ebToH1);
    // He stood on the trust strip once, with 4px between his soles and its
    // first line of type, so the words ran through his legs.
    expect(d.figClearance, `figure to strip, ${at}`).toBeGreaterThan(20);
    expect(d.mascotToStripText, `mascot to strip type, ${at}`).toBeGreaterThan(40);
  }
  console.log(JSON.stringify(rows, null, 1));
});

// Every spacing on the page is a rung of the ladder. Nothing declares its own.
test("no spacing value is set outside the ladder", async ({ page }) => {
  await page.goto("/index.html");
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));

  const offenders = [];
  const rule = /(margin|padding|gap|column-gap|row-gap)(-(top|right|bottom|left|block|inline))?\s*:\s*([^;}]+)/g;
  for (const m of css.matchAll(rule)) {
    const value = m[4];
    // 0, auto, negative nudges and the fixed --gutter are not rhythm.
    const bare = value.match(/(?<![\w-])(\d+(\.\d+)?)px/g) || [];
    for (const px of bare) {
      if (parseFloat(px) === 0) continue;
      offenders.push(`${m[1]}${m[2] || ""}: ${value.trim()}`);
      break;
    }
  }
  expect([...new Set(offenders)], "spacing declarations using a raw pixel value").toEqual([]);
});

// The hero closes on a strip pinned to the fold: a hairline, then the logo
// band. The customers screen used to carry a second one for "Built for", which
// now lives in the hero as chips, so there is exactly one left.
test("the pinned strip sits on the fold under a hairline", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/index.html");
  await page.waitForTimeout(600);

  const feet = await page.evaluate(() =>
    [...document.querySelectorAll(".pane-foot")].map((el) => {
      const pane = el.closest(".pane").getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        inHero: !!el.closest(".hero"),
        gapToFold: Math.round(pane.bottom - el.getBoundingClientRect().bottom),
        padTop: cs.paddingTop,
        borderTop: cs.borderTopWidth,
      };
    })
  );

  expect(feet).toHaveLength(1);
  expect(feet[0].inHero).toBe(true);
  expect(feet[0].borderTop).toBe("1px");
  // Pinned to the fold means it sits exactly one pane padding off the bottom.
  const pad = await page.evaluate(() =>
    getComputedStyle(document.querySelector(".hero")).paddingBottom
  );
  expect(feet[0].gapToFold).toBe(Math.round(parseFloat(pad)));
});

// The header is two elements: an outer band that only holds the bar off the
// top of the window, and an inner bar that carries all the appearance. At rest
// the bar is invisible; past the first few pixels of scroll it condenses into
// a floating translucent pill. Pattern measured off reval.site.
//
// The band must keep its full --nav-h height in both states. Everything the
// paging depends on is derived from that number, so if the band ever changed
// size on scroll, every snap position and every pane height would move with it.
test("the header condenses into a pill without moving the band", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/index.html");
  await page.waitForTimeout(600);

  const read = () =>
    page.evaluate(() => {
      const nav = document.querySelector(".nav");
      const bar = nav.querySelector(".wrap");
      const cs = getComputedStyle(bar);
      const wrap = document.querySelector(".hero .wrap");
      return {
        pinned: nav.hasAttribute("data-pinned"),
        band: Math.round(nav.getBoundingClientRect().height),
        token: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")),
        bg: cs.backgroundColor,
        radius: cs.borderRadius,
        shadow: cs.boxShadow,
        blur: cs.backdropFilter || cs.webkitBackdropFilter,
        logoLeft: Math.round(nav.querySelector(".logo").getBoundingClientRect().left),
        contentLeft: Math.round(
          wrap.getBoundingClientRect().left + parseFloat(getComputedStyle(wrap).paddingLeft)
        ),
      };
    });

  const flat = await read();
  expect(flat.pinned).toBe(false);
  expect(flat.bg).toBe("rgba(0, 0, 0, 0)");
  expect(flat.radius).toBe("0px");
  expect(flat.shadow).toBe("none");
  expect(flat.band).toBe(flat.token);

  await page.evaluate(() => window.scrollTo({ top: 900, behavior: "instant" }));
  await page.waitForTimeout(700);

  const pill = await read();
  expect(pill.pinned).toBe(true);
  expect(pill.bg).not.toBe("rgba(0, 0, 0, 0)");
  expect(parseFloat(pill.radius)).toBeGreaterThan(100);
  expect(pill.shadow).toContain("0px 0px 0px 1px"); // the hairline, as a ring
  expect(pill.blur).toContain("blur");

  // The band did not move, so nothing the paging is built on moved either.
  expect(pill.band).toBe(flat.band);
  expect(pill.band).toBe(pill.token);

  // The hairline is a shadow ring rather than a border for this reason: a
  // border sits inside the box and pushes the logo a pixel off the column
  // every other element on the page aligns to.
  expect(flat.logoLeft).toBe(flat.contentLeft);
  expect(pill.logoLeft).toBe(pill.contentLeft);

  // And back.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => document.querySelector(".nav").hasAttribute("data-pinned"))).toBe(false);
});

for (const size of [...PAGED, ...STACKED]) {
  test(`${size.width}x${size.height}: the header band matches --nav-h`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/index.html");
    await page.waitForTimeout(500);
    const d = await page.evaluate(() => ({
      band: Math.round(document.querySelector(".nav").getBoundingClientRect().height),
      token: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")),
      sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
    }));
    expect(d.band).toBe(d.token);
    expect(d.sideways).toBe(false);
  });
}

// How it works, one screen, four steps. The pattern is reval.site's: a
// numbered timeline whose track fills to the step you are on, and that step's
// product shot beside it.
//
// What is not copied is the driver. Theirs is a three-viewport section that
// pins and scrubs the active step from the scroll offset, which cannot work
// inside a mandatory snap container: the browser pulls back to the nearest
// snap position the moment you stop moving, and mid-pin that means being
// yanked to the top of the section.
//
// It was four screens with one step each for exactly that reason, which meant
// printing the same timeline four times and making the reader page through
// the section to see the section. The driver now is a radio group, so the
// state is still in the markup and still needs no script: the step lights,
// the track fills, the heading changes and the panel swaps, all off :checked.
const stepState = (page) =>
  page.evaluate(() => {
    const visible = (el) => getComputedStyle(el).visibility === "visible";
    const ol = document.querySelector(".hiw-steps");
    const nodes = [...document.querySelectorAll(".hiw-node")];
    const accent = (v) => v.includes("30, 107, 78");
    return {
      checked: [...document.querySelectorAll(".hiw-in")].findIndex((r) => r.checked),
      // Exactly one heading and exactly one panel, and they agree.
      titles: [...document.querySelectorAll(".hiw-title")].filter(visible).map((t) => t.textContent.trim()),
      cards: [...document.querySelectorAll(".hiw-card")].filter(visible).length,
      cardIndex: [...document.querySelectorAll(".hiw-card")].findIndex(visible),
      label: [...document.querySelectorAll(".hiw-in")]
        .filter((r) => r.checked)
        .map((r) => r.parentElement.querySelector(".hiw-label").textContent.trim())[0],
      fill: Math.round(parseFloat(getComputedStyle(ol, "::after").height)),
      filled: nodes.filter((n) => accent(getComputedStyle(n).backgroundColor)).length,
      ringed: nodes.filter((n) => accent(getComputedStyle(n).borderColor)).length,
      span: Math.round(nodes[nodes.length - 1].getBoundingClientRect().top - nodes[0].getBoundingClientRect().top),
    };
  });

test("how it works is one screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/index.html");
  await page.waitForTimeout(600);

  const d = await page.evaluate(() => ({
    sections: document.querySelectorAll("[id^='how']").length,
    timelines: document.querySelectorAll(".hiw-steps").length,
    steps: document.querySelectorAll(".hiw-step").length,
    cards: document.querySelectorAll(".hiw-card").length,
    titles: document.querySelectorAll(".hiw-title").length,
    // One heading element, whatever it is currently saying.
    headings: document.querySelectorAll("#how .h2").length,
  }));
  expect(d.sections, "#how-2, #how-3 and #how-4 are gone").toBe(1);
  expect(d.timelines, "the timeline is printed once").toBe(1);
  expect(d.steps).toBe(4);
  expect(d.cards).toBe(4);
  expect(d.titles).toBe(4);
  expect(d.headings).toBe(1);
});

test("the timeline reports the step it is on", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/index.html");
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById("how").scrollIntoView());
  await page.waitForTimeout(300);

  // A click ends the section's own playback, so from here every step change
  // is this test's.
  await page.locator(".hiw-hit").first().click();
  await page.waitForTimeout(500);

  let lastFill = -1;
  for (let i = 0; i < 4; i++) {
    if (i) {
      await page.locator(".hiw-hit").nth(i).click();
      await page.waitForTimeout(600);
    }
    const s = await stepState(page);
    expect(s.checked, `step ${i + 1} is the one checked`).toBe(i);
    expect(s.titles, `step ${i + 1} shows one heading`).toHaveLength(1);
    expect(s.cards, `step ${i + 1} shows one panel`).toBe(1);
    expect(s.cardIndex, `step ${i + 1} shows its own panel`).toBe(i);
    // The heading and the lit label are the same step, said twice.
    expect(s.titles[0]).toBe(s.label);
    // Only the step you are on is filled; the ones behind it keep the ring.
    expect(s.filled, `step ${i + 1} fills one node`).toBe(1);
    expect(s.ringed, `step ${i + 1} rings itself and the ${i} behind it`).toBe(i + 1);
    // The track only ever grows.
    expect(s.fill, `step ${i + 1} track fill`).toBeGreaterThan(lastFill);
    lastFill = s.fill;

    if (i === 0) expect(s.fill, "nothing is drawn behind the first step").toBe(0);
    if (i === 3) expect(Math.abs(s.fill - s.span), "the last step fills to the last node").toBeLessThanOrEqual(2);
  }
});

test("stepping changes the step without moving the screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/index.html");
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById("how").scrollIntoView());
  await page.waitForTimeout(500);

  const nav = await navHeight(page);
  const read = () =>
    page.evaluate(() => ({
      y: Math.round(window.scrollY),
      step: [...document.querySelectorAll(".hiw-in")].findIndex((r) => r.checked),
      // Where the pinned screen actually sits in the viewport. This is the
      // number that must not move: the scroll travels, the screen does not.
      pinTop: Math.round(document.querySelector(".hiw-pin").getBoundingClientRect().top),
      heading: Math.round(document.querySelector("#how .h2").getBoundingClientRect().height),
      cards: Math.round(document.querySelector(".hiw-cards").getBoundingClientRect().height),
    }));

  const before = await read();
  expect(before.step).toBe(0);

  for (const i of [1, 2, 3, 0]) {
    await page.locator(".hiw-hit").nth(i).click();
    await page.waitForTimeout(600);
    const now = await read();
    expect(now.step, `clicking step ${i + 1} selects it`).toBe(i);
    // A step is a place on the page now, so choosing one travels there. The
    // step showing and the place the reader is standing have to agree, or the
    // next flick of the wheel would snap them somewhere else.
    expect(now.y, `step ${i + 1} did not travel`).toBe(before.y + i * (900 - nav));
    // And these are the four numbers that must never move: the screen is
    // pinned, the headings are stacked in one cell and so are the panels.
    expect(now.pinTop, `step ${i + 1} moved the pinned screen`).toBe(before.pinTop);
    expect(now.heading, `step ${i + 1} resized the heading`).toBe(before.heading);
    expect(now.cards, `step ${i + 1} resized the card`).toBe(before.cards);
  }
});

test("the timeline turns horizontal where a column will not fit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/index.html");
  await page.waitForTimeout(600);

  const d = await page.evaluate(() => {
    const ol = document.querySelector(".hiw-steps");
    const nodes = [...ol.querySelectorAll(".hiw-node")].map((n) => n.getBoundingClientRect());
    const after = getComputedStyle(ol, "::after");
    return {
      sameRow: nodes.every((n) => Math.abs(n.top - nodes[0].top) < 2),
      grid: getComputedStyle(document.querySelector(".hiw")).gridTemplateColumns,
      fillIsHorizontal: parseFloat(after.height) <= 2,
      sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });

  expect(d.sameRow, "all four nodes on one row").toBe(true);
  expect(d.grid.split(" ")).toHaveLength(1); // one column, card under the timeline
  expect(d.fillIsHorizontal).toBe(true);
  // A grid track's min-width is auto, so the 460px min-width on a mock inside
  // the card used to propagate out and widen the whole page.
  expect(d.sideways, "the page must not scroll sideways").toBe(false);
});

// "Set the brief" is the one mock on the page whose own caption makes a
// promise -- "Edit one and every agent updates" -- so the criteria are real
// toggles and the count in the footer is read from them rather than written
// into it. The import sequence on top of that is an enhancement and is the
// only part that is allowed to disappear.
test.describe("the brief", () => {
  test("the criteria toggle and the count follows", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/index.html");
    await page.waitForTimeout(600);

    const count = page.locator("[data-brief-count]");
    const pressed = page.locator('[data-brief-tags] .tag[aria-pressed="true"]');
    await expect(count).toHaveText("Three");
    expect(await pressed.count()).toBe(3);

    await page.locator("[data-brief-tags] .tag").nth(3).click();
    await expect(count).toHaveText("Four");
    expect(await pressed.count()).toBe(4);

    await page.locator("[data-brief-tags] .tag").nth(0).click();
    await expect(count).toHaveText("Three");

    // Keyboard, because these are buttons and not decorated spans.
    await page.locator("[data-brief-tags] .tag").nth(1).focus();
    await page.keyboard.press("Enter");
    await expect(count).toHaveText("Two");
  });

  test("a chip is a 44px target without being drawn at 44px", async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForTimeout(400);
    const d = await page.evaluate(() => {
      const t = document.querySelector("[data-brief-tags] .tag");
      const after = getComputedStyle(t, "::after");
      const box = t.getBoundingClientRect();
      return {
        ink: Math.round(box.height),
        target: Math.round(box.height + Math.abs(parseFloat(after.top)) * 2),
      };
    });
    expect(d.ink).toBeLessThan(44); // the chip keeps its size
    expect(d.target).toBeGreaterThanOrEqual(44); // the hit area does not
  });

  test("the import plays once and hands back the exact resting state", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/index.html");
    await page.waitForTimeout(600);

    const before = await page.evaluate(() => ({
      link: document.querySelector("[data-brief-link]").textContent,
      status: document.querySelector("[data-brief-status]").textContent,
      height: Math.round(document.querySelector("[data-brief]").getBoundingClientRect().height),
    }));

    await page.evaluate(() => document.querySelector("[data-brief]").closest(".pane").scrollIntoView());
    await page.waitForTimeout(300);
    // Mid-flight: the link is still being typed.
    const mid = await page.evaluate(() => document.querySelector("[data-brief-link]").textContent.length);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(before.link.length);

    await page.waitForTimeout(2700);
    const after = await page.evaluate(() => ({
      link: document.querySelector("[data-brief-link]").textContent,
      status: document.querySelector("[data-brief-status]").textContent,
      height: Math.round(document.querySelector("[data-brief]").getBoundingClientRect().height),
      armed: document.querySelector("[data-brief]").classList.contains("is-armed"),
      leftover: document.querySelectorAll("[data-brief-tags] .tag.is-in").length,
      faded: [...document.querySelectorAll("[data-brief-tags] .tag")]
        .filter((t) => getComputedStyle(t).opacity !== "1").length,
    }));

    expect(after.link).toBe(before.link);
    expect(after.status).toBe(before.status);
    expect(after.armed, "the mock must be handed back unarmed").toBe(false);
    expect(after.leftover, "no element left holding an animation class").toBe(0);
    expect(after.faded).toBe(0);
    // Nothing it does may move a box, or every geometry assertion in this
    // file becomes a race against a 1.3 second animation.
    expect(after.height).toBe(before.height);

    // Latched.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector("[data-brief]").closest(".pane").scrollIntoView());
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.querySelector("[data-brief-link]").textContent)).toBe(before.link);
  });

  test("reduced motion skips the sequence and keeps the toggles", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/index.html");
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector("[data-brief]").closest(".pane").scrollIntoView());
    await page.waitForTimeout(700);

    const d = await page.evaluate(() => ({
      armed: document.querySelector("[data-brief]").classList.contains("is-armed"),
      link: document.querySelector("[data-brief-link]").textContent.length,
    }));
    expect(d.armed).toBe(false);
    expect(d.link).toBeGreaterThan(40);

    await page.locator("[data-brief-tags] .tag").nth(3).click();
    await expect(page.locator("[data-brief-count]")).toHaveText("Four");
  });
});

test.describe("the brief without script", () => {
  test.use({ javaScriptEnabled: false });
  test("the markup alone carries the state", async ({ page }) => {
    await page.goto("/index.html");
    const d = await page.evaluate(() => ({
      link: document.querySelector("[data-brief-link]").textContent,
      pressed: document.querySelectorAll('[data-brief-tags] .tag[aria-pressed="true"]').length,
      count: document.querySelector("[data-brief-count]").textContent,
      allVisible: [...document.querySelectorAll("[data-brief-tags] .tag")]
        .every((t) => getComputedStyle(t).opacity === "1"),
    }));
    expect(d.link).toContain("kilo.co/career/ai-software-engineer-node-js");
    expect(d.pressed).toBe(3);
    expect(d.count).toBe("Three");
    expect(d.allVisible, "nothing may be left hidden waiting for a script").toBe(true);
  });
});

// The scroll is the driver. Four empty stops, one screen tall each, sit behind
// a pinned screen; the page snaps, so every stop is a snap position and one
// gesture is one step.
//
// This is reval.site's actual mechanism, and it is the one thing the section
// could not have while it was four screens. A pinned region inside a mandatory
// snap container gets pulled back to the nearest snap position the moment you
// stop moving -- but only because it had nothing to snap TO. Give the pinned
// range its own snap positions and the fight goes away.
test.describe("the scroll drives the steps", () => {
  const at = (page) =>
    page.evaluate(() => [...document.querySelectorAll(".hiw-in")].findIndex((r) => r.checked));

  const land = async (page) => {
    await page.evaluate(() => document.getElementById("how").scrollIntoView());
    await page.waitForTimeout(600);
  };

  test("the section is four stops tall and pins one screen across them", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/index.html");
    await page.waitForTimeout(700);

    const nav = await navHeight(page);
    const d = await page.evaluate(() => {
      const sec = document.getElementById("how");
      return {
        armed: sec.hasAttribute("data-scroll"),
        height: Math.round(sec.getBoundingClientRect().height),
        pin: getComputedStyle(document.querySelector(".hiw-pin")).position,
        pinSnap: getComputedStyle(document.querySelector(".hiw-pin")).scrollSnapAlign,
        stops: [...document.querySelectorAll(".hiw-stop")].map((s) => ({
          top: Math.round(s.getBoundingClientRect().top + window.scrollY),
          snap: getComputedStyle(s).scrollSnapAlign,
          h: Math.round(s.getBoundingClientRect().height),
        })),
      };
    });

    const screen = 900 - nav;
    expect(d.armed, "the script arms the scroll driver").toBe(true);
    expect(d.height, "four screens of scroll, one per step").toBe(4 * screen);
    expect(d.pin).toBe("sticky");
    // The pin gives up being a snap target; the stops behind it are the
    // snap targets now, or the two would compete for the same rest position.
    expect(d.pinSnap).toBe("none");
    expect(d.stops).toHaveLength(4);
    d.stops.forEach((s, i) => {
      expect(s.snap, `stop ${i + 1} is a snap position`).toBe("start");
      expect(s.h, `stop ${i + 1} is one screen tall`).toBe(screen);
      if (i) expect(s.top - d.stops[i - 1].top, `stop ${i + 1} sits one screen on`).toBe(screen);
    });
  });

  test("one gesture is one step, down and back up", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/index.html");
    await page.waitForTimeout(700);
    await land(page);

    const seen = [await at(page)];
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(600);
      seen.push(await at(page));
    }
    expect(seen, "one wheel gesture per step, in order").toEqual([0, 1, 2, 3]);

    const back = [];
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, -900);
      await page.waitForTimeout(600);
      back.push(await at(page));
    }
    expect(back, "and it walks back the same way").toEqual([2, 1, 0]);
  });

  test("the screen never moves while the steps do", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/index.html");
    await page.waitForTimeout(700);
    await land(page);

    const nav = await navHeight(page);
    const tops = [];
    for (let i = 0; i < 4; i++) {
      tops.push(
        await page.evaluate(() =>
          Math.round(document.querySelector(".hiw-pin").getBoundingClientRect().top)
        )
      );
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(600);
    }
    // Every one of them flush under the nav. If the snap were fighting the
    // pin, this is where it would show as the screen being yanked.
    tops.forEach((t, i) => expect(t, `step ${i + 1} pin offset`).toBe(nav));
  });

  test("the track fills as the scroll travels", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/index.html");
    await page.waitForTimeout(700);
    await land(page);

    const fill = () =>
      page.evaluate(() =>
        Math.round(parseFloat(getComputedStyle(document.querySelector(".hiw-steps"), "::after").height))
      );

    const seen = [await fill()];
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(600);
      seen.push(await fill());
    }
    expect(seen[0], "nothing drawn behind the first step").toBe(0);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i], `the track only grows (${seen})`).toBeGreaterThan(seen[i - 1]);
    }
    const span = await page.evaluate(() => {
      const n = document.querySelectorAll(".hiw-node");
      return Math.round(n[n.length - 1].getBoundingClientRect().top - n[0].getBoundingClientRect().top);
    });
    expect(Math.abs(seen[3] - span), "the last step fills to the last node").toBeLessThanOrEqual(2);
  });

  test("the wheel picks up from wherever a click left off", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/index.html");
    await page.waitForTimeout(700);
    await land(page);

    await page.locator(".hiw-hit").nth(2).click();
    await page.waitForTimeout(600);
    expect(await at(page)).toBe(2);
    // The failure this guards: if the click moved the check without moving the
    // scroll, the next gesture would snap back to whichever stop the reader
    // was actually standing on.
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(600);
    expect(await at(page), "the wheel carried on from the clicked step").toBe(3);
  });

  test("the arrow keys travel too", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/index.html");
    await page.waitForTimeout(700);
    await land(page);

    const before = await page.evaluate(() => Math.round(window.scrollY));
    const nav = await navHeight(page);
    await page.locator("#hiw-1").focus();
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(600);
    expect(await at(page)).toBe(1);
    expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(before + (900 - nav));
  });

  test("below the paging gate it collapses back to one screen", async ({ page }) => {
    // Three empty stops are three dead screens on a page that is not paging.
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto("/index.html");
    await page.waitForTimeout(700);

    const d = await page.evaluate(() => {
      const sec = document.getElementById("how");
      return {
        armed: sec.hasAttribute("data-scroll"),
        stop: getComputedStyle(document.querySelector(".hiw-stop")).display,
        pin: getComputedStyle(document.querySelector(".hiw-pin")).position,
        screens: sec.getBoundingClientRect().height / (window.innerHeight - 77),
      };
    });
    expect(d.stop, "the stops are not rendered at all").toBe("none");
    expect(d.pin).toBe("static");
    expect(d.screens, "one screen of content, not four").toBeLessThan(1.6);

    // Still a stepper, just a hand-driven one.
    await page.locator(".hiw-hit").nth(3).click();
    await page.waitForTimeout(400);
    expect(await at(page)).toBe(3);
  });
});

test.describe("the timeline without script", () => {
  test.use({ javaScriptEnabled: false });
  test("it is still a working stepper", async ({ page }) => {
    await page.goto("/index.html");

    const read = () =>
      page.evaluate(() => {
        const visible = (el) => getComputedStyle(el).visibility === "visible";
        return {
          card: [...document.querySelectorAll(".hiw-card")].findIndex(visible),
          cards: [...document.querySelectorAll(".hiw-card")].filter(visible).length,
          title: [...document.querySelectorAll(".hiw-title")].findIndex(visible),
          fill: Math.round(parseFloat(getComputedStyle(document.querySelector(".hiw-steps"), "::after").height)),
          lit: getComputedStyle(
            document.querySelector(".hiw-in:checked").parentElement.querySelector(".hiw-node")
          ).backgroundColor.includes("30, 107, 78"),
        };
      });

    const first = await read();
    expect(first.card, "it opens on step one").toBe(0);
    expect(first.cards).toBe(1);
    expect(first.title).toBe(0);
    expect(first.fill).toBe(0);
    expect(first.lit, "the step you are on is filled").toBe(true);

    // The control is CSS, so it works with the script dead. This is the part
    // that four screens bought and that one screen has to earn back.
    await page.locator(".hiw-hit").nth(3).click();
    // Both panels are visible while the fade runs: that is what visibility
    // does when it is transitioned, and it is the reason the panel leaving
    // does not vanish a frame before the one arriving lands.
    await page.waitForTimeout(600);
    const last = await read();
    expect(last.card).toBe(3);
    expect(last.cards).toBe(1);
    expect(last.title).toBe(3);
    expect(last.fill).toBeGreaterThan(first.fill);
    expect(last.lit).toBe(true);
  });
});

// The headline used to sit on its clamp floor for every phone: min(7.4vw,15vh)
// does not reach 34px until about 460px wide, so a 430px screen and a 320px
// screen were served the identical 34px payoff and 19px setup. The type did not
// answer the screen at all, and the setup landed on exactly the same size as
// the lead under it, leaving three near identical lines stacked.
test("the phone headline scales with the screen and keeps its order", async ({ page }) => {
  const seen = [];
  for (const width of [320, 360, 390, 414, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/index.html");
    await page.waitForTimeout(500);
    const d = await page.evaluate(async () => {
      await document.fonts.ready;
      const px = (q) => Math.round(parseFloat(getComputedStyle(document.querySelector(q)).fontSize));
      const el = document.querySelector(".h1-payoff");
      const r = document.createRange();
      r.selectNodeContents(el);
      return {
        payoff: px(".h1-payoff"), setup: px(".h1-setup"),
        lead: px(".hero .lead"), body: px("body"),
        payoffWidth: Math.round(r.getBoundingClientRect().width),
        wrap: Math.round(document.querySelector(".hero .wrap").clientWidth),
        payoffLines: Math.round(el.getBoundingClientRect().height / (px(".h1-payoff") * 1.02)),
      };
    });
    seen.push({ width, ...d });

    const at = `${width}px`;
    // Four sizes, each visibly smaller than the last. Two of them landing on
    // the same number is what made the hero read as flat.
    expect(d.payoff, `payoff vs setup, ${at}`).toBeGreaterThan(d.setup * 1.7);
    expect(d.setup, `setup vs lead, ${at}`).toBeGreaterThan(d.lead);
    expect(d.lead, `lead vs body, ${at}`).toBeGreaterThanOrEqual(d.body);
    // The payoff is one line and inside the measure at every phone width.
    expect(d.payoffLines, `payoff wrapped, ${at}`).toBe(1);
    expect(d.payoffWidth, `payoff is ${d.payoffWidth}px in a ${d.wrap}px measure, ${at}`)
      .toBeLessThanOrEqual(d.wrap);
  }
  // And it actually grows: the widest phone gets a bigger headline than the
  // narrowest, which is the whole thing that was broken.
  expect(seen.at(-1).payoff, `sizes: ${seen.map((s) => `${s.width}:${s.payoff}`).join(" ")}`)
    .toBeGreaterThan(seen[0].payoff);
});

test("the hero is balanced on the container, not listing to one side", async ({ page }) => {
  // The copy hangs on the container's left edge and Gio hangs on its right,
  // which is the same line every other section on this page is hung on.
  // Anchored to the left of his own column instead, he left 237px more empty
  // space on the right of the screen than on the left, at every width, and the
  // hero read as listing. The space between the headline and him is the hero's
  // negative space; the space outside them both is the page's margin, and the
  // two must not be confused.
  for (const size of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await page.goto("/index.html");
    await page.waitForTimeout(600);
    const d = await page.evaluate(async () => {
      await document.fonts.ready;
      const r = (q) => document.querySelector(q).getBoundingClientRect();
      const m = r("img.hero-mascot");
      return {
        left: Math.round(r(".hero-copy").left),
        right: Math.round(window.innerWidth - m.right),
        // The wrap's CONTENT edge, not its border box: .wrap carries the
        // gutter as padding, so its border box runs to the viewport edge.
        wrapRight: Math.round(
          window.innerWidth - r(".hero .wrap").right
          + parseFloat(getComputedStyle(document.querySelector(".hero .wrap")).paddingRight)),
      };
    });
    const at = `${size.width}x${size.height}`;
    expect(Math.abs(d.left - d.right), `${at}: ${d.left}px of margin left, ${d.right}px right`)
      .toBeLessThanOrEqual(2);
    // And that margin is the container's own, not an arbitrary number.
    expect(Math.abs(d.right - d.wrapRight), `${at}: he must sit on the container edge`)
      .toBeLessThanOrEqual(2);
  }
});

test("the hero drop never fires on a phone", async ({ page }) => {
  // It is a correction for a window that is tall relative to its content. A
  // phone hero is one screen either way, and on a 400x1100 the rule opened a
  // 289px band of nothing between the buttons and the trust strip.
  for (const size of [{ width: 390, height: 844 }, { width: 400, height: 1100 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(size);
    await page.goto("/index.html");
    await page.waitForTimeout(500);
    const d = await page.evaluate(() => {
      const main = document.querySelector(".hero-main");
      const r = (q) => document.querySelector(q).getBoundingClientRect();
      const m = r("img.hero-mascot");
      return {
        pad: Math.round(parseFloat(getComputedStyle(main).paddingBottom)),
        top: Math.round(r(".hero .eyebrow").top - main.getBoundingClientRect().top),
        // The mascot stands between the buttons and the strip on a phone, so
        // the old "the two gaps match" check has a figure inside it now.
        mascotBelowButtons: m.top > r(".hero .btn-row").bottom,
        mascotAboveStripFoot: m.bottom < r(".hero .pane-foot").bottom,
        centred: Math.abs((m.left + m.right) / 2 - window.innerWidth / 2),
      };
    });
    expect(d.pad, `${size.width}x${size.height} hero drop`).toBe(0);
    expect(d.mascotBelowButtons, `${size.width}x${size.height}: the hero stacks`).toBe(true);
    expect(d.mascotAboveStripFoot, `${size.width}x${size.height}: the mascot is not cut off`).toBe(true);
    expect(d.centred, `${size.width}x${size.height}: mascot off centre by ${d.centred}px`).toBeLessThanOrEqual(1);
  }
});

// Reported from review: "labai aki pjauna kai jie nevienodo dydzio" -- cards in
// a row standing at different heights. Every card grid carried
// align-items:start, which lets each card take its own natural height.
// Measured at 1440 before the fix: Sourcing 48px taller than Candidate
// analysis, Reports 22px taller than Personalized outreach, Guardrails 10px
// taller than Activity. The quotes and the plans happened to match, but only
// because their copy happened to be the same length.
//
// It also fought the cards' own construction: .card, .quote and .plan are flex
// columns whose last element is pushed down with margin-top:auto, so "Learn
// more" and the plan buttons are meant to sit on a common line across the row,
// which only reads if the row is one height.
test("cards in a row are the same height", async ({ page }) => {
  for (const size of [{ width: 1440, height: 900 }, { width: 1100, height: 760 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await page.goto("/index.html");
    await page.waitForTimeout(700);

    const rows = await page.evaluate(async () => {
      await document.fonts.ready;
      const out = [];
      for (const sel of [".bento", ".compare", ".control", ".quotes", ".plans", ".layer-agents"]) {
        document.querySelectorAll(sel).forEach((g, gi) => {
          const kids = [...g.children];
          if (kids.length < 2) return;
          // Only rows: once a grid has stacked to one column the heights are
          // supposed to differ, and comparing them would mean nothing.
          const tops = new Set(kids.map((c) => Math.round(c.getBoundingClientRect().top)));
          if (tops.size > 1) return;
          const hs = kids.map((c) => Math.round(c.getBoundingClientRect().height));
          out.push({
            grid: `${sel}[${gi}]`,
            spread: Math.max(...hs) - Math.min(...hs),
            heights: hs,
          });
        });
      }
      return out;
    });

    expect(rows.length, `no card rows found at ${size.width}`).toBeGreaterThan(3);
    for (const r of rows) {
      expect(r.spread, `${r.grid} at ${size.width}x${size.height}: heights ${r.heights.join(", ")}`)
        .toBeLessThanOrEqual(1);
    }
  }
});

// From review: "is procentu visus pakeiskime tiesiog i Strong fit, Good fit,
// Not a fit". A percentage claimed a precision the product does not have --
// 96 against 93 is not a difference anyone can act on, and a number invites
// comparing two candidates on a decimal instead of reading the evidence
// underneath. Three named tiers instead, coloured with the page's own verdict
// tokens so a candidate and a criterion are graded in one vocabulary.
test("candidate fit is a named tier, never a percentage", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/index.html");
  await page.waitForTimeout(700);

  const d = await page.evaluate(() => {
    const allowed = { "Strong fit": "rgb(30, 107, 78)", "Good fit": "rgba(23, 25, 27, 0.68)", "Not a fit": "rgb(168, 68, 46)" };
    const marks = [...document.querySelectorAll(".match")].map((m) => ({
      text: m.textContent.trim(),
      colour: getComputedStyle(m).color,
      mono: getComputedStyle(m).fontFamily.toLowerCase().includes("mono"),
    }));
    // Percentages that legitimately remain: the reports card's funnel metrics,
    // which are real rates with bars beside them, not fit scores.
    const strayPercent = [...document.querySelectorAll(".match, .cand, .crit")]
      .filter((el) => /\d+%/.test(el.textContent)).length;
    return { marks, strayPercent, allowed };
  });

  expect(d.marks.length, "the fit labels are still on the page").toBeGreaterThan(5);
  for (const m of d.marks) {
    expect(Object.keys(d.allowed), `unexpected fit label "${m.text}"`).toContain(m.text);
    expect(m.colour, `"${m.text}" is not in its verdict colour`).toBe(d.allowed[m.text]);
    // Mono and tabular figures existed only to line digits up.
    expect(m.mono, `"${m.text}" should not be set in the mono face`).toBe(false);
  }
  expect(d.strayPercent, "a percentage crept back into a candidate or criterion row").toBe(0);
});
