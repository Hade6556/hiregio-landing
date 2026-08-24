const { chromium } = require('playwright');
const fs = require('fs');

const HI = 8;   // chosen off the sweep: the highest threshold at which the
const LO = 4;   // sunglasses and jacket survive the flood

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const b64 = fs.readFileSync(process.argv[2] || '.design-audit/gio-src.png').toString('base64');
  await p.setContent('<canvas id=c></canvas>');

  const out = await p.evaluate(async ({ b64, HI, LO }) => {
    const img = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + b64; });
    const W = img.width, H = img.height;
    const c = document.getElementById('c'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const im = x.getImageData(0, 0, W, H), d = im.data;

    const lum = new Float32Array(W * H);
    for (let i = 0, k = 0; i < d.length; i += 4, k++) lum[k] = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];

    const bg = new Uint8Array(W * H), stack = [];
    for (let cx = 0; cx < W; cx++) stack.push(cx, 0, cx, H - 1);
    for (let cy = 0; cy < H; cy++) stack.push(0, cy, W - 1, cy);
    while (stack.length) {
      const cy = stack.pop(), cx = stack.pop();
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
      const k = cy * W + cx;
      if (bg[k] || lum[k] > HI) continue;
      bg[k] = 1;
      stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
    }
    for (let k = 0; k < W * H; k++) {
      if (!bg[k]) continue;
      d[k * 4 + 3] = Math.round(Math.max(0, Math.min(1, (lum[k] - LO) / (HI - LO))) * 255);
    }

    // Find where the boots end. The contact shadow under Gio fades continuously
    // into the background, so no threshold separates it -- it can only be cut
    // off. Rows are told apart by what survived as OPAQUE: in the shadow band
    // most opaque pixels are near-black (material/opaque about 0.2), in the
    // boot sole almost all of them are lit leather (about 0.9).
    let bootRow = H - 1;
    for (let cy = H - 1; cy > H * 0.6; cy--) {
      let opaque = 0, material = 0;
      for (let cx = 0; cx < W; cx++) {
        const i = (cy * W + cx) * 4;
        if (d[i + 3] > 240) {
          opaque++;
          if (0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2] > 12) material++;
        }
      }
      if (opaque > 20 && material / opaque > 0.55) { bootRow = Math.min(H - 1, cy + 4); break; }
    }

    // Despeckle: an opaque island smaller than this is shadow residue, not Gio.
    const seen = new Uint8Array(W * H);
    for (let start = 0; start < W * H; start++) {
      if (seen[start] || d[start * 4 + 3] < 40) continue;
      const blob = [], q = [start];
      seen[start] = 1;
      while (q.length) {
        const k = q.pop(); blob.push(k);
        const cx = k % W, cy = (k / W) | 0;
        for (const [nx, ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nk = ny * W + nx;
          if (seen[nk] || d[nk * 4 + 3] < 40) continue;
          seen[nk] = 1; q.push(nk);
        }
      }
      if (blob.length < 600) for (const k of blob) d[k * 4 + 3] = 0;
    }

    x.putImageData(im, 0, 0);

    let minX = W, minY = H, maxX = 0;
    for (let cy = 0; cy <= bootRow; cy++) for (let cx = 0; cx < W; cx++) {
      if (d[(cy * W + cx) * 4 + 3] > 30) {
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx; if (cy < minY) minY = cy;
      }
    }
    const tw = maxX - minX + 1, th = bootRow - minY + 1;
    const t = document.createElement('canvas'); t.width = tw; t.height = th;
    t.getContext('2d').drawImage(c, minX, minY, tw, th, 0, 0, tw, th);
    return { png: t.toDataURL('image/png'), tw, th, bootRow, cropped: H - 1 - bootRow };
  }, { b64, HI, LO });

  fs.writeFileSync('assets/gio.png', Buffer.from(out.png.split(',')[1], 'base64'));
  console.log(`threshold ${HI}, feather ${LO}-${HI}`);
  console.log(`cropped ${out.cropped}px of contact shadow off the bottom`);
  console.log(`output ${out.tw}x${out.th}, ${(fs.statSync('assets/gio.png').size / 1024).toFixed(0)}KB -> assets/gio.png`);
  await b.close();
})();
