import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";

// Regression: ISSUE-001, the final CTA threw the reader back to the top
// Found by /qa on 2026-08-20
// Report: .gstack/qa-reports/qa-report-hiregio-2026-08-20.md
test("clicking the final CTA holds the reader's scroll position", async ({ page }) => {
  await page.goto("/index.html");
  const target = await page.evaluate(() => {
    const el = document.getElementById("cta");
    window.scrollTo(0, el.offsetTop);
    return Math.round(window.scrollY);
  });
  expect(target).toBeGreaterThan(1000);

  await page.locator("#cta a.btn").first().click();

  const after = await page.evaluate(() => Math.round(window.scrollY));
  expect(after).toBe(target);
});

// Regression: ISSUE-002, arrowing to a tab past the right edge focused
// something off screen
// Found by /qa on 2026-08-20
test("keyboard tab navigation keeps the focused tab on screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/index.html");

  const result = await page.evaluate(() => {
    const strip = document.querySelector(".tabs");
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    strip.scrollLeft = 0;
    tabs[0].focus();
    for (let i = 0; i < tabs.length - 1; i++) {
      document.activeElement.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
    }
    const f = document.activeElement.getBoundingClientRect();
    const s = strip.getBoundingClientRect();
    return {
      label: document.activeElement.textContent.trim(),
      visible: f.right <= s.right + 1 && f.left >= s.left - 1,
    };
  });

  expect(result.label).toBe("Reports");
  expect(result.visible).toBe(true);
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
