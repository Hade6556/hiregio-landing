import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";

// Regression: ISSUE-001, the final CTA threw the reader back to the top
// Found by /qa on 2026-08-20
// Report: .gstack/qa-reports/qa-report-hiregio-2026-08-20.md
test("clicking the final CTA holds the reader's scroll position", async ({ page }) => {
  await page.goto("/index.html");
  // The page pages in snapped sections, so a programmatic scroll is re-aligned
  // to the nearest snap position a frame or two later. Let it settle before
  // recording where the reader is, or the click is measured against a position
  // the browser had already left.
  const settle = async () => {
    let last = -1;
    for (let i = 0; i < 40; i++) {
      const y = await page.evaluate(() => Math.round(window.scrollY));
      if (y === last) return y;
      last = y;
      await page.waitForTimeout(60);
    }
    return last;
  };

  await page.evaluate(() => document.getElementById("cta").scrollIntoView());
  const target = await settle();
  expect(target).toBeGreaterThan(1000);

  // Dispatched from the page, not driven by the harness. Playwright scrolls a
  // target into view before clicking it and will nudge it clear of the sticky
  // header, and that harness scroll would be measured as if the page had done
  // it. What is under test is the page's own handler.
  await page.evaluate(() => document.querySelector("#cta a.btn").click());
  const after = await settle();

  // The bug was a bare href="#" throwing the reader to the very top.
  expect(after).toBe(target);
});

// Regression: the wave animation used to keep advancing its clock while
// scrolled out of view, so the field teleported on return
test("the wave animation stops while the hero is off screen", async ({ page }) => {
  await page.goto("/index.html");

  const frames = await page.evaluate(async () => {
    const count = () =>
      new Promise((resolve) => {
        let n = 0;
        const orig = window.requestAnimationFrame;
        window.requestAnimationFrame = function (cb) {
          n++;
          return orig(cb);
        };
        setTimeout(() => {
          window.requestAnimationFrame = orig;
          resolve(n);
        }, 700);
      });

    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 500));
    const visible = await count();

    window.scrollTo(0, document.body.scrollHeight - 900);
    await new Promise((r) => setTimeout(r, 500));
    const offScreen = await count();

    return { visible, offScreen };
  });

  expect(frames.visible).toBeGreaterThan(5);
  expect(frames.offScreen).toBe(0);
});

// Regression: a mouse parallax handler mapped the pointer against the canvas
// rect, which drifts as the page scrolls, and swung the camera sideways
test("the wave background carries no mouse reactivity", () => {
  const html = readFileSync("index.html", "utf-8");
  for (const token of ["pointermove", "uMouse", "uParallax", "uEnableMouse"]) {
    expect(html).not.toContain(token);
  }
});

// The page ships as one file to a CSP-restricted host, and the client banned
// these characters outright
test("no banned characters reach the page", () => {
  const html = readFileSync("index.html", "utf-8");
  const banned = /[–—   ​]/;
  expect(banned.test(html)).toBe(false);
});

// Regression: REVIEW-001, rebuilding after a WebGL context loss left the old
// closure's observers and visibility listener alive, so every background and
// foreground cycle on a phone added another render loop against a dead
// context. Measured before the fix: 42, 84, 126 frames per 700ms.
// Found by /review on 2026-08-20
test("a context loss and restore cycle does not leak a render loop", async ({ page }) => {
  await page.goto("/index.html");

  const frames = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const countRaf = () =>
      new Promise((resolve) => {
        let n = 0;
        const orig = window.requestAnimationFrame;
        window.requestAnimationFrame = function (cb) {
          n++;
          return orig(cb);
        };
        setTimeout(() => {
          window.requestAnimationFrame = orig;
          resolve(n);
        }, 700);
      });

    const cycle = async () => {
      const c = document.querySelector('.gw[data-gw="light"] canvas');
      const ext = c.getContext("webgl").getExtension("WEBGL_lose_context");
      ext.loseContext();
      await wait(250);
      ext.restoreContext();
      await wait(800);
      document.dispatchEvent(new Event("visibilitychange"));
      await wait(300);
    };

    window.scrollTo(0, 0);
    await wait(400);
    const before = await countRaf();
    await cycle();
    await cycle();
    const after = await countRaf();
    return { before, after };
  });

  expect(frames.before).toBeGreaterThan(5);
  // two cycles used to triple this; allow slack for timing jitter only
  expect(frames.after).toBeLessThan(frames.before * 1.5);
});

// The page's whole distribution model is that it is ONE file: it gets emailed,
// opened straight off disk, and published to a host that allows no origin but
// Google Fonts. Linking the mascot from assets/ broke all three at once and was
// caught by hand. This is the guard.
test("the page is one self-contained file", async ({ page }) => {
  const html = readFileSync("index.html", "utf-8");

  // Google Fonts is the single permitted origin.
  const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => !u.startsWith("https://fonts.googleapis.com") && !u.startsWith("https://fonts.gstatic.com"));
  expect(external, "external references other than Google Fonts").toEqual([]);

  // Nothing may be pulled from a sibling directory.
  const relative = [...html.matchAll(/url\(["']?(?!data:|https?:|#)([^"')]+)["']?\)/g)].map((m) => m[1]);
  expect(relative, "relative url() references").toEqual([]);
  expect(html).not.toMatch(/(?:src|href)="(?!#|data:|https?:)[^"]+"/);

  await page.goto("/index.html");
  const live = await page.evaluate(() => {
    const img = document.querySelector("img.hero-mascot");
    return {
      present: !!img,
      inlined: !!img && img.getAttribute("src").startsWith("data:"),
      // Explicit intrinsic size, so the second column does not collapse and
      // then jump when the image decodes.
      sized: !!img && !!img.getAttribute("width") && !!img.getAttribute("height"),
      decoded: !!img && img.naturalWidth > 0,
      alt: !!img && img.getAttribute("alt"),
      eager: !!img && img.getAttribute("loading") === "eager",
    };
  });
  expect(live.present, "the mascot is an img now, not a background").toBe(true);
  expect(live.inlined, "mascot.png is the source on disk; the page carries it inline").toBe(true);
  expect(live.sized).toBe(true);
  expect(live.decoded, "the inlined data uri must actually decode").toBe(true);
  expect(live.alt).toBe("mascot waving");
  expect(live.eager, "it is above the fold").toBe(true);
});

// The page felt like it was scrolling at ten frames a second. Measured at
// 1512x945: 26 of 173 frames over 32ms, p95 66.7ms, spikes to 216ms. Removing
// the gradient-waves canvases made every one of them disappear, so the field
// was the whole cost and these tests pin the three things that fixed it.
test.describe("the gradient field cannot get expensive again", () => {
  // Frame timing is the one measurement here that competes with the other
  // workers for the machine. Measured in isolation this suite reads 2 slow
  // frames in 226; under a loaded run it has read 19 in 197, and a control run
  // with an element REMOVED came out worse than the real page, which is proof
  // of contention rather than cost. A retry separates a real regression, which
  // fails every time, from a busy laptop.
  test.describe.configure({ retries: 2 });

  test("only the hero raymarches; the CTA field is painted", async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForTimeout(900);
    const d = await page.evaluate(() => ({
      hosts: document.querySelectorAll(".gw").length,
      canvases: document.querySelectorAll(".gw canvas").length,
      staticHosts: [...document.querySelectorAll(".gw[data-static]")].map((el) => ({
        inCta: !!el.closest("#cta"),
        painted: el.classList.contains("gw-fallback"),
        hasCanvas: !!el.querySelector("canvas"),
      })),
    }));
    // Two full viewport GL layers is one too many. The second one cost a
    // reproducible 133 to 150ms hitch on a section nowhere near it.
    expect(d.hosts, "both fields are still in the markup").toBe(2);
    expect(d.canvases, "exactly one WebGL context on the page").toBe(1);
    expect(d.staticHosts).toHaveLength(1);
    expect(d.staticHosts[0].inCta).toBe(true);
    expect(d.staticHosts[0].painted, "the CTA field falls back to the CSS radial").toBe(true);
    expect(d.staticHosts[0].hasCanvas, "the CTA must not open a context").toBe(false);
  });

  test("the buffer is never larger than one device pixel per css pixel", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 945 });
    await page.goto("/index.html");
    await page.waitForTimeout(1000);
    const d = await page.evaluate(() => {
      const c = document.querySelector(".gw canvas");
      const r = c.getBoundingClientRect();
      return { buffer: c.width * c.height, css: Math.round(r.width) * Math.round(r.height), w: c.width, cssW: Math.round(r.width) };
    });
    // Cost is fragments times raymarch steps, so the buffer scale squares it.
    // At dpr 2 this was 3024x1736 fragments walking 70 steps each.
    expect(d.w, `buffer is ${d.w}px wide for ${d.cssW}css`).toBeLessThanOrEqual(d.cssW);
    expect(d.buffer).toBeLessThanOrEqual(d.css + 1);
  });

  test("an off screen field leaves the layer tree, not just the loop", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 945 });
    await page.goto("/index.html");
    await page.waitForTimeout(900);
    const onTop = await page.evaluate(() => getComputedStyle(document.querySelector(".gw canvas")).visibility);
    await page.evaluate(() => window.scrollTo(0, 6000));
    await page.waitForTimeout(700);
    const scrolledAway = await page.evaluate(() => getComputedStyle(document.querySelector(".gw canvas")).visibility);
    expect(onTop).toBe("visible");
    // A stopped canvas is still a compositor layer holding a full viewport
    // texture, and that alone cost frames on sections nowhere near it.
    expect(scrolledAway, "an idle field must not stay in the layer tree").toBe("hidden");
  });

  test("scrolling does not drop frames", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 945 });
    await page.goto("/index.html");
    await page.waitForTimeout(1300);
    await page.evaluate(() => {
      window.__f = [];
      let last = performance.now();
      const tick = (t) => { window.__f.push(t - last); last = t; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    for (let i = 0; i < 14; i++) {
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(260);
    }
    const d = await page.evaluate(() => {
      const f = window.__f.slice(3);
      const s = [...f].sort((a, b) => a - b);
      return { p95: s[Math.floor(s.length * 0.95)], slow: f.filter((x) => x > 32).length, total: f.length };
    });
    // Measured 1.3% after the fix against 15% before it. The bound is set
    // loose enough to survive a busy machine and tight enough to catch a
    // return to the old cost.
    expect(d.slow / d.total, `${d.slow}/${d.total} frames over 32ms, p95 ${d.p95.toFixed(1)}ms`)
      .toBeLessThan(0.08);
  });
});

// Every mock carried min-width:460px inside an overflow-x:auto scroller, so on
// a 390px screen 50 to 110px of each one sat off the right edge with names cut
// mid word. The page never scrolled sideways, so nothing caught it.
test("every mock fits the phone", async ({ page }) => {
  for (const width of [320, 360, 390, 414, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/index.html");
    await page.waitForTimeout(600);
    const d = await page.evaluate(() => {
      const over = [];
      document.querySelectorAll(".mock").forEach((m) => {
        const sc = m.closest(".scroller");
        const avail = sc ? sc.clientWidth : m.parentElement.clientWidth;
        if (m.scrollWidth > avail + 1) {
          over.push(`${(m.querySelector(".mock-head b") || {}).textContent || "?"} by ${Math.round(m.scrollWidth - avail)}px`);
        }
      });
      return {
        over,
        stillScrolling: [...document.querySelectorAll(".scroller")].filter((s) => s.scrollWidth > s.clientWidth + 1).length,
      };
    });
    expect(d.over, `mocks running off the edge at ${width}px`).toEqual([]);
    expect(d.stillScrolling, `scrollers still holding hidden content at ${width}px`).toBe(0);
  }
});

// The page had no viewport meta and no doctype, and nothing in this suite could
// see it: every other test sets the layout viewport directly with
// setViewportSize, which is precisely the thing a missing viewport meta breaks.
// Measured on a real iPhone 12 profile before the fix: layout width 980 against
// a 390pt device, visualViewport.scale 0.398, document.compatMode "BackCompat",
// and matchMedia("(max-width:640px)") false. Every phone rule in the stylesheet
// was dead code and the desktop layout was being shrunk to 40%.
//
// These use a real device profile on purpose. Do not rewrite them to use
// setViewportSize; that is what hid the bug for so long.
test.describe("the page has a phone layout at all", () => {
  // The mobile viewport properties only, not a whole device profile: spreading
  // devices["iPhone 12"] drags defaultBrowserType in, which cannot be set
  // inside a describe. isMobile is the one that matters here, because it is
  // what makes the browser honour the viewport meta the way a phone does.
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test("the layout viewport is the device, not 980px", async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForTimeout(700);
    const d = await page.evaluate(() => ({
      layout: document.documentElement.clientWidth,
      scale: window.visualViewport ? +window.visualViewport.scale.toFixed(2) : 1,
      mode: document.compatMode,
      phone: window.matchMedia("(max-width:640px)").matches,
      gutter: getComputedStyle(document.documentElement).getPropertyValue("--gutter").trim(),
      nav: getComputedStyle(document.documentElement).getPropertyValue("--nav-h").trim(),
    }));
    expect(d.layout, "layout viewport").toBeLessThanOrEqual(420);
    expect(d.scale, "the browser must not be shrinking the page to fit").toBe(1);
    expect(d.mode, "no doctype puts the document in quirks mode").toBe("CSS1Compat");
    expect(d.phone, "the phone media query has to actually match").toBe(true);
    expect(d.gutter).toBe("20px");
    expect(d.nav).toBe("67px");
  });

  test("the head declares the doctype and the viewport", async () => {
    const html = readFileSync("index.html", "utf-8");
    expect(html.slice(0, 200).toLowerCase(), "doctype must be first").toContain("<!doctype html>");
    expect(html).toMatch(/<meta\s+name="viewport"\s+content="[^"]*width=device-width/i);
    expect(html).toMatch(/<meta\s+charset=/i);
  });

  test("the phone renders the phone hero, not the desktop one shrunk", async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForTimeout(900);
    const d = await page.evaluate(() => {
      const cs = (q) => getComputedStyle(document.querySelector(q));
      const r = (q) => document.querySelector(q).getBoundingClientRect();
      return {
        stacked: cs(".hero-main").gridTemplateColumns === "none",
        buttonsStack: cs(".hero .btn-row").flexDirection === "column",
        payoff: Math.round(parseFloat(cs(".h1-payoff").fontSize)),
        mascotBelowButtons: r("img.hero-mascot").top > r(".hero .btn-row").bottom,
      };
    });
    expect(d.stacked).toBe(true);
    expect(d.buttonsStack).toBe(true);
    expect(d.payoff, "the phone type scale is live").toBeGreaterThanOrEqual(40);
    expect(d.mascotBelowButtons).toBe(true);
  });
});

// --ink-3 is ink at 62%, written for a cream ground. Inherited onto --dark it
// composited to rgb(20,27,26) on rgb(15,31,25): 1.02:1, invisible, at every
// width and not only on phones.
test("nothing on the dark section is invisible", async ({ page }) => {
  await page.goto("/index.html");
  await page.waitForTimeout(600);
  const worst = await page.evaluate(() => {
    const chan = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = (rgb) => { const [r, g, b] = rgb; return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b); };
    const parse = (c) => { const n = c.match(/[\d.]+/g).map(Number); return { rgb: n.slice(0, 3), a: n.length > 3 ? n[3] : 1 }; };
    // Each element against its OWN ground, walking up until something paints.
    // A .btn-light carries a white background of its own and is not sitting on
    // the section's dark.
    const groundOf = (el) => {
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c.a > 0.99) return c.rgb;
      }
      return [255, 255, 255];
    };
    let low = { ratio: 99, what: "" };
    document.querySelectorAll("#cta .eyebrow, #cta .h2, #cta .lead, #cta .btn").forEach((el) => {
      const bg = groundOf(el);
      const f = parse(getComputedStyle(el).color);
      const mixed = f.rgb.map((v, i) => v * f.a + bg[i] * (1 - f.a));
      const l1 = lum(mixed), l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (ratio < low.ratio) low = { ratio: +ratio.toFixed(2), what: el.className || el.tagName };
    });
    return low;
  });
  expect(worst.ratio, `lowest contrast on the dark section is ${worst.what} at ${worst.ratio}:1`)
    .toBeGreaterThanOrEqual(4.5);
});
