/* Cut the mascot out of a baked transparency checkerboard.

   The file arrived named .png but is a JPEG: 3 components, zero alpha, and a
   grey/white checkerboard rendered into the pixels. Unlike the previous render
   this one is genuinely easy: the character is dark charcoal and the backdrop
   is two light greys, so luminance separates them with an enormous margin.

   Still done as a flood fill from the frame edge rather than a flat threshold,
   so any light detail INSIDE the character (the chest G, the specular on the
   sunglasses) survives no matter how bright it is. */
const { chromium } = require('playwright');
const fs = require('fs');

const SRC = process.argv[2];
const OUT = process.argv[3] || 'mascot.png';
const TARGET_W = Number(process.argv[4] || 1000);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const b64 = fs.readFileSync(SRC).toString('base64');
  await p.setContent('<canvas id=c></canvas>');

  const out = await p.evaluate(async ({ b64, TARGET_W }) => {
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/jpeg;base64,' + b64; });
    const W = img.width, H = img.height;
    const c = document.getElementById('c'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const im = x.getImageData(0, 0, W, H), d = im.data;

    const lum = new Float32Array(W * H);
    for (let i = 0, k = 0; i < d.length; i += 4, k++) lum[k] = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];

    // Histogram, to place the thresholds off the data rather than by eye.
    const hist = new Array(26).fill(0);
    for (let k = 0; k < lum.length; k++) hist[Math.min(25, Math.floor(lum[k] / 10))]++;

    /* HI: anything this bright and reachable from the border is checkerboard.
       LO: anything this dark is certainly the character. Between the two the
       alpha ramps, which is what gives the cut a clean anti-aliased edge. */
    const HI = 170, LO = 120;

    const bg = new Uint8Array(W * H), stack = [];
    for (let cx = 0; cx < W; cx++) stack.push(cx, 0, cx, H - 1);
    for (let cy = 0; cy < H; cy++) stack.push(0, cy, W - 1, cy);
    while (stack.length) {
      const cy = stack.pop(), cx = stack.pop();
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
      const k = cy * W + cx;
      if (bg[k] || lum[k] < HI) continue;
      bg[k] = 1;
      stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
    }

    /* Alpha. Border-connected bright pixels go transparent; the ones on the
       boundary ramp. Every partial pixel then takes the colour of the nearest
       solid character pixel, so on a light page a 50% edge reads as 50% of the
       mascot rather than 50% of the checkerboard it was shot against. */
    let dark = 0, darkR = 0, darkG = 0, darkB = 0;
    for (let k = 0; k < W * H; k++) {
      if (!bg[k] && lum[k] < LO) { const i = k*4; dark++; darkR += d[i]; darkG += d[i+1]; darkB += d[i+2]; }
    }
    const avg = [Math.round(darkR/dark), Math.round(darkG/dark), Math.round(darkB/dark)];

    for (let k = 0; k < W * H; k++) {
      const i = k * 4;
      if (bg[k]) { d[i+3] = 0; continue; }
      const l = lum[k];
      if (l <= LO) { d[i+3] = 255; continue; }
      const a = Math.max(0, Math.min(1, (HI - l) / (HI - LO)));
      d[i+3] = Math.round(a * 255);
      if (a > 0 && a < 1) { d[i] = avg[0]; d[i+1] = avg[1]; d[i+2] = avg[2]; }
    }

    // Despeckle: any opaque island smaller than this is jpeg noise, not Gio.
    const seen = new Uint8Array(W * H);
    for (let start = 0; start < W * H; start++) {
      if (seen[start] || d[start*4+3] < 40) continue;
      const blob = [], q = [start]; seen[start] = 1;
      while (q.length) {
        const k = q.pop(); blob.push(k);
        const cx = k % W, cy = (k / W) | 0;
        for (const [nx, ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nk = ny * W + nx;
          if (seen[nk] || d[nk*4+3] < 40) continue;
          seen[nk] = 1; q.push(nk);
        }
      }
      if (blob.length < 4000) for (const k of blob) d[k*4+3] = 0;
    }

    x.putImageData(im, 0, 0);

    // Crop to the ink, then scale to the size the page actually displays.
    let minX = W, minY = H, maxX = 0, maxY = 0;
    for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
      if (d[(cy*W+cx)*4+3] > 24) {
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
      }
    }
    const cw = maxX - minX + 1, ch = maxY - minY + 1;
    const tw = TARGET_W, th = Math.round(ch * (tw / cw));
    const t = document.createElement('canvas'); t.width = tw; t.height = th;
    const tx = t.getContext('2d');
    tx.imageSmoothingQuality = 'high';
    tx.drawImage(c, minX, minY, cw, ch, 0, 0, tw, th);

    // Interior holes: transparent pixels the border cannot reach.
    const td = tx.getImageData(0, 0, tw, th).data;
    const vis = new Uint8Array(tw * th), st2 = [];
    for (let cx = 0; cx < tw; cx++) st2.push(cx, 0, cx, th - 1);
    for (let cy = 0; cy < th; cy++) st2.push(0, cy, tw - 1, cy);
    while (st2.length) {
      const cy = st2.pop(), cx = st2.pop();
      if (cx < 0 || cy < 0 || cx >= tw || cy >= th) continue;
      const k = cy * tw + cx;
      if (vis[k] || td[k*4+3] > 8) continue;
      vis[k] = 1; st2.push(cx+1, cy, cx-1, cy, cx, cy+1, cx, cy-1);
    }
    let holes = 0, semi = 0;
    for (let k = 0; k < tw * th; k++) {
      const a = td[k*4+3];
      if (a <= 8 && !vis[k]) holes++;
      if (a > 8 && a < 248) semi++;
    }

    return {
      src: [W, H], crop: [cw, ch], outSize: [tw, th],
      histogram: hist, averageInk: avg,
      interiorHoles: holes, softEdgePct: +(100 * semi / (tw * th)).toFixed(2),
      png: t.toDataURL('image/png'),
      webp: t.toDataURL('image/webp', 0.94),
    };
  }, { b64, TARGET_W });

  const png = Buffer.from(out.png.split(',')[1], 'base64');
  const webp = Buffer.from(out.webp.split(',')[1], 'base64');
  fs.writeFileSync(OUT, png);
  fs.writeFileSync(OUT.replace(/\.png$/, '.webp'), webp);
  console.log(`source      ${out.src.join('x')} (jpeg, no alpha)`);
  console.log(`cropped to  ${out.crop.join('x')}`);
  console.log(`written     ${OUT} ${out.outSize.join('x')}  ${(png.length/1024).toFixed(0)}KB`);
  console.log(`            ${OUT.replace(/\.png$/, '.webp')}  ${(webp.length/1024).toFixed(0)}KB`);
  console.log(`interior holes ${out.interiorHoles}   soft edge ${out.softEdgePct}%   ink ${out.averageInk.join(',')}`);
  await b.close();
})();
