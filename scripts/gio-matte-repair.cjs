/**
 * gio-matte-repair.cjs  --  STRATEGY A: repair the matte, keep the render.
 *
 * The old keyer flood-fills the background at luminance <= 8. That fails because
 * on this render luminance is NOT the signal that separates subject from backdrop:
 *   true background   mean lum 0.3   local sigma p50 0.00   (dead flat)
 *   between the legs  mean lum 1.5   local sigma p50 0.07   (dead flat)
 *   the boots         mean lum 21.5  local sigma p50 2.97   (grainy material)
 *   the sunglasses    mean lum  9.1  local sigma p50 0.79   (grainy material)
 * The render was made with per-material surface grain and a mathematically flat
 * black backdrop, so LOCAL VARIANCE separates them perfectly where luminance
 * cannot. We key on sigma, use luminance only as a second vote, then repair the
 * silhouette topologically (largest component + unconditional hole fill +
 * closing), and finally decontaminate every partial pixel by pushing the
 * interior colour outward so no black backdrop survives into the fringe.
 *
 * Usage:  node scripts/gio-matte-repair.cjs [--diag]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT_DIR = '.design-audit/gio';
const NAME = 'matte-repair';
const DIAG = process.argv.includes('--diag');

// ---- tuning -------------------------------------------------------------
const P = {
  sigmaR:    3,     // radius of the local-variance window (7x7)
  sigmaT:    0.55,  // sigma above this = material.  flat backdrop tops out at 0.50
  lumT:      12,    // luminance above this = material regardless of sigma
  lumFloor:  2.1,   // the variance window halos ~sigmaR px past every edge, so
                    // luminance -- not variance -- is what places the edge.
                    // true backdrop maxes at 1.0, between-the-legs at 2.4.
  relR:      2,     // radius for the local gradient = "is there a real edge
                    // here".  (an experiment that RAISED the luminance gate near
                    //  bright pixels is deliberately absent: it ate the black
                    //  inner faces of the boots, which sit next to a lit sole.)
  smoothR:   8,     // where the source has NO edge to pin the contour to, the
  smoothConf: 5.0,  // contour is invented -- so make it a smooth invention
                    // instead of a wiggly one.  real edges keep their exact
                    // shape; only boundaries drawn through featureless black
                    // (inner boot faces, the counter, under the crossbar) get
                    // regularised with a wide majority vote.
  closeR:    2.6,   // morphological closing radius (smooths staircases)
  openR:     1.4,   // morphological opening radius (kills hairs + speckle)
  majorityR: 2,     // contour regulariser: majority vote in a (2r+1)^2 window
  aaLo:      0.26,  // coverage -> alpha ramp.  a straight edge lands on
  aaHi:      0.74,  // 0.25/0.75 and stays hard; curves and diagonals get AA.
                    // (tried blending in the render's own luminance falloff as
                    // the edge alpha.  it is sub-pixel accurate, but it costs a
                    // ~3px soft band -> 3.14% fringe for a defect that is
                    // already sub-pixel once the browser scales 420px down to
                    // 200.  not worth 3x the halo.  kept geometric.)
  shadowScanFrom: 690, // only look for the sole line below here
  soleLum:   28,    // "this row still contains lit boot sole"
  soleMin:   18,    // ...at least this many pixels of it
  cutFeather: 5,    // px of ramp on the bottom cut, so it is not a razor line
  bleed:     4      // px of colour pushed out past the opaque core
};

// env overrides, for sweeping: RELCAP=6 node scripts/gio-matte-repair.cjs
for (const k of Object.keys(P)) if (process.env[k.toUpperCase()] !== undefined) P[k] = +process.env[k.toUpperCase()];
const SUFFIX = process.env.SUFFIX || '';

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => { if (DIAG) console.log('  [page]', m.text()); });
  const srcB64 = fs.readFileSync('.design-audit/gio-src.png').toString('base64');
  await page.setContent('<canvas id=c></canvas>');

  const result = await page.evaluate(async ({ srcB64, P, DIAG }) => {
    const INF = 1e20;
    // ---------- exact euclidean distance transform (Felzenszwalb / tiny-sdf) ----
    function edt1d(f, d, v, z, n) {
      v[0] = 0; z[0] = -INF; z[1] = INF;
      for (let q = 1, k = 0, s = 0; q < n; q++) {
        do { const r = v[k]; s = (f[q] - f[r] + q * q - r * r) / (q - r) / 2; }
        while (s <= z[k] && --k > -1);
        k++; v[k] = q; z[k] = s; z[k + 1] = INF;
      }
      for (let q = 0, k = 0; q < n; q++) {
        while (z[k + 1] < q) k++;
        const r = v[k]; d[q] = (q - r) * (q - r) + f[r];
      }
    }
    // squared distance from every pixel to the nearest pixel where set[i] === 1
    function edt(set, W, H) {
      const n = Math.max(W, H);
      const f = new Float64Array(n), dd = new Float64Array(n);
      const v = new Int32Array(n), z = new Float64Array(n + 1);
      const g = new Float64Array(W * H);
      for (let i = 0; i < W * H; i++) g[i] = set[i] ? 0 : INF;
      for (let x = 0; x < W; x++) {
        for (let y = 0; y < H; y++) f[y] = g[y * W + x];
        edt1d(f, dd, v, z, H);
        for (let y = 0; y < H; y++) g[y * W + x] = dd[y];
      }
      for (let y = 0; y < H; y++) {
        const o = y * W;
        for (let x = 0; x < W; x++) f[x] = g[o + x];
        edt1d(f, dd, v, z, W);
        for (let x = 0; x < W; x++) g[o + x] = dd[x];
      }
      return g;
    }
    const dilate = (m, r, W, H) => { const d = edt(m, W, H), o = new Uint8Array(W * H), rr = r * r;
      for (let i = 0; i < o.length; i++) o[i] = d[i] <= rr ? 1 : 0; return o; };
    const erode = (m, r, W, H) => { const inv = new Uint8Array(W * H);
      for (let i = 0; i < inv.length; i++) inv[i] = m[i] ? 0 : 1;
      const d = edt(inv, W, H), o = new Uint8Array(W * H), rr = r * r;
      for (let i = 0; i < o.length; i++) o[i] = (m[i] && d[i] > rr) ? 1 : 0; return o; };
    const close = (m, r, W, H) => erode(dilate(m, r, W, H), r, W, H);
    const open  = (m, r, W, H) => dilate(erode(m, r, W, H), r, W, H);

    // majority vote in a (2r+1)^2 window -- a contour regulariser
    function majority(m, r, W, H) {
      const S = new Int32Array((W + 1) * (H + 1));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y + 1) * (W + 1) + (x + 1);
        S[i] = m[y * W + x] + S[i - 1] + S[i - (W + 1)] - S[i - 1 - (W + 1)];
      }
      const o = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W - 1, x + r), y1 = Math.min(H - 1, y + r);
        const n = (x1 - x0 + 1) * (y1 - y0 + 1);
        const c = S[(y1 + 1) * (W + 1) + (x1 + 1)] - S[y0 * (W + 1) + (x1 + 1)] - S[(y1 + 1) * (W + 1) + x0] + S[y0 * (W + 1) + x0];
        o[y * W + x] = c * 2 > n ? 1 : 0;
      }
      return o;
    }
    // ---------- connected components -----------------------------------------
    function largestComponent(m, W, H) {
      const lab = new Int32Array(W * H).fill(-1);
      const st = new Int32Array(W * H);
      let best = -1, bestSize = 0, id = 0, sizes = [];
      for (let s = 0; s < W * H; s++) {
        if (!m[s] || lab[s] >= 0) continue;
        let sp = 0, size = 0; st[sp++] = s; lab[s] = id;
        while (sp) {
          const k = st[--sp]; size++;
          const x = k % W, y = (k / W) | 0;
          if (x > 0     && m[k - 1] && lab[k - 1] < 0) { lab[k - 1] = id; st[sp++] = k - 1; }
          if (x < W - 1 && m[k + 1] && lab[k + 1] < 0) { lab[k + 1] = id; st[sp++] = k + 1; }
          if (y > 0     && m[k - W] && lab[k - W] < 0) { lab[k - W] = id; st[sp++] = k - W; }
          if (y < H - 1 && m[k + W] && lab[k + W] < 0) { lab[k + W] = id; st[sp++] = k + W; }
        }
        sizes.push(size);
        if (size > bestSize) { bestSize = size; best = id; }
        id++;
      }
      const o = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) o[i] = lab[i] === best ? 1 : 0;
      return { mask: o, kept: bestSize, dropped: sizes.length - 1,
               droppedPx: sizes.reduce((a, b) => a + b, 0) - bestSize };
    }
    // every 0-region not touching the frame border becomes 1
    function fillHoles(m, W, H) {
      const seen = new Uint8Array(W * H), st = new Int32Array(W * H);
      let sp = 0;
      const push = k => { if (!m[k] && !seen[k]) { seen[k] = 1; st[sp++] = k; } };
      for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
      for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
      while (sp) {
        const k = st[--sp], x = k % W, y = (k / W) | 0;
        if (x > 0)     push(k - 1);
        if (x < W - 1) push(k + 1);
        if (y > 0)     push(k - W);
        if (y < H - 1) push(k + W);
      }
      let filled = 0;
      for (let i = 0; i < W * H; i++) if (!m[i] && !seen[i]) { m[i] = 1; filled++; }
      return filled;
    }

    // ---------- load ----------------------------------------------------------
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + srcB64; });
    const W = img.width, H = img.height, N = W * H;
    const c = document.getElementById('c'); c.width = W; c.height = H;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const im = cx.getImageData(0, 0, W, H), d = im.data;

    const lum = new Float32Array(N);
    for (let i = 0, k = 0; i < d.length; i += 4, k++) lum[k] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

    // ---------- local sigma via integral images -------------------------------
    const S1 = new Float64Array((W + 1) * (H + 1)), S2 = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = lum[y * W + x], i = (y + 1) * (W + 1) + (x + 1);
      S1[i] = v + S1[i - 1] + S1[i - (W + 1)] - S1[i - 1 - (W + 1)];
      S2[i] = v * v + S2[i - 1] + S2[i - (W + 1)] - S2[i - 1 - (W + 1)];
    }
    const rect = (S, x0, y0, x1, y1) =>
      S[(y1 + 1) * (W + 1) + (x1 + 1)] - S[y0 * (W + 1) + (x1 + 1)] - S[(y1 + 1) * (W + 1) + x0] + S[y0 * (W + 1) + x0];
    const R = P.sigmaR, sig = new Float32Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - R), y0 = Math.max(0, y - R), x1 = Math.min(W - 1, x + R), y1 = Math.min(H - 1, y + R);
      const n = (x1 - x0 + 1) * (y1 - y0 + 1);
      const m = rect(S1, x0, y0, x1, y1) / n;
      sig[y * W + x] = Math.sqrt(Math.max(0, rect(S2, x0, y0, x1, y1) / n - m * m));
    }

    // local peak luminance (separable sliding max) + a 3x3 tent smooth of lum
    const localMax = (a, r) => {
      const t = new Float32Array(N), o = new Float32Array(N);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let mx = 0; const x0 = Math.max(0, x - r), x1 = Math.min(W - 1, x + r);
        for (let i = x0; i <= x1; i++) { const v = a[y * W + i]; if (v > mx) mx = v; }
        t[y * W + x] = mx;
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let mx = 0; const y0 = Math.max(0, y - r), y1 = Math.min(H - 1, y + r);
        for (let i = y0; i <= y1; i++) { const v = t[i * W + x]; if (v > mx) mx = v; }
        o[y * W + x] = mx;
      }
      return o;
    };
    const lumS = new Float32Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = Math.min(W - 1, Math.max(0, x + dx)), ny = Math.min(H - 1, Math.max(0, y + dy));
        acc += lum[ny * W + nx] * (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
      }
      lumS[y * W + x] = acc / 16;
    }
    const grad = new Float32Array(N);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const k = y * W + x;
      const gx = lumS[k + 1] - lumS[k - 1], gy = lumS[k + W] - lumS[k - W];
      grad[k] = 0.5 * Math.sqrt(gx * gx + gy * gy);
    }
    const steep = localMax(grad, P.relR);

    // ---------- the matte -----------------------------------------------------
    // vote 1: material grain.  vote 2: anything actually bright.
    // gate: luminance must clear the backdrop, because the sigma window halos
    // ~sigmaR px past every edge and would otherwise fatten the silhouette.
    const m0 = new Uint8Array(N);
    for (let k = 0; k < N; k++)
      m0[k] = ((sig[k] > P.sigmaT || lum[k] > P.lumT) && lumS[k] > P.lumFloor) ? 1 : 0;

    const steps = [];
    const snap = (label, m) => { let n = 0; for (let i = 0; i < N; i++) n += m[i]; steps.push(label + ' ' + n); };
    snap('raw', m0);

    // 1. one object.  every grain speck floating in the backdrop dies here.
    let lc = largestComponent(m0, W, H);
    let m = lc.mask; snap('largestComponent', m);
    const dropped = { blobs: lc.dropped, px: lc.droppedPx };

    // 2. nothing may be punched through the character.  the G's counter is
    //    border-connected (verified) so this cannot close it.
    const holes1 = fillHoles(m, W, H); snap('fillHoles', m);

    // 3. smooth the silhouette: close the pits the grain threshold left in the
    //    boot soles and the lens bridge, then shave the hairs it grew, then
    //    regularise the contour with a majority vote so no 1px staircase
    //    survives to read as a chewed edge.
    m = close(m, P.closeR, W, H); snap('close', m);
    const holes2 = fillHoles(m, W, H);
    m = open(m, P.openR, W, H); snap('open', m);
    m = majority(m, P.majorityR, W, H); snap('majority', m);
    const mBig = majority(m, P.smoothR, W, H);
    let invented = 0;
    for (let k = 0; k < N; k++) if (steep[k] < P.smoothConf && m[k] !== mBig[k]) { m[k] = mBig[k]; invented++; }
    m = majority(m, 1, W, H); snap('regularise', m);
    steps.push('inventedPx ' + invented);
    lc = largestComponent(m, W, H); m = lc.mask;
    const holes3 = fillHoles(m, W, H); snap('final', m);

    // 4. the sole line.  the contact shadow fades continuously into the backdrop
    //    so nothing separates it -- it can only be cut.  the last row that still
    //    carries lit sole leather is the place to do it, with a short ramp so the
    //    cut is not a razor edge.
    let sole = H - 1;
    for (let y = H - 1; y > P.shadowScanFrom; y--) {
      let lit = 0;
      for (let x = 0; x < W; x++) { const k = y * W + x; if (m[k] && lum[k] > P.soleLum) lit++; }
      if (lit >= P.soleMin) { sole = y; break; }
    }
    // opaque all the way through the last row of lit sole; the ramp is spent
    // only on the shadow underneath it, so the boot itself never goes grey.
    const cutY = Math.min(H - 1, sole + P.cutFeather);
    const cutRamp = new Float32Array(H).fill(1);
    for (let y = sole + 1; y < H; y++) cutRamp[y] = Math.max(0, (cutY - y) / (cutY - sole));
    for (let y = cutY + 1; y < H; y++) for (let x = 0; x < W; x++) m[y * W + x] = 0;
    steps.push('sole ' + sole + ' cutY ' + cutY);

    // ---------- alpha ---------------------------------------------------------
    // geometric coverage off the regularised mask, via a 3x3 tent.  a straight
    // edge lands on 0.25/0.75 and is remapped back to hard; curves and diagonals
    // -- which is most of this silhouette -- get real anti-aliasing.  spending
    // alpha only where the eye needs it keeps the halo budget at ~1%.
    const cov = new Float32Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = Math.min(W - 1, Math.max(0, x + dx)), ny = Math.min(H - 1, Math.max(0, y + dy));
        s += m[ny * W + nx] * (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
      }
      cov[y * W + x] = s / 16;
    }
    const alpha = new Float32Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x;
      alpha[k] = Math.min(1, Math.max(0, (cov[k] - P.aaLo) / (P.aaHi - P.aaLo))) * cutRamp[y];
    }
    // hard guarantee: no fully-transparent region may be enclosed by the
    // character.  (the AA blend can strand a pixel; topology must not depend
    // on tuning.)
    {
      const t = new Uint8Array(N);
      for (let k = 0; k < N; k++) t[k] = alpha[k] > 8 / 255 ? 1 : 0;
      const filled = fillHoles(t, W, H);
      if (filled) for (let k = 0; k < N; k++) if (t[k] && alpha[k] <= 8 / 255) alpha[k] = cutRamp[(k / W) | 0];
      steps.push('alphaHolesFilled ' + filled);
    }

    // ---------- decontaminate: push interior colour out over every soft pixel --
    // partial pixels currently carry the BLACK backdrop premultiplied into them.
    // replace their RGB with the nearest solid render colour, so on a cream page
    // a 50% pixel reads as 50% of Gio, not 50% of the void he was shot against.
    const solid = new Uint8Array(N);
    for (let k = 0; k < N; k++) solid[k] = (m[k] && cov[k] > 0.97 && alpha[k] > 0.97) ? 1 : 0;
    const dSolid = edt(solid, W, H);
    const rgb = new Float32Array(N * 3), have = new Uint8Array(N);
    for (let k = 0; k < N; k++) if (solid[k]) {
      have[k] = 1; rgb[k * 3] = d[k * 4]; rgb[k * 3 + 1] = d[k * 4 + 1]; rgb[k * 3 + 2] = d[k * 4 + 2];
    }
    const need = new Uint8Array(N);
    const bleedR2 = (P.bleed + 1) * (P.bleed + 1);
    for (let k = 0; k < N; k++) need[k] = (!have[k] && dSolid[k] <= bleedR2) ? 1 : 0;
    for (let pass = 0; pass < P.bleed + 3; pass++) {
      const add = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (have[k] || !need[k]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nk = ny * W + nx;
          if (!have[nk]) continue;
          r += rgb[nk * 3]; g += rgb[nk * 3 + 1]; b += rgb[nk * 3 + 2]; n++;
        }
        if (n) add.push(k, r / n, g / n, b / n);
      }
      if (!add.length) break;
      for (let i = 0; i < add.length; i += 4) {
        const k = add[i]; have[k] = 1;
        rgb[k * 3] = add[i + 1]; rgb[k * 3 + 1] = add[i + 2]; rgb[k * 3 + 2] = add[i + 3];
      }
    }
    const core = solid;

    // ---------- write back ----------------------------------------------------
    for (let k = 0; k < N; k++) {
      const i = k * 4;
      if (have[k] && !core[k]) { d[i] = Math.round(rgb[k * 3]); d[i + 1] = Math.round(rgb[k * 3 + 1]); d[i + 2] = Math.round(rgb[k * 3 + 2]); }
      else if (!have[k]) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; }
      d[i + 3] = Math.round(alpha[k] * 255);
    }
    cx.putImageData(im, 0, 0);

    // ---------- crop to the alpha bbox ---------------------------------------
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > 8) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    const tw = maxX - minX + 1, th = maxY - minY + 1;
    const t = document.createElement('canvas'); t.width = tw; t.height = th;
    const tc = t.getContext('2d', { willReadFrequently: true });
    tc.drawImage(c, minX, minY, tw, th, 0, 0, tw, th);

    // ---------- diag: the two masks side by side ------------------------------
    let diagPng = null, zoomPng = null;
    if (DIAG) {
      const dg = document.createElement('canvas'); dg.width = W * 3; dg.height = H;
      const gc = dg.getContext('2d');
      gc.fillStyle = '#101014'; gc.fillRect(0, 0, dg.width, dg.height);
      const paint = (ox, fn) => {
        const id = gc.createImageData(W, H);
        for (let k = 0; k < N; k++) { const v = fn(k); id.data[k*4]=v[0]; id.data[k*4+1]=v[1]; id.data[k*4+2]=v[2]; id.data[k*4+3]=255; }
        gc.putImageData(id, ox, 0);
      };
      paint(0, k => { const v = Math.min(255, sig[k] * 40); return [v, v, v]; });
      paint(W, k => m[k] ? [255,255,255] : [0,0,0]);
      paint(W*2, k => { const a = alpha[k]; return [255*(1-a) + d[k*4]*a, 0*(1-a) + d[k*4+1]*a, 255*(1-a) + d[k*4+2]*a]; });
      diagPng = dg.toDataURL('image/png');
      const zy = 620, zh = H - zy;
      const zc = document.createElement('canvas'); zc.width = W * 2 * 2; zc.height = zh * 2;
      const zg = zc.getContext('2d'); zg.imageSmoothingEnabled = false;
      const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = zh;
      const tg = tmp.getContext('2d');
      const mk = tg.createImageData(W, zh);
      for (let y = 0; y < zh; y++) for (let x = 0; x < W; x++) {
        const k = (y + zy) * W + x, j = (y * W + x) * 4, v = m[k] ? 255 : 0;
        mk.data[j] = v; mk.data[j+1] = v; mk.data[j+2] = v; mk.data[j+3] = 255;
      }
      tg.putImageData(mk, 0, 0);
      zg.drawImage(tmp, 0, 0, W * 2, zh * 2);
      const al = tg.createImageData(W, zh);
      for (let y = 0; y < zh; y++) for (let x = 0; x < W; x++) {
        const k = (y + zy) * W + x, j = (y * W + x) * 4, a = alpha[k];
        al.data[j] = 255*(1-a) + d[k*4]*a; al.data[j+1] = 0*(1-a) + d[k*4+1]*a; al.data[j+2] = 255*(1-a) + d[k*4+2]*a; al.data[j+3] = 255;
      }
      tg.putImageData(al, 0, 0);
      zg.drawImage(tmp, W * 2, 0, W * 2, zh * 2);
      zoomPng = zc.toDataURL('image/png');
    }

    return {
      png: t.toDataURL('image/png'), webp: t.toDataURL('image/webp', 0.92),
      tw, th, srcW: W, srcH: H, crop: { minX, minY, maxX, maxY },
      steps, dropped, holesFilled: holes1 + holes2 + holes3, diagPng, zoomPng
    };
  }, { srcB64, P, DIAG });

  const assetPath = path.join(OUT_DIR, NAME + SUFFIX + '.png');
  fs.writeFileSync(assetPath, Buffer.from(result.png.split(',')[1], 'base64'));
  const webpBytes = Buffer.from(result.webp.split(',')[1], 'base64').length;
  if (result.diagPng) fs.writeFileSync(process.env.SCRATCH + '/diag.png', Buffer.from(result.diagPng.split(',')[1], 'base64'));
  if (result.zoomPng) fs.writeFileSync(process.env.SCRATCH + '/zoom.png', Buffer.from(result.zoomPng.split(',')[1], 'base64'));

  console.log('mask steps :', result.steps.join('  ->  '));
  console.log('dropped    :', result.dropped.blobs, 'stray blobs,', result.dropped.px, 'px');
  console.log('holes fill :', result.holesFilled, 'px');
  console.log('output     :', result.tw + 'x' + result.th, '  png', (fs.statSync(assetPath).size / 1024).toFixed(0) + 'KB',
              '  webp@0.92', (webpBytes / 1024).toFixed(1) + 'KB');

  // ---------- measure, same method as the audit ------------------------------
  const measure = async (file) => page.evaluate(async (b64) => {
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b64; });
    const W = img.width, H = img.height;
    const c = document.getElementById('c'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.clearRect(0, 0, W, H); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, W, H).data;
    let semi = 0, opaque = 0, clear = 0;
    for (let i = 3; i < d.length; i += 4) { const a = d[i]; if (a <= 8) clear++; else if (a >= 250) opaque++; else semi++; }
    const seen = new Uint8Array(W * H), st = [];
    for (let xx = 0; xx < W; xx++) st.push(xx, 0, xx, H - 1);
    for (let yy = 0; yy < H; yy++) st.push(0, yy, W - 1, yy);
    while (st.length) { const y = st.pop(), xx = st.pop();
      if (xx < 0 || y < 0 || xx >= W || y >= H) continue;
      const k = y * W + xx; if (seen[k] || d[k * 4 + 3] > 8) continue; seen[k] = 1;
      st.push(xx + 1, y, xx - 1, y, xx, y + 1, xx, y - 1); }
    let holes = 0;
    for (let k = 0; k < W * H; k++) if (d[k * 4 + 3] <= 8 && !seen[k]) holes++;
    return { W, H, interiorHoles: holes, semi, opaque, clear, fringePct: +(100 * semi / (W * H)).toFixed(2) };
  }, fs.readFileSync(file).toString('base64'));

  const mine = await measure(assetPath);
  const now  = await measure('assets/gio.png');
  console.log('\n            interiorHoles  fringePct  semiPx   dims');
  console.log('now       :', String(now.interiorHoles).padStart(9), String(now.fringePct).padStart(10), String(now.semi).padStart(8), ' ', now.W + 'x' + now.H);
  console.log('matte-rep :', String(mine.interiorHoles).padStart(9), String(mine.fringePct).padStart(10), String(mine.semi).padStart(8), ' ', mine.W + 'x' + mine.H);

  fs.writeFileSync(path.join(OUT_DIR, NAME + SUFFIX + '-stats.json'), JSON.stringify({ mine, now, crop: result.crop, srcW: result.srcW, srcH: result.srcH, webpBytes, webpKB: +(webpBytes / 1024).toFixed(1), dims: mine.W + 'x' + mine.H }, null, 2));

  // ---------- proof sheet ----------------------------------------------------
  const GROUND = '#FBFAF7';
  const mineB64 = fs.readFileSync(assetPath).toString('base64');
  const nowB64  = fs.readFileSync('assets/gio.png').toString('base64');
  const proof = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  await proof.setContent(`
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1400px;height:900px;background:${GROUND};font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#17191B;display:flex;overflow:hidden}
  .p{position:relative;height:900px;border-right:1px solid #E5E2DA;display:flex;flex-direction:column}
  .p:last-child{border-right:0}
  .cap{padding:14px 16px 0;letter-spacing:.06em;text-transform:uppercase;font-size:11px;font-weight:600;color:#17191B}
  .sub{padding:3px 16px 0;font-size:11px;color:rgba(23,25,27,.62);line-height:1.45}
  .stage{flex:1;display:flex;align-items:flex-end;justify-content:center;padding:12px 16px 30px}
  .mag{background:#FF00FF}
  .tag{position:absolute;bottom:9px;font-size:11px;color:rgba(23,25,27,.62)}
  img{display:block;image-rendering:auto}
</style>
<div class="p" style="width:228px">
  <div class="cap">As shipped on the page</div>
  <div class="sub">200px wide, cream ${GROUND}</div>
  <div class="stage"><img src="data:image/png;base64,${mineB64}" style="width:200px"></div>
  <div class="tag" style="left:16px">200 &times; ${Math.round(200 * mine.H / mine.W)}</div>
</div>
<div class="p" style="width:380px">
  <div class="cap">1:1</div>
  <div class="sub">native ${mine.W}&times;${mine.H}, shown at ${(Math.min(1, 348 / mine.W, 795 / mine.H) * 100).toFixed(0)}%</div>
  <div class="stage"><img src="data:image/png;base64,${mineB64}" style="width:${Math.round(mine.W * Math.min(1, 348 / mine.W, 795 / mine.H))}px"></div>
</div>
<div class="p mag" style="width:330px">
  <div class="cap" style="background:${GROUND};margin:0;padding:14px 16px 6px">Matte over #FF00FF</div>
  <div class="stage" style="padding-bottom:34px"><img src="data:image/png;base64,${mineB64}" style="width:${Math.round(mine.W * Math.min(1, 298 / mine.W, 782 / mine.H))}px"></div>
  <div class="tag" style="left:16px;color:#17191B;background:#FF00FF;padding:2px 4px">${mine.interiorHoles} interior holes &middot; ${mine.fringePct}% fringe</div>
</div>
<div class="p" style="width:462px">
  <div class="cap">Side by side</div>
  <div class="sub">both 200px on cream</div>
  <div class="stage" style="gap:22px;justify-content:center">
    <div style="text-align:center"><img src="data:image/png;base64,${nowB64}" style="width:200px"><div style="padding-top:8px;color:rgba(23,25,27,.62)">now &mdash; ${now.interiorHoles} holes, ${now.fringePct}% fringe</div></div>
    <div style="text-align:center"><img src="data:image/png;base64,${mineB64}" style="width:200px"><div style="padding-top:8px;color:rgba(23,25,27,.62)">yours &mdash; ${mine.interiorHoles} holes, ${mine.fringePct}% fringe</div></div>
  </div>
</div>`);
  await proof.screenshot({ path: path.join(OUT_DIR, NAME + SUFFIX + '-proof.png') });
  console.log('\nproof     : ' + path.join(OUT_DIR, NAME + SUFFIX + '-proof.png'));
  await browser.close();
})();
