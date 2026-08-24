/* Strategy D - flat graphic mark.
 *
 * At 200px the render's speculars (zipper, straps, laces, chest G) are below the
 * resolution of the eye and collapse to one ink blot. So stop trying to key the
 * photograph: rebuild Gio as a two-value mark, the way a logo is drawn.
 *
 *   silhouette  = hysteresis threshold (bright seeds grown through a near-black
 *                 floor, growth capped so the contact shadow cannot bleed out),
 *                 then close -> fill holes -> open -> close -> blur+resolve,
 *                 which is what removes the chewed notches and staircases.
 *   knockouts   = the few separations in the render deep enough to be structure
 *                 rather than shading: the sunglass lenses, the collar shadow,
 *                 the jacket opening, the gap between the boots. Cut to alpha 0
 *                 so they show the page, whatever the page is doing there.
 *   accent      = the chest G, the one LIGHT feature, optionally in --accent.
 *
 * Every knockout is intersected with erode(silhouette, RIM) so the mark always
 * keeps a closed ink rim and nothing ever cuts the outline.
 *
 * Run:  node scripts/gio-flat-silhouette.cjs
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, '.design-audit/gio');
const SRC  = path.join(ROOT, '.design-audit/gio-src.png');
const NOW  = path.join(ROOT, 'assets/gio.png');

const INK = '#17191B', ACCENT = '#1E6B4E', GROUND = '#FBFAF7';

const P = {
  SEED: 12,       // luminance that is unambiguously Gio
  FLOOR: 5.0,     // luminance that is unambiguously not the black card
  FLOOR2: 2.2,    // and the last, desperate step down to reach the boot soles
  GROW: 12,       // px of that last step. caps the contact-shadow bleed.
  SEED_MIN: 350,  // px, a seed island smaller than this is a specular fleck
  CLOSE1: 7,      // seals the chewed notches
  OPEN: 3,        // shaves spurs and hairs
  CLOSE2: 3,      // re-rounds after the open
  HOLE_MAX: 1200, // a hole bigger than this is real negative space, not noise
  SMOOTH: 4.0,    // gaussian sigma of the corner-rounding pass. 2.6 leaves the
                  // outline lumpy; 5.5 eats the bite out of the G and blurs the
                  // boots into one another. 4.0 is where it stops looking traced.
  RIM: 8,         // minimum ink between a knockout and the outline
  RIM_TORSO: 12,  // the jacket edge is itself in shadow, so push further in
  LENS: 10,       // the lens glass, and nothing else on the face, is this dark
  ZIP: 12,        // the jacket opening
  GAP: 6,         // the gap between the boots is nearly the black card itself
  FACE: 42,       // only the G's own face is this bright
  COLLAR: 9,      // px of ground left under the head where it sits on the jacket
};


// ---------------------------------------------------------------- helpers (browser side)
const HELPERS = `
function edt1d(f,n,d,v,z){
  let k=0; v[0]=0; z[0]=-1e20; z[1]=1e20;
  for(let q=1;q<n;q++){
    let s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*q-2*v[k]);
    while(s<=z[k]){k--; s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*q-2*v[k]);}
    k++; v[k]=q; z[k]=s; z[k+1]=1e20;
  }
  k=0;
  for(let q=0;q<n;q++){ while(z[k+1]<q)k++; d[q]=(q-v[k])*(q-v[k])+f[v[k]]; }
}
// exact euclidean distance from every pixel to the nearest set pixel
function edt(bin,W,H){
  const N=Math.max(W,H), INF=1e20;
  const D=new Float64Array(W*H), f=new Float64Array(N), dd=new Float64Array(N);
  const v=new Int32Array(N), z=new Float64Array(N+1);
  for(let i=0;i<W*H;i++) D[i]=bin[i]?0:INF;
  for(let x=0;x<W;x++){ for(let y=0;y<H;y++) f[y]=D[y*W+x]; edt1d(f,H,dd,v,z); for(let y=0;y<H;y++) D[y*W+x]=dd[y]; }
  for(let y=0;y<H;y++){ for(let x=0;x<W;x++) f[x]=D[y*W+x]; edt1d(f,W,dd,v,z); for(let x=0;x<W;x++) D[y*W+x]=dd[x]; }
  const R=new Float32Array(W*H); for(let i=0;i<W*H;i++) R[i]=Math.sqrt(D[i]);
  return R;
}
function invert(m){ const o=new Uint8Array(m.length); for(let i=0;i<m.length;i++) o[i]=m[i]?0:1; return o; }
function dilate(m,W,H,r){ const d=edt(m,W,H), o=new Uint8Array(W*H); for(let i=0;i<W*H;i++) o[i]=d[i]<=r?1:0; return o; }
function erode(m,W,H,r){ const d=edt(invert(m),W,H), o=new Uint8Array(W*H); for(let i=0;i<W*H;i++) o[i]=d[i]>r?1:0; return o; }
function close_(m,W,H,r){ return erode(dilate(m,W,H,r),W,H,r); }
function open_(m,W,H,r){ return dilate(erode(m,W,H,r),W,H,r); }

function comps(m,W,H){
  const seen=new Uint8Array(W*H), out=[];
  for(let s=0;s<W*H;s++){
    if(seen[s]||!m[s]) continue;
    const q=[s], px=[]; seen[s]=1;
    let x0=W,x1=0,y0=H,y1=0;
    while(q.length){
      const k=q.pop(); px.push(k);
      const cx=k%W, cy=(k/W)|0;
      if(cx<x0)x0=cx; if(cx>x1)x1=cx; if(cy<y0)y0=cy; if(cy>y1)y1=cy;
      if(cx>0){const n=k-1; if(!seen[n]&&m[n]){seen[n]=1;q.push(n);} }
      if(cx<W-1){const n=k+1; if(!seen[n]&&m[n]){seen[n]=1;q.push(n);} }
      if(cy>0){const n=k-W; if(!seen[n]&&m[n]){seen[n]=1;q.push(n);} }
      if(cy<H-1){const n=k+W; if(!seen[n]&&m[n]){seen[n]=1;q.push(n);} }
    }
    out.push({px,x0,x1,y0,y1,n:px.length});
  }
  out.sort((a,b)=>b.n-a.n);
  return out;
}
function keepBig(m,W,H,min){
  const o=new Uint8Array(W*H);
  for(const c of comps(m,W,H)) if(c.n>=min) for(const k of c.px) o[k]=1;
  return o;
}
function fillHoles(m,W,H,maxArea){
  const seen=new Uint8Array(W*H), q=[];
  for(let x=0;x<W;x++){ q.push(x, (H-1)*W+x); }
  for(let y=0;y<H;y++){ q.push(y*W, y*W+W-1); }
  while(q.length){
    const k=q.pop();
    if(seen[k]||m[k]) continue;
    seen[k]=1;
    const cx=k%W, cy=(k/W)|0;
    if(cx>0)q.push(k-1); if(cx<W-1)q.push(k+1);
    if(cy>0)q.push(k-W); if(cy<H-1)q.push(k+W);
  }
  const hole=new Uint8Array(W*H);
  for(let i=0;i<W*H;i++) if(!m[i]&&!seen[i]) hole[i]=1;
  const out=Uint8Array.from(m);
  for(const c of comps(hole,W,H)) if(maxArea==null||c.n<=maxArea) for(const k of c.px) out[k]=1;
  return out;
}
// BFS growth of seeds through constraint, capped at maxD pixels
function grow(seed,constraint,W,H,maxD){
  const out=Uint8Array.from(seed), dist=new Int32Array(W*H).fill(-1);
  let cur=[];
  for(let i=0;i<W*H;i++) if(seed[i]){ dist[i]=0; cur.push(i); }
  for(let d=0; d<maxD && cur.length; d++){
    const nxt=[];
    for(const k of cur){
      const cx=k%W, cy=(k/W)|0;
      const nb=[];
      if(cx>0)nb.push(k-1); if(cx<W-1)nb.push(k+1);
      if(cy>0)nb.push(k-W); if(cy<H-1)nb.push(k+W);
      for(const n of nb) if(dist[n]<0 && constraint[n]){ dist[n]=d+1; out[n]=1; nxt.push(n); }
    }
    cur=nxt;
  }
  return out;
}
function boxblur(src,W,H,r){
  const t=new Float32Array(W*H), o=new Float32Array(W*H), w=2*r+1;
  for(let y=0;y<H;y++){
    let acc=0;
    for(let x=-r;x<=r;x++) acc+=src[y*W+Math.min(W-1,Math.max(0,x))];
    for(let x=0;x<W;x++){
      t[y*W+x]=acc/w;
      acc-=src[y*W+Math.min(W-1,Math.max(0,x-r))];
      acc+=src[y*W+Math.min(W-1,Math.max(0,x+r+1))];
    }
  }
  for(let x=0;x<W;x++){
    let acc=0;
    for(let y=-r;y<=r;y++) acc+=t[Math.min(H-1,Math.max(0,y))*W+x];
    for(let y=0;y<H;y++){
      o[y*W+x]=acc/w;
      acc-=t[Math.min(H-1,Math.max(0,y-r))*W+x];
      acc+=t[Math.min(H-1,Math.max(0,y+r+1))*W+x];
    }
  }
  return o;
}
function gauss(m,W,H,sigma){
  const r=Math.max(1,Math.round(sigma*1.4));
  let f=new Float32Array(W*H); for(let i=0;i<W*H;i++) f[i]=m[i]?1:0;
  f=boxblur(f,W,H,r); f=boxblur(f,W,H,r); f=boxblur(f,W,H,r);
  return f;
}
// binary mask -> corner-rounded, anti-aliased coverage in 0..1.
// The gaussian both rounds the corners (radius ~ sigma) and carries the real
// sub-pixel position of the edge, so the alpha ramp is taken straight off it,
// windowed down to about RAMP pixels instead of a wide grey halo.
function gaussR(sigma){ return Math.max(1, Math.round(sigma*1.4)); }
function resolve(m,W,H,sigma,ramp){
  const N=W*H;
  if (sigma<=0){ const o=new Float32Array(N); for(let i=0;i<N;i++) o[i]=m[i]?1:0; return {a:o,bin:Uint8Array.from(m)}; }
  const r=gaussR(sigma);
  const sEff=Math.sqrt(3*((2*r+1)*(2*r+1)-1)/12);   // sigma of three stacked boxes
  const slope=1/(sEff*Math.sqrt(2*Math.PI));        // d(blur)/dx at the 0.5 crossing
  const k=Math.max(1e-4, slope*(ramp||1.5));
  const f=gauss(m,W,H,sigma), o=new Float32Array(N), bin=new Uint8Array(N);
  for(let i=0;i<N;i++){ o[i]=Math.max(0,Math.min(1,(f[i]-0.5)/k+0.5)); bin[i]=f[i]>0.5?1:0; }
  return {a:o, bin};
}
function strokeOutside(m,W,H,w){
  const d=edt(m,W,H), o=new Uint8Array(W*H);
  for(let i=0;i<W*H;i++) o[i]=(!m[i] && d[i]<=w)?1:0;
  return o;
}
`;

// ---------------------------------------------------------------- build
async function build(page) {
  const b64 = fs.readFileSync(SRC).toString('base64');
  await page.setContent('<canvas id=c></canvas><script>' + HELPERS + '<' + '/script>');
  return page.evaluate(async ({ b64, P, INK, ACCENT }) => {
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b64; });
    const W = img.width, H = img.height, N = W * H;
    const c = document.getElementById('c'); c.width = W; c.height = H;
    const cx2 = c.getContext('2d'); cx2.drawImage(img, 0, 0);
    const d = cx2.getImageData(0, 0, W, H).data;
    const lum = new Float32Array(N);
    for (let i = 0, k = 0; i < d.length; i += 4, k++) lum[k] = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];

    // ---- 1. silhouette -------------------------------------------------
    // hysteresis: only pixels that are unambiguously Gio seed the figure, and
    // they may walk a bounded distance into the near-black floor. That reclaims
    // the boots (mean luminance 8.5) without letting the contact shadow, which
    // has no seed of its own, bleed out to the frame.
    const seedRaw = new Uint8Array(N), floor = new Uint8Array(N), floor2 = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      seedRaw[i] = lum[i] > P.SEED ? 1 : 0;
      floor[i]   = lum[i] > P.FLOOR ? 1 : 0;
      floor2[i]  = lum[i] > P.FLOOR2 ? 1 : 0;
    }
    const seed = keepBig(seedRaw, W, H, P.SEED_MIN);
    // stage 1 is unbounded: the far side of the right lens is 70px from the
    // nearest lit pixel, so a capped walk never reaches it and the head comes
    // back with a bite out of it. Floor 5 is high enough that the contact
    // shadow, which is 0.3 to 4, cannot carry the flood sideways.
    let sil = grow(seed, floor, W, H, 1e9);
    // stage 2 is capped: one short step down to floor 2.2 for the boot soles.
    sil = grow(sil, floor2, W, H, P.GROW);

    // where the boots stop and the contact shadow starts
    let bootRow = H - 1;
    for (let y = H - 1; y > H * 0.6; y--) {
      let n = 0;
      for (let x = 0; x < W; x++) if (lum[y*W+x] > 18) n++;
      if (n >= 8) { bootRow = Math.min(H - 1, y + 5); break; }
    }
    const crop = m => { for (let y = bootRow + 1; y < H; y++) for (let x = 0; x < W; x++) m[y*W+x] = 0; return m; };
    crop(sil);

    // ---- 2. clean the boundary -----------------------------------------
    // close first: that is what fills the chewed notches and the staircases.
    // then fill every hole, so the body is one solid form with no accidental
    // negative space at all. Every hole that SHOULD be there is put back below,
    // deliberately, at a size and shape that survives 200px.
    sil = close_(sil, W, H, P.CLOSE1);
    // Everything the fill closes is the render's own negative space: the lens
    // glass, the gap between the boots, the slot under an arm. Keep the record;
    // the ones worth 200px get put back below, cleaned.
    const preFill = Uint8Array.from(sil);
    sil = fillHoles(sil, W, H, null);
    const holeMask = new Uint8Array(N);
    for (let i = 0; i < N; i++) holeMask[i] = (sil[i] && !preFill[i]) ? 1 : 0;
    sil = open_(sil, W, H, P.OPEN);
    sil = close_(sil, W, H, P.CLOSE2);
    sil = keepBig(sil, W, H, 2000);
    sil = fillHoles(sil, W, H, null);
    crop(sil);

    const inner  = erode(sil, W, H, P.RIM);
    const innerT = erode(sil, W, H, P.RIM_TORSO);
    const band = (m, y0, y1) => { const o = new Uint8Array(N); for (let y=Math.max(0,y0);y<Math.min(H,y1);y++) for (let x=0;x<W;x++){const k=y*W+x; o[k]=m[k];} return o; };
    const xclip = (m, xa, xb) => { const o = new Uint8Array(N); for (let y=0;y<H;y++) for (let x=Math.max(0,xa);x<Math.min(W,xb);x++){const k=y*W+x; o[k]=m[k];} return o; };

    // ---- 3. the four knockouts -----------------------------------------
    // Everything the render carries in faint specular is thrown away. What is
    // kept is only what survives as a real luminance step: the lens glass, the
    // jacket opening, the gap between the boots, and the edge of the G itself
    // where it overlaps the collar.
    const F = {};

    // a. the lens glass: the two holes the fill closed inside the head, grown
    //    back together with everything on the face that is near black. Opened
    //    then closed so each lens ends up one solid rounded shape rather than
    //    a threshold's worth of tendrils.
    {
      const m = new Uint8Array(N);
      for (const c of comps(holeMask, W, H)) {
        const cy = (c.y0 + c.y1) / 2;
        if (c.n > 500 && cy > 280 && cy < 440) for (const k of c.px) m[k] = 1;
      }
      for (let i = 0; i < N; i++) if (lum[i] < P.LENS && inner[i]) m[i] = 1;
      let g = close_(band(m, 292, 412), W, H, 5);
      g = open_(g, W, H, 5);
      g = close_(g, W, H, 6);
      g = fillHoles(g, W, H, null);
      for (let i = 0; i < N; i++) if (!inner[i]) g[i] = 0;
      F.glasses = keepBig(g, W, H, 1500);
    }

    // b. the collar. The G's own face is the only large thing brighter than 42,
    //    and the lens mask is unioned back in so the glasses do not split it.
    //    Only the LOWEST boundary of that shape is used, smoothed across x and
    //    drawn as one arc: the line where the head sits into the jacket. A
    //    threshold's own trace of that shadow is a lasso and reads as noise.
    {
      const lit = new Uint8Array(N);
      for (let i = 0; i < N; i++) lit[i] = (lum[i] > P.FACE || F.glasses[i]) ? 1 : 0;
      let face = close_(lit, W, H, 9);
      const cs = comps(face, W, H).filter(c => c.n > 20000 && c.y0 < 120);
      face = new Uint8Array(N);
      for (const c of cs) for (const k of c.px) face[k] = 1;
      face = fillHoles(face, W, H, null);
      for (let y = 500; y < H; y++) for (let x = 0; x < W; x++) face[y*W+x] = 0;

      const yb = new Float64Array(W).fill(-1);
      for (let x = 0; x < W; x++) for (let y = 495; y >= 380; y--) if (face[y*W+x]) { yb[x] = y; break; }
      const sm = new Float64Array(W).fill(-1);
      for (let x = 0; x < W; x++) {
        let a = 0, n = 0;
        for (let d = -14; d <= 14; d++) { const t = x + d; if (t>=0 && t<W && yb[t] >= 0) { a += yb[t]; n++; } }
        if (n > 5) sm[x] = a / n;
      }
      F.collar = new Uint8Array(N);
      for (let x = 0; x < W; x++) {
        if (sm[x] < 0) continue;
        const y0c = Math.round(sm[x]);
        for (let y = y0c; y < y0c + P.COLLAR; y++) { const k = y*W+x; if (k < N && inner[k]) F.collar[k] = 1; }
      }
      F.collar = keepBig(F.collar, W, H, 300);
      F.collarY = sm;
      F.face = face;
    }

    // c. the jacket opening. The zipper channel is found by threshold, but a
    //    threshold's ragged trace is illegible at 200px, so only its POSITION
    //    and extent are taken from the render; the line itself is drawn clean.
    {
      const m = new Uint8Array(N);
      for (let i = 0; i < N; i++) m[i] = (lum[i] < P.ZIP && innerT[i]) ? 1 : 0;
      const cand = close_(xclip(band(m, 500, 700), 175, 295), W, H, 4);
      let best = null;
      for (const c of comps(cand, W, H)) {
        const h = c.y1 - c.y0 + 1, w = c.x1 - c.x0 + 1;
        if (c.n > 400 && h > 90 && h > w * 1.2 && (!best || c.n > best.n)) best = c;
      }
      F.jacket = new Uint8Array(N);
      if (best) {
        // per-row centre of the found channel, then a constant-width bar
        const sum = new Float64Array(H), cnt = new Float64Array(H);
        for (const k of best.px) { const y = (k/W)|0; sum[y] += k % W; cnt[y]++; }
        let cxs = 0, cn = 0;
        for (let y = best.y0; y <= best.y1; y++) if (cnt[y]) { cxs += sum[y]/cnt[y]; cn++; }
        const zx = Math.round(cxs / cn), hw = 3;
        const yEnd = best.y1 - Math.round((best.y1 - best.y0) * 0.07);
        for (let y = best.y0; y <= yEnd; y++)
          for (let x = zx - hw; x <= zx + hw; x++) { const k = y*W+x; if (innerT[k]) F.jacket[k] = 1; }
      }
    }

    // d. the gap between the boots needs NO knockout. Once the flood is a real
    //    hysteresis the gap survives on its own, open to the crop edge, and
    //    cutting it again only chews the inner edge of each boot.
    F.legs = new Uint8Array(N);

    // e. the chest G: the one LIGHT feature, and the only place an accent can
    //    go without inventing something the render does not have.
    {
      const m = new Uint8Array(N);
      for (let i = 0; i < N; i++) m[i] = (lum[i] > 46 && inner[i]) ? 1 : 0;
      const cand = close_(xclip(band(m, 470, 555), 270, 350), W, H, 2);
      const o = new Uint8Array(N);
      for (const c of comps(cand, W, H)) if (c.n > 120) for (const k of c.px) o[k] = 1;
      F.chest = fillHoles(close_(o, W, H, 3), W, H, 120);
    }

    // f. the whole glasses assembly (frame, bridge, temples), and the head as a
    //    region. Needed because the render reads for one reason: the G's face is
    //    LIGHT and everything worn on it is DARK. A flat mark that makes the head
    //    ink has to invert that, and the lenses stop being lenses.
    {
      const m = new Uint8Array(N);
      for (let i = 0; i < N; i++) m[i] = (lum[i] < 30 && inner[i]) ? 1 : 0;
      const cand = close_(band(m, 288, 416), W, H, 4);
      const o = new Uint8Array(N);
      for (const c of comps(cand, W, H)) {
        let hit = 0; for (const k of c.px) if (F.glasses[k]) hit++;
        if (hit > 200) for (const k of c.px) o[k] = 1;
      }
      for (let i = 0; i < N; i++) if (F.glasses[i]) o[i] = 1;
      F.assembly = fillHoles(close_(o, W, H, 4), W, H, null);
    }
    // the head is everything above the collar arc, taken as one piece
    const headFill = new Uint8Array(N);
    {
      const Y = new Float64Array(W).fill(-1);
      for (let x = 0; x < W; x++) Y[x] = F.collarY[x];
      let last = -1;
      for (let x = 0; x < W; x++) { if (Y[x] < 0) Y[x] = last; else last = Y[x]; }
      last = -1;
      for (let x = W-1; x >= 0; x--) { if (Y[x] < 0) Y[x] = last; else last = Y[x]; }
      for (let x = 0; x < W; x++) { const yy = Y[x] < 0 ? 440 : Y[x];
        for (let y = 0; y <= yy; y++) { const k = y*W+x; if (sil[k]) headFill[k] = 1; } }
      const cs = comps(headFill, W, H); headFill.fill(0);
      if (cs.length) for (const k of cs[0].px) headFill[k] = 1;
    }

    const cut = new Uint8Array(N);
    for (const key of ['glasses','collar','jacket','legs','chest']) for (let i=0;i<N;i++) if (F[key][i]) cut[i] = 1;

    // ---- 4. resolve to anti-aliased coverage ---------------------------
    const R  = resolve(sil, W, H, P.SMOOTH, 1.5);
    const aSil = R.a;
    const aCut = resolve(cut, W, H, 1.1, 1.4).a;
    const aChe = resolve(F.chest, W, H, 0.9, 1.4).a;
    // knockout set for the two-tone mark: the jacket opening only. The head/body
    // colour break does the work the collar arc was doing.
    const mk = (keys) => { const m = new Uint8Array(N); for (const k2 of keys) for (let i=0;i<N;i++) if (F[k2][i]) m[i]=1; return m; };
    const aCutHead  = resolve(mk(['jacket','collar']), W, H, 1.1, 1.4).a;
    const aCutHead2 = resolve(mk(['jacket','collar','glasses']), W, H, 1.1, 1.4).a;
    const aCutHead3 = resolve(mk(['jacket','collar','assembly']), W, H, 1.2, 1.4).a;
    // knockout set for the negative-bar mark: the whole glasses shape
    const cutBar = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (F.assembly[i] || F.jacket[i] || F.chest[i]) cutBar[i] = 1;
    const aCutBar = resolve(cutBar, W, H, 1.2, 1.4).a;
    const aHead = resolve(headFill, W, H, P.SMOOTH, 1.5).a;
    const aGl   = resolve(F.assembly, W, H, 1.2, 1.4).a;

    // ---- 5. crop -------------------------------------------------------
    let x0=W,x1=0,y0=H,y1=0;
    for (let y=0;y<H;y++) for (let x=0;x<W;x++) if (aSil[y*W+x] > 0.04) {
      if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
    }
    const CW = x1-x0+1, CH = y1-y0+1;

    // ---- 6. paint the variants -----------------------------------------
    const hex = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
    const ink = hex(INK), acc = hex(ACCENT);

    function paint(mode) {
      const cc = document.createElement('canvas'); cc.width = CW; cc.height = CH;
      const g = cc.getContext('2d');
      const im = g.createImageData(CW, CH), o = im.data;
      const put = (j, col, a) => { o[j]=col[0]; o[j+1]=col[1]; o[j+2]=col[2]; o[j+3]=Math.round(255*Math.max(0,Math.min(1,a))); };
      const mix = (t) => [Math.round(ink[0]*(1-t)+acc[0]*t), Math.round(ink[1]*(1-t)+acc[1]*t), Math.round(ink[2]*(1-t)+acc[2]*t)];
      for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
        const k = (y+y0)*W + (x+x0), j = (y*CW+x)*4;
        if (mode === 'head' || mode === 'head2' || mode === 'head3') {
          // green G, ink everything else. The glasses stay DARK, on green, which
          // is the one relationship in the render that carries the character.
          const cutA = mode === 'head' ? aCutHead : mode === 'head2' ? aCutHead2 : aCutHead3;
          const t  = Math.max(0, aHead[k] - aGl[k]);
          const tg = Math.max(t, aChe[k]);            // chest G echoes the head
          put(j, mix(tg), aSil[k] * (1 - cutA[k]));
        } else if (mode === 'bar') {
          put(j, ink, aSil[k] * (1 - aCutBar[k]));
        } else if (mode === 'lens') {
          const t = aCut[k] * aSil[k] * (F.glasses[k] ? 1 : 0);
          put(j, mix(t), Math.max(aSil[k] * (1 - aCut[k]), t));
        } else if (mode === 'chest') {
          const t = aChe[k] * aSil[k];
          put(j, mix(t), Math.max(aSil[k] * (1 - aCut[k]), t));
        } else {
          put(j, ink, aSil[k] * (1 - aCut[k]));
        }
      }
      g.putImageData(im, 0, 0);
      return { png: cc.toDataURL('image/png'), webp: cc.toDataURL('image/webp', 0.92) };
    }

    // ---- 7. debug sheet -------------------------------------------------
    const dbg = document.createElement('canvas'); dbg.width = W*2 + 12; dbg.height = H;
    const dg = dbg.getContext('2d');
    dg.fillStyle = '#FBFAF7'; dg.fillRect(0, 0, dbg.width, dbg.height);
    const tile = (paintFn) => {
      const t = document.createElement('canvas'); t.width = W; t.height = H;
      const tg = t.getContext('2d'); const im = tg.createImageData(W, H);
      paintFn(im.data); tg.putImageData(im, 0, 0); return t;
    };
    const cols = { glasses:[220,60,60], collar:[60,140,220], jacket:[240,170,40], legs:[150,80,220], chest:[40,200,120] };
    dg.drawImage(tile(q => {
      for (let i = 0; i < N; i++) { const j=i*4;
        if (sil[i]) { q[j]=40; q[j+1]=44; q[j+2]=48; } else { q[j]=250; q[j+1]=248; q[j+2]=244; }
        q[j+3]=255; }
      for (const key of Object.keys(cols)) for (let i = 0; i < N; i++) if (F[key][i]) {
        const j=i*4, cl=cols[key]; q[j]=cl[0]; q[j+1]=cl[1]; q[j+2]=cl[2]; }
    }), 0, 0);
    dg.drawImage(tile(q => {
      for (let i = 0; i < N; i++) { const j=i*4;
        if (holeMask[i]) { q[j]=230; q[j+1]=60; q[j+2]=160; }
        else if (F.face[i]) { q[j]=90; q[j+1]=150; q[j+2]=130; }
        else if (sil[i]) { q[j]=40; q[j+1]=44; q[j+2]=48; }
        else { q[j]=250; q[j+1]=248; q[j+2]=244; }
        q[j+3]=255; }
    }), W + 12, 0);

    // how many closed regions would an SVG trace need?
    const finalBin = new Uint8Array(N);
    for (let i = 0; i < N; i++) finalBin[i] = (aSil[i] * (1 - aCut[i])) > 0.5 ? 1 : 0;
    const regions = comps(finalBin, W, H).filter(c => c.n > 40).length
                  + comps(invert(finalBin), W, H).filter(c => c.n > 40).length - 1;

    const counts = {}; for (const k of Object.keys(F)) counts[k] = F[k].reduce((a,b)=>a+b,0);
    return {
      W, H, bootRow, x0, y0, CW, CH, counts,
      regions,
      ink: paint('ink'), lens: paint('lens'), chest: paint('chest'), bar: paint('bar'), head: paint('head'), head2: paint('head2'), head3: paint('head3'),
      debug: dbg.toDataURL('image/png'),
    };
  }, { b64, P, INK, ACCENT });
}

// ---------------------------------------------------------------- measure
async function measure(page, file) {
  const b64 = fs.readFileSync(file).toString('base64');
  await page.setContent('<canvas id=m></canvas><script>' + HELPERS + '<' + '/script>');
  return page.evaluate(async ({ b64 }) => {
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b64; });
    const W = img.width, H = img.height, N = W*H;
    const c = document.getElementById('m'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0,0,W,H).data;
    const clear = new Uint8Array(N);
    let fringe = 0, opaque = 0;
    for (let i = 0; i < N; i++) {
      const a = d[i*4+3];
      if (a <= 8) clear[i] = 1;
      else if (a < 250) fringe++;
      else opaque++;
    }
    // flood the clear pixels from the frame border
    const seen = new Uint8Array(N), q = [];
    for (let x=0;x<W;x++){ q.push(x, (H-1)*W+x); }
    for (let y=0;y<H;y++){ q.push(y*W, y*W+W-1); }
    while (q.length) {
      const k = q.pop();
      if (seen[k] || !clear[k]) continue;
      seen[k] = 1;
      const cx=k%W, cy=(k/W)|0;
      if(cx>0)q.push(k-1); if(cx<W-1)q.push(k+1);
      if(cy>0)q.push(k-W); if(cy<H-1)q.push(k+W);
    }
    let holes = 0;
    for (let i = 0; i < N; i++) if (clear[i] && !seen[i]) holes++;
    // how many closed regions would an SVG trace need?
    const webp = c.toDataURL('image/webp', 0.92);
    return { W, H, holes, fringe, fringePct: +(100*fringe/N).toFixed(2), opaque,
             webpKB: +((webp.split(',')[1].length * 3 / 4) / 1024).toFixed(1) };
  }, { b64 });
}

// ---------------------------------------------------------------- proof
async function proof(page, mine, name) {
  const b = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  const A = b(mine), NOWB = b(NOW);
  const nowDim = await page.evaluate(async (s) => {
    const i = await new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = s; });
    return [i.width, i.height];
  }, NOWB);
  const myDim = await page.evaluate(async (s) => {
    const i = await new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = s; });
    return [i.width, i.height];
  }, A);

  const nativeScale = Math.min(290 / myDim[0], 700 / myDim[1]);
  const html = `<style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:1400px;height:900px;background:${GROUND};font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:${INK}}
    .sheet{display:flex;gap:16px;padding:24px;height:900px}
    .p{display:flex;flex-direction:column}
    .cap{font-size:13px;color:${INK};margin-bottom:2px;letter-spacing:.02em}
    .sub{font-size:11px;color:rgba(23,25,27,.62);margin-bottom:10px}
    .stage{flex:1;border:1px solid #E5E2DA;position:relative;overflow:hidden;background:${GROUND}}
    .stage.mag{background:#FF00FF;border-color:#FF00FF}
    .btm{position:absolute;left:50%;transform:translateX(-50%);bottom:0;display:block}
    img{display:block;image-rendering:auto}
    .pair{position:absolute;bottom:0;left:0;right:0;display:flex;gap:16px;justify-content:center;align-items:flex-end}
    .lab{position:absolute;bottom:6px;font-size:11px;color:rgba(23,25,27,.62)}
    .col{position:relative;display:flex;flex-direction:column;align-items:center}
    .col span{font-size:11px;color:rgba(23,25,27,.62);padding-top:4px}
  </style>
  <div class="sheet">
    <div class="p" style="width:290px">
      <div class="cap">a. AS SHIPPED ON THE PAGE</div>
      <div class="sub">200px wide, on ${GROUND}</div>
      <div class="stage"><img class="btm" src="${A}" style="width:200px"></div>
    </div>
    <div class="p" style="width:290px">
      <div class="cap">b. 1:1</div>
      <div class="sub">native ${myDim[0]}&times;${myDim[1]}, shown at ${Math.round(nativeScale*100)}%</div>
      <div class="stage"><img class="btm" src="${A}" style="width:${Math.round(myDim[0]*nativeScale)}px"></div>
    </div>
    <div class="p" style="width:290px">
      <div class="cap">c. MATTE</div>
      <div class="sub">over #FF00FF &mdash; magenta = alpha 0</div>
      <div class="stage mag"><img class="btm" src="${A}" style="width:240px"></div>
    </div>
    <div class="p" style="width:434px">
      <div class="cap">d. SIDE BY SIDE</div>
      <div class="sub">both 200px wide, on ${GROUND}</div>
      <div class="stage"><div class="pair">
        <div class="col"><img src="${NOWB}" style="width:200px"><span>now &mdash; ${nowDim[0]}&times;${nowDim[1]}</span></div>
        <div class="col"><img src="${A}" style="width:200px"><span>yours &mdash; ${myDim[0]}&times;${myDim[1]}</span></div>
      </div></div>
    </div>
  </div>`;
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.setContent(html);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, name), clip: { x: 0, y: 0, width: 1400, height: 900 } });
}

// ---------------------------------------------------------------- in situ
// The four proof panels sit on flat #FBFAF7 so every strategy is comparable,
// but the hero's real ground is not flat: a radial accent wash puts #CFDED5 to
// #E5EEE8 behind Gio's corner. A mark that introduces a COLOUR has to be checked
// against that, so this drops the asset into the actual page at runtime.
// index.html is never touched; the override lives in the browser only.
async function inSitu(page, file) {
  const uri = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForTimeout(1200);
  const box = await page.evaluate((u) => {
    const e = document.querySelector('.hero-mascot');
    e.style.backgroundImage = 'url("' + u + '")';
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, uri);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'flat-silhouette-in-situ.png'), clip: {
    x: Math.max(0, box.x - 90), y: Math.max(0, box.y - 60),
    width: box.w + 130, height: Math.min(box.h + 80, 900 - box.y + 60) } });
}

// ---------------------------------------------------------------- main
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const br = await chromium.launch();
  const page = await br.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });

  const r = await build(page);
  const w = (n, uri) => { fs.writeFileSync(path.join(OUT, n), Buffer.from(uri.split(',')[1], 'base64')); return path.join(OUT, n); };
  w('flat-silhouette-ink.png',    r.ink.png);
  w('flat-silhouette-lens.png',   r.lens.png);
  w('flat-silhouette-chest.png',  r.chest.png);
  w('flat-silhouette-bar.png',    r.bar.png);
  w('flat-silhouette-head.png',   r.head.png);
  w('flat-silhouette-head2.png',  r.head2.png);
  w('flat-silhouette-head3.png',  r.head3.png);
  w('flat-silhouette-debug.png',  r.debug);

  const pick = process.env.PICK || 'head';
  fs.copyFileSync(path.join(OUT, `flat-silhouette-${pick}.png`), path.join(OUT, 'flat-silhouette.png'));

  console.log('source', r.W + 'x' + r.H, 'bootRow', r.bootRow, 'crop origin', r.x0 + ',' + r.y0, '->', r.CW + 'x' + r.CH);
  console.log('feature pixels', JSON.stringify(r.counts));
  console.log('closed regions in the final mark (an SVG trace would need this many paths):', r.regions);

  for (const v of ['ink','lens','chest','bar','head','head2','head3']) {
    const m = await measure(page, path.join(OUT, `flat-silhouette-${v}.png`));
    console.log(`${v.padEnd(6)} ${m.W}x${m.H}  interiorHoles=${m.holes}  fringe=${m.fringe} (${m.fringePct}%)  webp@0.92=${m.webpKB}KB`);
  }
  const now = await measure(page, NOW);
  console.log(`NOW    ${now.W}x${now.H}  interiorHoles=${now.holes}  fringe=${now.fringe} (${now.fringePct}%)  webp@0.92=${now.webpKB}KB`);

  await proof(page, path.join(OUT, 'flat-silhouette.png'), 'flat-silhouette-proof.png');
  await inSitu(page, path.join(OUT, 'flat-silhouette.png'));
  for (const v of (process.env.PROOFS||'ink,bar,head,head2,head3,lens').split(',')) await proof(page, path.join(OUT, `flat-silhouette-${v}.png`), `_variant-${v}.png`);
  console.log('wrote', OUT);
  await br.close();
})();
