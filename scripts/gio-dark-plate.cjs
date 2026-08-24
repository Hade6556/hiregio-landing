/* ------------------------------------------------------------------------
   STRATEGY C - DARK PLATE.  Do not key Gio at all.

   The render was lit for black. Every artefact in the current asset comes
   from tearing it off black. So we keep the source pixels byte-exact and
   change the GROUND instead: he stands in a --dark alcove in the corner of
   the cream hero.

   The one real problem this creates is the seam. #0F1F19 is not #000, so
   pasting the render's rectangle onto the plate shows a rectangle. The fix
   is not a key, it is a crossfade:

       out = mix(PLATE, SOURCE, g)

   where g is a heavily blurred, dilated hull of the figure. Over the figure
   g == 1, so the render is reproduced pixel for pixel, black and all. Away
   from him g == 0, so the plate is exactly --dark. In between, the render's
   own black fades into --dark over ~15 CSS px. g never has a hard edge, so
   there is nothing to chew, nothing to hole, and nothing to fringe: the
   accuracy of the hull is irrelevant, only its smoothness matters.

   The same field doubles as an alpha channel for the CTA variant, where the
   ground is already dark and the asset only has to darken it.
------------------------------------------------------------------------ */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, '.design-audit/gio');

// --- palette, lifted from index.html ---------------------------------------
const PAL = {
  bg:'#FBFAF7', bgAlt:'#F3F1EC', surface:'#FFFFFF', ink:'#17191B',
  ink2:'rgba(23,25,27,0.68)', ink3:'rgba(23,25,27,0.62)',
  line:'#E5E2DA', accent:'#1E6B4E', accentHi:'#17553E', accentBg:'#EAF2ED',
  dark:'#0F1F19',
};

// --- plate geometry --------------------------------------------------------
const PW = 400, PH = 612;      // 2x of the real 200 x 306 CSS box
const R_TOP = 36;              // --r-card 18px at 2x. bottom corners are square:
                               // the plate stands on the pane-foot rule.
const FIG_H     = 560;         // boot-bottom to head-top, in plate px. The
                               // baseline is derived: the render's own contact
                               // shadow is what meets the plate's bottom edge.
const DILATE    = 13;          // px the black pool extends past the silhouette
const BLUR      = 24;          // px of falloff from that pool out to --dark
const EDGE_KEEP = 26;          // px of guaranteed pure --dark around the rim

const b64 = fs.readFileSync(path.join(ROOT, '.design-audit/gio-src.png')).toString('base64');
const nowB64 = fs.readFileSync(path.join(ROOT, 'assets/gio.png')).toString('base64');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  await page.setContent('<body style="margin:0"><canvas id=c></canvas></body>');

  const built = await page.evaluate(async (A) => {
    const { b64, PW, PH, R_TOP, FIG_H, DILATE, BLUR, EDGE_KEEP, PAL } = A;

    const load = (u) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; });
    const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const hex = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];

    const img = await load('data:image/png;base64,' + b64);
    const W = img.width, H = img.height;
    const sc = cv(W, H), sx = sc.getContext('2d');
    sx.drawImage(img, 0, 0);
    const sd = sx.getImageData(0, 0, W, H).data;

    const lum = new Float32Array(W * H);
    for (let i = 0, k = 0; i < sd.length; i += 4, k++) lum[k] = 0.299*sd[i] + 0.587*sd[i+1] + 0.114*sd[i+2];

    // ---- 1. figure metrics ------------------------------------------------
    // A row's span is the first and last pixel over 5 that has a neighbour
    // over 5, so a single hot dust pixel cannot widen the hull.
    const spanL = new Int32Array(H).fill(-1), spanR = new Int32Array(H).fill(-1);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W - 1; x++) if (lum[y*W+x] > 5 && lum[y*W+x+1] > 5) { spanL[y] = x; break; }
      for (let x = W - 1; x > 0; x--) if (lum[y*W+x] > 5 && lum[y*W+x-1] > 5) { spanR[y] = x; break; }
    }
    // boot bottom: the last row still carrying real material (>=30 px over 14).
    // Under it the source has a faint floor plane that runs the full frame
    // width -- keep it, it is the ground he was rendered standing on.
    let figTop = -1, bootBottom = -1, shadowBottom = -1;
    for (let y = 0; y < H; y++) {
      let hot = 0, any = 0;
      for (let x = 0; x < W; x++) { const l = lum[y*W+x]; if (l > 14) hot++; if (l > 2) any++; }
      if (figTop < 0 && hot >= 4) figTop = y;
      if (hot >= 30) bootBottom = y;
      if (any >= 4) shadowBottom = y;
    }
    let figL = W, figR = 0;
    for (let y = figTop; y <= bootBottom; y++) {
      if (spanL[y] >= 0 && spanL[y] < figL) figL = spanL[y];
      if (spanR[y] > figR) figR = spanR[y];
    }

    // ---- 2. hull ----------------------------------------------------------
    // Solid silhouette: fill each row between its span ends. This deliberately
    // fills the gap between the legs and the counter of the G -- the pool
    // wants to be solid, not accurate.
    const hull = new Uint8ClampedArray(W * H * 4);
    for (let y = figTop; y <= shadowBottom; y++) {
      let l = spanL[y], r = spanR[y];
      if (y > bootBottom) {                      // shadow rows: reuse the boot
        l = spanL[bootBottom]; r = spanR[bootBottom];   // span, widened, so the
        const w = r - l, m = w * 0.18;                  // contact shadow keeps
        l = Math.max(0, l - m); r = Math.min(W - 1, r + m);  // its ground.
      }
      if (l < 0 || r < 0) continue;
      for (let x = l | 0; x <= (r | 0); x++) { const i = (y*W+x)*4; hull[i]=hull[i+1]=hull[i+2]=255; hull[i+3]=255; }
    }
    const hc = cv(W, H); hc.getContext('2d').putImageData(new ImageData(hull, W, H), 0, 0);

    // ---- 3. place the figure in the plate ---------------------------------
    const scale = FIG_H / (bootBottom - figTop + 1);
    const dW = Math.round(W * scale), dH = Math.round(H * scale);
    const dX = Math.round(PW/2 - ((figL + figR) / 2) * scale);
    const BASELINE = PH - Math.round((shadowBottom - bootBottom) * scale);
    const dY = Math.round(BASELINE - bootBottom * scale);

    // S: the untouched render, scaled, on black.
    const sPlate = cv(PW, PH), sp = sPlate.getContext('2d');
    sp.fillStyle = '#000'; sp.fillRect(0, 0, PW, PH);
    sp.imageSmoothingQuality = 'high';
    sp.drawImage(sc, dX, dY, dW, dH);
    const S = sp.getImageData(0, 0, PW, PH).data;

    // g: dilate the hull, then feather it.
    const g1 = cv(PW, PH), gx1 = g1.getContext('2d');
    gx1.filter = `blur(${DILATE * 0.7}px)`;
    gx1.drawImage(hc, dX, dY, dW, dH);
    const g1d = gx1.getImageData(0, 0, PW, PH);
    for (let i = 0; i < g1d.data.length; i += 4) {         // threshold low = dilate
      const v = g1d.data[i+3] > 40 ? 255 : 0;
      g1d.data[i] = g1d.data[i+1] = g1d.data[i+2] = v; g1d.data[i+3] = v;
    }
    const g2 = cv(PW, PH), gx2 = g2.getContext('2d');
    g2.getContext('2d').putImageData(g1d, 0, 0);
    const g3 = cv(PW, PH), gx3 = g3.getContext('2d');
    gx3.filter = `blur(${BLUR}px)`;
    gx3.drawImage(g2, 0, 0);
    const G = gx3.getImageData(0, 0, PW, PH).data;

    // ---- 4. the plate itself ---------------------------------------------
    // --dark, with the same bottom-centre green wash the dark CTA pane
    // carries (.gw-fallback[data-gw="dark"]), at a third of the strength, and
    // a 2px inner top light so the rim reads as an edge rather than a crop.
    const pc = cv(PW, PH), px = pc.getContext('2d');
    const rr = (c, x, y, w, h, rt, rb) => {
      c.beginPath();
      c.moveTo(x + rt, y); c.lineTo(x + w - rt, y); c.quadraticCurveTo(x + w, y, x + w, y + rt);
      c.lineTo(x + w, y + h - rb); c.quadraticCurveTo(x + w, y + h, x + w - rb, y + h);
      c.lineTo(x + rb, y + h); c.quadraticCurveTo(x, y + h, x, y + h - rb);
      c.lineTo(x, y + rt); c.quadraticCurveTo(x, y, x + rt, y); c.closePath();
    };
    px.save(); rr(px, 0, 0, PW, PH, R_TOP, 0); px.clip();
    px.fillStyle = PAL.dark; px.fillRect(0, 0, PW, PH);
    const wash = px.createRadialGradient(PW*0.5, PH*1.06, 0, PW*0.5, PH*1.06, PH*0.92);
    wash.addColorStop(0,    'rgba(46,122,91,0.26)');
    wash.addColorStop(0.46, 'rgba(19,51,39,0.13)');
    wash.addColorStop(0.78, 'rgba(15,31,25,0)');
    px.fillStyle = wash; px.fillRect(0, 0, PW, PH);
    px.restore();
    const P = px.getImageData(0, 0, PW, PH).data;

    // ---- 5. crossfade -----------------------------------------------------
    // Guarantee a band of untouched --dark around the rim so the plate reads
    // as a card and not as a smudge.
    const out = new Uint8ClampedArray(PW * PH * 4);
    const ss = (e0, e1, v) => { const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0))); return t*t*(3-2*t); };
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const k = y*PW + x, i = k*4;
      const dEdge = Math.min(x, PW - 1 - x, y, PH * 2);   // bottom edge is not fenced:
      let g = G[i+3] / 255;                                // he stands on it.
      g *= ss(0, EDGE_KEEP, dEdge);
      out[i]   = P[i]   * (1 - g) + S[i]   * g;
      out[i+1] = P[i+1] * (1 - g) + S[i+1] * g;
      out[i+2] = P[i+2] * (1 - g) + S[i+2] * g;
      out[i+3] = 255;
    }
    const fc = cv(PW, PH), fx = fc.getContext('2d');
    fx.putImageData(new ImageData(out, PW, PH), 0, 0);

    // inner top light + rim
    fx.save(); rr(fx, 1, 1, PW - 2, PH - 1, R_TOP - 1, 0);
    const rim = fx.createLinearGradient(0, 0, 0, PH);
    rim.addColorStop(0, 'rgba(214,231,222,0.20)');
    rim.addColorStop(0.30, 'rgba(214,231,222,0.06)');
    rim.addColorStop(1, 'rgba(214,231,222,0)');
    fx.strokeStyle = rim; fx.lineWidth = 2; fx.stroke(); fx.restore();

    // finally clip the whole plate to the rounded silhouette (alpha only there)
    const clip = cv(PW, PH), cx2 = clip.getContext('2d');
    rr(cx2, 0, 0, PW, PH, R_TOP, 0); cx2.fillStyle = '#fff'; cx2.fill();
    cx2.globalCompositeOperation = 'source-in';
    cx2.drawImage(fc, 0, 0);

    // ---- 6. the CTA variant: same field, used as alpha --------------------
    // On a ground that is already dark, no plate is needed. rgb = the render,
    // alpha = g. Composited over anything dark it darkens it toward black
    // under him and vanishes at the rim, so there is no rectangle over the
    // animated gradient waves either.
    const CW = 520, CH = 760;
    const cscale = 640 / (bootBottom - figTop + 1);
    const cdW = Math.round(W * cscale), cdH = Math.round(H * cscale);
    const cdX = Math.round(CW/2 - ((figL + figR)/2) * cscale);
    const cdY = Math.round((CH - 44) - bootBottom * cscale);
    const cS = cv(CW, CH), cSx = cS.getContext('2d');
    cSx.fillStyle = '#000'; cSx.fillRect(0, 0, CW, CH);
    cSx.imageSmoothingQuality = 'high'; cSx.drawImage(sc, cdX, cdY, cdW, cdH);
    const CS = cSx.getImageData(0, 0, CW, CH).data;
    const cg1 = cv(CW, CH), cg1x = cg1.getContext('2d');
    cg1x.filter = `blur(${DILATE * 0.9}px)`; cg1x.drawImage(hc, cdX, cdY, cdW, cdH);
    const cg1d = cg1x.getImageData(0, 0, CW, CH);
    for (let i = 0; i < cg1d.data.length; i += 4) { const v = cg1d.data[i+3] > 40 ? 255 : 0; cg1d.data[i]=cg1d.data[i+1]=cg1d.data[i+2]=v; cg1d.data[i+3]=v; }
    const cg2 = cv(CW, CH); cg2.getContext('2d').putImageData(cg1d, 0, 0);
    const cg3 = cv(CW, CH), cg3x = cg3.getContext('2d');
    cg3x.filter = `blur(${BLUR * 1.5}px)`; cg3x.drawImage(cg2, 0, 0);
    const CG = cg3x.getImageData(0, 0, CW, CH).data;
    const cout = new Uint8ClampedArray(CW * CH * 4);
    for (let i = 0; i < cout.length; i += 4) {
      cout[i] = CS[i]; cout[i+1] = CS[i+1]; cout[i+2] = CS[i+2];
      cout[i+3] = CG[i+3];
    }
    const cta = cv(CW, CH); cta.getContext('2d').putImageData(new ImageData(cout, CW, CH), 0, 0);

    // ---- 7. measure -------------------------------------------------------
    const measure = (canvas) => {
      const w = canvas.width, h = canvas.height;
      const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
      const bg = new Uint8Array(w * h), st = [];
      for (let x = 0; x < w; x++) st.push(x, 0, x, h - 1);
      for (let y = 0; y < h; y++) st.push(0, y, w - 1, y);
      while (st.length) {
        const y = st.pop(), x = st.pop();
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const k = y * w + x;
        if (bg[k] || d[k*4+3] > 8) continue;
        bg[k] = 1; st.push(x+1, y, x-1, y, x, y+1, x, y-1);
      }
      let holes = 0, fringe = 0;
      for (let k = 0; k < w * h; k++) {
        const a = d[k*4+3];
        if (a <= 8 && !bg[k]) holes++;
        if (a > 8 && a < 250) fringe++;
      }
      const webp = canvas.toDataURL('image/webp', 0.92).split(',')[1];
      return { w, h, holes, fringePct: +(100 * fringe / (w*h)).toFixed(3),
               webpKB: +((webp.length * 3 / 4) / 1024).toFixed(1) };
    };

    return {
      plate: clip.toDataURL('image/png'),
      cta:   cta.toDataURL('image/png'),
      m:     measure(clip),
      mCta:  measure(cta),
      src:   { W, H, figTop, bootBottom, shadowBottom, figL, figR,
               figW: figR - figL + 1, figH: bootBottom - figTop + 1, scale: +scale.toFixed(4),
               placedW: Math.round((figR - figL + 1) * scale), BASELINE, dX, dY, dW, dH },
    };
  }, { b64, PW, PH, R_TOP, FIG_H, DILATE, BLUR, EDGE_KEEP, PAL });

  fs.writeFileSync(path.join(OUT, 'dark-plate.png'), Buffer.from(built.plate.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(OUT, 'dark-plate-cta.png'), Buffer.from(built.cta.split(',')[1], 'base64'));
  console.log('src      ', JSON.stringify(built.src));
  console.log('plate    ', JSON.stringify(built.m));
  console.log('cta      ', JSON.stringify(built.mCta));

  fs.writeFileSync(path.join(OUT, '_dark-plate.json'), JSON.stringify({ m: built.m, mCta: built.mCta, src: built.src }, null, 2));
  await browser.close();

  // and the proof sheet, so one command produces everything
  require('./gio-dark-plate-proof.cjs');
})();
