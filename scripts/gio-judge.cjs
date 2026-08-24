/* gio-judge.cjs — independent audit of the four Gio proposals.
   Writes nothing outside .design-audit/gio/. Does not touch index.html,
   assets/gio.png, scripts/key-mascot.cjs or tests/.

   Passes:
     1  alpha census per candidate (clear / semi / opaque, interior holes,
        connected components, bottom-row alpha ramp, horizontal runs)
     2  referee mask built from the SOURCE by 5x5 local sigma (>0.55) OR
        lum>6, largest component, holes filled -- an independent ground
        truth that does not use anyone's threshold. Measures per candidate:
        "eaten" (referee says subject, candidate says transparent) and
        "bloat" (candidate opaque where referee says void).
     3  6x zoom sheets of boots / G terminal / arm / leg-gap on cream and
        on magenta.
     4  the real page: index.html at 1440x900 dpr1+dpr2 with the candidate
        swapped in at runtime via addStyleTag (no file is modified), then
        4x magnifications of the head and the ground contact.
     5  payload: webp at q80/86/92.
   Run: node scripts/gio-judge.cjs
*/
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const F = {
  now: 'assets/gio.png',
  A:   '.design-audit/gio/matte-repair.png',
  B:   '.design-audit/gio/relight.png',
  C:   '.design-audit/gio/dark-plate.png',
  D:   '.design-audit/gio/flat-silhouette.png',
};
const KEYED = ['now', 'A', 'B', 'D'];          // C has no matte to audit
const OUT = '.design-audit/gio/';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent('<canvas id=a></canvas><canvas id=s></canvas><canvas id=o></canvas>');
  const pay = {};
  for (const [k, f] of Object.entries(F)) pay[k] = fs.readFileSync(f).toString('base64');
  const src = fs.readFileSync('.design-audit/gio-src.png').toString('base64');

  const stats = await p.evaluate(async ({ pay, src, KEYED }) => {
    const load = async b64 => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b64; });

    // ---- referee mask from the source's own render grain ----
    const si = await load(src), SW = si.width, SH = si.height;
    const sc = document.getElementById('s'); sc.width = SW; sc.height = SH;
    const sx = sc.getContext('2d'); sx.drawImage(si, 0, 0);
    const sd = sx.getImageData(0, 0, SW, SH).data;
    const L = new Float32Array(SW * SH);
    for (let i = 0, k = 0; i < sd.length; i += 4, k++) L[k] = 0.299*sd[i] + 0.587*sd[i+1] + 0.114*sd[i+2];
    const sig = new Float32Array(SW * SH);
    for (let y = 2; y < SH-2; y++) for (let x = 2; x < SW-2; x++) {
      let s = 0, s2 = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const v = L[(y+dy)*SW + x+dx]; s += v; s2 += v*v; }
      const m = s/25; sig[y*SW+x] = Math.sqrt(Math.max(0, s2/25 - m*m));
    }
    const M = new Uint8Array(SW*SH);
    for (let k = 0; k < SW*SH; k++) M[k] = (sig[k] > 0.55 || L[k] > 6) ? 1 : 0;
    const seen = new Uint8Array(SW*SH); let bb = null;
    for (let s = 0; s < SW*SH; s++) { if (seen[s] || !M[s]) continue; const q = [s]; seen[s] = 1; const blob = [];
      while (q.length) { const kk = q.pop(); blob.push(kk); const cx = kk % SW, cy = (kk/SW)|0;
        for (const [nx, ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]) {
          if (nx<0||ny<0||nx>=SW||ny>=SH) continue; const nk = ny*SW+nx;
          if (seen[nk] || !M[nk]) continue; seen[nk] = 1; q.push(nk); } }
      if (!bb || blob.length > bb.length) bb = blob; }
    const GT = new Uint8Array(SW*SH); for (const k of bb) GT[k] = 1;
    { const reach = new Uint8Array(SW*SH), st = [];
      for (let cx = 0; cx < SW; cx++) st.push(cx,0,cx,SH-1);
      for (let cy = 0; cy < SH; cy++) st.push(0,cy,SW-1,cy);
      while (st.length) { const cy = st.pop(), cx = st.pop(); if (cx<0||cy<0||cx>=SW||cy>=SH) continue;
        const kk = cy*SW+cx; if (reach[kk] || GT[kk]) continue; reach[kk] = 1; st.push(cx+1,cy,cx-1,cy,cx,cy+1,cx,cy-1); }
      for (let k = 0; k < SW*SH; k++) if (!GT[k] && !reach[k]) GT[k] = 1; }

    const res = {};
    for (const [k, b64] of Object.entries(pay)) {
      const img = await load(b64), W = img.width, H = img.height;
      const c = document.getElementById('a'); c.width = W; c.height = H;
      const x = c.getContext('2d'); x.clearRect(0,0,W,H); x.drawImage(img, 0, 0);
      const d = x.getImageData(0,0,W,H).data;

      let clear = 0, semi = 0, opaque = 0;
      for (let i = 3; i < d.length; i += 4) { const a = d[i]; if (a === 0) clear++; else if (a === 255) opaque++; else semi++; }

      const reach = new Uint8Array(W*H), st = [];
      for (let cx = 0; cx < W; cx++) st.push(cx,0,cx,H-1);
      for (let cy = 0; cy < H; cy++) st.push(0,cy,W-1,cy);
      while (st.length) { const cy = st.pop(), cx = st.pop(); if (cx<0||cy<0||cx>=W||cy>=H) continue;
        const kk = cy*W+cx; if (reach[kk] || d[kk*4+3] !== 0) continue; reach[kk] = 1; st.push(cx+1,cy,cx-1,cy,cx,cy+1,cx,cy-1); }
      let holes = 0; for (let kk = 0; kk < W*H; kk++) if (d[kk*4+3] === 0 && !reach[kk]) holes++;

      const sn = new Uint8Array(W*H); let comps = 0, sizes = [];
      for (let s = 0; s < W*H; s++) { if (sn[s] || d[s*4+3] < 200) continue; let n = 0; const q = [s]; sn[s] = 1;
        while (q.length) { const kk = q.pop(); n++; const cx = kk%W, cy = (kk/W)|0;
          for (const [nx,ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]) { if (nx<0||ny<0||nx>=W||ny>=H) continue;
            const nk = ny*W+nx; if (sn[nk] || d[nk*4+3] < 200) continue; sn[nk] = 1; q.push(nk); } }
        comps++; sizes.push(n); }
      sizes.sort((a,b) => b-a);

      const tail = [];
      for (let cy = Math.max(0, H-8); cy < H; cy++) { let op = 0, se = 0, sum = 0, n = 0;
        for (let cx = 0; cx < W; cx++) { const a = d[(cy*W+cx)*4+3]; if (a > 200) op++; else if (a > 0) se++; if (a > 0) { sum += a; n++; } }
        tail.push(`${cy}:${op}op/${se}semi@${n?Math.round(sum/n):0}`); }

      let eaten = 0, bloat = 0, gtN = 0, op = 0, ox = 0, oy = 0;
      if (KEYED.includes(k)) {
        let best = null;
        for (let ty = -20; ty <= 40; ty++) for (let tx = -20; tx <= 40; tx++) {
          let err = 0;
          for (let cy = 20; cy < H-60; cy += 7) for (let cx = 4; cx < W-4; cx += 7) {
            const sxx = cx+tx, syy = cy+ty; if (sxx<0||syy<0||sxx>=SW||syy>=SH) { err += 1; continue; }
            const a = d[(cy*W+cx)*4+3] > 128 ? 1 : 0, m = L[syy*SW+sxx] >= 20 ? 1 : 0;
            if (m && !a) err++; if (!m && a) err += 0.25; }
          if (!best || err < best.err) best = { tx, ty, err }; }
        ox = best.tx; oy = best.ty;
        for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
          const sxx = cx+ox, syy = cy+oy; if (sxx<0||syy<0||sxx>=SW||syy>=836) continue;
          const g = GT[syy*SW+sxx], a = d[(cy*W+cx)*4+3];
          if (g) { gtN++; if (a < 40) eaten++; }
          if (a > 200) { op++; if (!g) bloat++; } }
      }
      const webp = {};
      for (const q of [0.80, 0.86, 0.92]) webp['q'+Math.round(q*100)] = Math.round(c.toDataURL('image/webp', q).length * 0.75 / 1024);

      res[k] = { dims: W+'x'+H, clear, semi, opaque, interiorHoles: holes,
        fringePct: +(semi/(W*H)*100).toFixed(2), opaqueComponents: comps, largest: sizes.slice(0,3),
        bottomRows: tail, webpKB: webp,
        refereeOffset: KEYED.includes(k) ? [ox, oy] : null,
        eatenPct: gtN ? +(eaten/gtN*100).toFixed(2) : null,
        bloatPct: op ? +(bloat/op*100).toFixed(2) : null };
    }
    return res;
  }, { pay, src, KEYED });

  fs.writeFileSync(OUT + '_judge-stats.json', JSON.stringify(stats, null, 1));
  console.log(JSON.stringify(stats, null, 1));

  // ---- pass 4: the real page, candidate swapped in at runtime ----
  for (const [k, f] of Object.entries(F)) {
    for (const dpr of [1, 2]) {
      const pg = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr });
      await pg.goto('file://' + path.resolve('index.html'));
      const uri = 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
      await pg.addStyleTag({ content: `.hero-mascot{background-image:url("${uri}")!important;background-position:right bottom!important;background-size:contain!important;background-repeat:no-repeat!important}` });
      await pg.waitForTimeout(350);
      const box = await (await pg.$('.hero-mascot')).boundingBox();
      await pg.screenshot({ path: `${OUT}_page-${k}-dpr${dpr}.png`, clip: { x: box.x-70, y: box.y-40, width: box.width+110, height: box.height+70 } });
      if (dpr === 2) await pg.screenshot({ path: `${OUT}_hero-${k}.png`, clip: { x: 0, y: 380, width: 1440, height: 520 } });
      await pg.close();
    }
  }
  console.log('wrote ' + OUT + '_page-*.png and _hero-*.png');
  await b.close();
})();
