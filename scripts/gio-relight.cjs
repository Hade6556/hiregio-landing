/* Strategy B - regrade Gio for a light ground.
   The matte is taken as given (assets/gio.png); interior holes and the
   interior half of the feather are repaired first so the grade is not
   amplifying damage. Everything after that is tone, not geometry.

   node scripts/gio-relight.cjs grid    -> variant contact sheet
   node scripts/gio-relight.cjs final   -> the asset + the proof sheet
*/
const { chromium } = require('playwright');
const fs = require('fs');

const GROUND = '#FBFAF7';

// ---------------------------------------------------------------- variants
const BASE = {
  LMAX: 96,        // p99 of the material: the white point of this render
  // The first pass lifted with gamma 0.58 and flattened him into one block of
  // soapstone -- the black jacket came up to meet the grey-green head. What is
  // needed is an affine LIFT off zero (so the boots and lenses stop being
  // indistinguishable) with the midtones EXPANDED, not compressed. Hence a
  // gamma near 0.85 sitting on top of a hard 22-level black lift.
  SHADOW: 22,      // --ink is #17191B, luminance 24.6: nothing goes blacker
  RANGE: 150,
  GAMMA: 0.95,
  USM_R1: 3, USM_A1: 0.75,   // r3 in a 410px asset ~ 1.1px at ship: zip, laces
  USM_R2: 14, USM_A2: 0.35,  // form separation: jacket vs G vs legs
  CHROMA: 0.55,
  REKEY: 2.0,
  ERODE: 1.4,
  SLAB_BAND: 26, SLAB_LUM: 9, SLAB_MIN: 150,
  CLOSE: 0,
  RIM: 'cream', RIM_W: 2.8, RIM_AMT: 0.50, RIM_POW: 1.6,
  OUT_W: 0, OUT_AMT: 0,
  SHADOW_ON: 1,
};
const VARIANTS = [
  { name: 'relight',       ...BASE },
  { name: 'P .95 harder',  ...BASE, GAMMA: 0.95, RANGE: 150 },
  { name: 'Q .75 softer',  ...BASE, GAMMA: 0.75, RANGE: 130 },
  { name: 'R no lift',     ...BASE, SHADOW: 8,  RANGE: 150, GAMMA: 0.85 },
  { name: 'S no rim',      ...BASE, RIM: 'none' },
  { name: 'T no USM',      ...BASE, USM_A1: 0, USM_A2: 0 },
];

// ------------------------------------------------------------ the pipeline
// Injected into the page as a string so grid and final share one code path.
const PIPELINE = `
function lum(r,g,b){ return 0.299*r + 0.587*g + 0.114*b; }

// two-pass chamfer(3,4) distance from the set S, in pixels
function chamfer(S, W, H){
  const INF = 1e9, D = new Float32Array(W*H);
  for (let k=0;k<W*H;k++) D[k] = S[k] ? 0 : INF;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++){
    const k=y*W+x; if(D[k]===0) continue; let m=D[k];
    if(x>0)        m=Math.min(m,D[k-1]+3);
    if(y>0)        m=Math.min(m,D[k-W]+3);
    if(x>0&&y>0)   m=Math.min(m,D[k-W-1]+4);
    if(x<W-1&&y>0) m=Math.min(m,D[k-W+1]+4);
    D[k]=m;
  }
  for (let y=H-1;y>=0;y--) for (let x=W-1;x>=0;x--){
    const k=y*W+x; if(D[k]===0) continue; let m=D[k];
    if(x<W-1)        m=Math.min(m,D[k+1]+3);
    if(y<H-1)        m=Math.min(m,D[k+W]+3);
    if(x<W-1&&y<H-1) m=Math.min(m,D[k+W+1]+4);
    if(x>0&&y<H-1)   m=Math.min(m,D[k+W-1]+4);
    D[k]=m;
  }
  for (let k=0;k<W*H;k++) D[k] = D[k]===INF ? 1e6 : D[k]/3;
  return D;
}

function boxBlur(src, W, H, r){
  const tmp=new Float32Array(W*H), out=new Float32Array(W*H), n=2*r+1;
  for(let y=0;y<H;y++){ let s=0;
    for(let i=-r;i<=r;i++) s+=src[y*W+Math.min(W-1,Math.max(0,i))];
    for(let x=0;x<W;x++){ tmp[y*W+x]=s/n;
      s-=src[y*W+Math.min(W-1,Math.max(0,x-r))];
      s+=src[y*W+Math.min(W-1,Math.max(0,x+r+1))]; } }
  for(let x=0;x<W;x++){ let s=0;
    for(let i=-r;i<=r;i++) s+=tmp[Math.min(H-1,Math.max(0,i))*W+x];
    for(let y=0;y<H;y++){ out[y*W+x]=s/n;
      s-=tmp[Math.min(H-1,Math.max(0,y-r))*W+x];
      s+=tmp[Math.min(H-1,Math.max(0,y+r+1))*W+x]; } }
  return out;
}
// three box passes approximate a gaussian
function blur3(src,W,H,r){ const q=Math.max(1,Math.round(r*0.62));
  return boxBlur(boxBlur(boxBlur(src,W,H,q),W,H,q),W,H,q); }

// the palette ramp. Stops sit at their own normalised luminance, so the
// gradient map carries hue and the tone curve keeps full control of value.
const RAMP = [
  [0.127, 28, 35, 31],    // shadows keep a green undertone: the --dark family
  [0.218, 53, 57, 54],
  [0.354, 89, 92, 89],
  [0.538, 137,140,136],
  [0.696, 178,180,174],
  [0.859, 221,221,214],   // highlights lean warm, toward --bg-alt
];
function ramp(u){
  if(u<=RAMP[0][0]) return [RAMP[0][1],RAMP[0][2],RAMP[0][3]];
  for(let i=1;i<RAMP.length;i++){
    if(u<=RAMP[i][0]){
      const a=RAMP[i-1], b=RAMP[i], f=(u-a[0])/(b[0]-a[0]);
      return [a[1]+(b[1]-a[1])*f, a[2]+(b[2]-a[2])*f, a[3]+(b[3]-a[3])*f];
    }
  }
  const e=RAMP[RAMP.length-1]; return [e[1],e[2],e[3]];
}

function build(srcImg, P){
  const W=srcImg.width, H=srcImg.height;
  const c0=document.createElement('canvas'); c0.width=W; c0.height=H;
  const x0=c0.getContext('2d'); x0.drawImage(srcImg,0,0);
  const im=x0.getImageData(0,0,W,H), d=im.data;

  // ---------------------------------------------------- 1. repair the matte
  const A=new Uint8Array(W*H);
  for(let k=0;k<W*H;k++) A[k]=d[k*4+3];

  // background = transparent AND reachable from the frame border
  const bg=new Uint8Array(W*H), st=[];
  for(let x=0;x<W;x++) st.push(x,0,x,H-1);
  for(let y=0;y<H;y++) st.push(0,y,W-1,y);
  while(st.length){ const y=st.pop(), x=st.pop();
    if(x<0||y<0||x>=W||y>=H) continue;
    const k=y*W+x; if(bg[k]||A[k]>8) continue; bg[k]=1;
    st.push(x+1,y,x-1,y,x,y+1,x,y-1); }

  let filled=0;
  for(let k=0;k<W*H;k++) if(A[k]<=8 && !bg[k]){ A[k]=255; filled++; }

  // The shipped keyer never wrote RGB, so the original render survives inside
  // every pixel it made transparent. Threshold 8 was too high: it chewed the
  // shins and shattered the right boot. From 0.5 to 3 the cut is identical and
  // clean, so re-run it here at 2. This is repair, not a new matte strategy --
  // it only exists so the grade is not being judged on top of damage.
  let rekeyed=0;
  if(P.REKEY>0){
    const bl=new Float32Array(W*H);
    for(let k=0;k<W*H;k++) bl[k]=lum(d[k*4],d[k*4+1],d[k*4+2]);
    const bg2=new Uint8Array(W*H), s2=[];
    for(let x=0;x<W;x++) s2.push(x,0,x,H-1);
    for(let y=0;y<H;y++) s2.push(0,y,W-1,y);
    while(s2.length){ const y=s2.pop(), x=s2.pop();
      if(x<0||y<0||x>=W||y>=H) continue;
      const k=y*W+x; if(bg2[k]||bl[k]>P.REKEY) continue; bg2[k]=1;
      s2.push(x+1,y,x-1,y,x,y+1,x,y-1); }
    // Threshold 2 keeps the render's own edge falloff, which runs down to
    // black over ~2px. Left opaque it grades into a hard dark outline all the
    // way round -- exactly the die-cut sticker look the ink-outline variant
    // was rejected for. Erode past it so the edge lands on real material.
    const dIn=chamfer(bg2,W,H);
    const M=new Float32Array(W*H);
    for(let k=0;k<W*H;k++) M[k]= dIn[k]>P.ERODE ? 1 : 0;
    const sm=blur3(M,W,H,1.1);                    // ~1.5px of clean antialiasing
    for(let k=0;k<W*H;k++){
      let a=Math.round(Math.max(0,Math.min(1,(sm[k]-0.25)/0.5))*255);
      // Blurring the mask seals narrow gaps: at r=1.1 it closed the slot
      // between the G's top terminal and its crossbar, which turned the
      // counter of the G into an 11.7k-pixel "interior hole". Force real
      // background back to zero so the antialiasing cannot change topology.
      if(bg2[k] && bl[k]<=0.8 && dIn[k]>P.ERODE+1.2) a=0;
      if(a>A[k]) rekeyed++;
      A[k]=a;
    }
  }

  // The render's own contact shadow was cropped at the boot row, but a slab of
  // it survived attached to the right boot's sole: rows 802-814, columns
  // 240-300, a dark rectangle sitting on the floor. It is connected to the
  // boot, so the largest-component filter keeps it, and it shares rows with
  // real sole, so a row trim cannot separate them. What does separate them is
  // value: across those rows the sole reads 26-50 and the slab reads 6-8.
  let slab=0;
  {
    const y0=H-P.SLAB_BAND, seen=new Uint8Array(W*H);
    const cand=(k)=> A[k]>8 && lum(d[k*4],d[k*4+1],d[k*4+2])<P.SLAB_LUM;
    for(let y=y0;y<H;y++) for(let x=0;x<W;x++){
      const s0=y*W+x; if(seen[s0]||!cand(s0)) continue;
      const q=[s0], blob=[]; seen[s0]=1;
      while(q.length){ const k=q.pop(); blob.push(k);
        const cx=k%W, cy=(k/W)|0;
        for(const[nx,ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]){
          if(nx<0||ny<y0||nx>=W||ny>=H) continue;
          const nk=ny*W+nx; if(seen[nk]||!cand(nk)) continue;
          seen[nk]=1; q.push(nk); } }
      if(blob.length>=P.SLAB_MIN){ for(const k of blob) A[k]=0; slab+=blob.length; }
    }
  }


  // Gio is one connected solid. Anything else that survived is residue from
  // the render's contact shadow -- there is a dark rectangle of it sitting on
  // the floor between the boots. Keep the largest component, drop the rest.
  let dropped=0;
  {
    const seen=new Uint8Array(W*H); let best=null, bestN=0;
    const comps=[];
    for(let st0=0;st0<W*H;st0++){
      if(seen[st0]||A[st0]<40) continue;
      const q=[st0], blob=[]; seen[st0]=1;
      while(q.length){ const k=q.pop(); blob.push(k);
        const cx=k%W, cy=(k/W)|0;
        for(const[nx,ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]){
          if(nx<0||ny<0||nx>=W||ny>=H) continue;
          const nk=ny*W+nx; if(seen[nk]||A[nk]<40) continue;
          seen[nk]=1; q.push(nk); } }
      comps.push(blob);
      if(blob.length>bestN){ bestN=blob.length; best=blob; }
    }
    for(const blob of comps){
      if(blob===best) continue;
      for(const k of blob) A[k]=0;
      dropped+=blob.length;
    }
  }

  // Rebuild the distance field from the alpha as it now stands. It was being
  // taken from the original threshold-8 flood, so the rim was placed against a
  // silhouette that no longer exists -- which is why the cream rim never
  // appeared on the G's upper-left contour.
  const bgF=new Uint8Array(W*H);
  for(let k=0;k<W*H;k++) bgF[k]= A[k]<=8 ? 1 : 0;
  const dist=chamfer(bgF,W,H);
  // and smooth it, so the rim reads the contour rather than individual
  // stair-stepped edge pixels (that was the speckling along the G's top).
  const distS=blur3(dist,W,H,1.6);
  // the flood's feather ran INSIDE him wherever it walked through the legs.
  // Anything more than 2.5px in from real background is body, not edge.
  let deFringed=0;
  for(let k=0;k<W*H;k++) if(A[k]>8 && A[k]<250 && dist[k]>2.5){ A[k]=255; deFringed++; }

  // a small morphological close, allowed to add alpha only, never remove:
  // heals the 1-3px slashes the flood cut across the shins.
  let closed=0;
  if(P.CLOSE>0){
    const r=P.CLOSE, solid=new Uint8Array(W*H);
    for(let k=0;k<W*H;k++) solid[k]=A[k]>=128?1:0;
    const dOut=chamfer(solid,W,H);                       // distance to solid
    const dil=new Uint8Array(W*H);
    for(let k=0;k<W*H;k++) dil[k]=dOut[k]<=r?1:0;
    const notDil=new Uint8Array(W*H);
    for(let k=0;k<W*H;k++) notDil[k]=dil[k]?0:1;
    const dIn=chamfer(notDil,W,H);
    for(let k=0;k<W*H;k++) if(dIn[k]>r && A[k]<255){ A[k]=255; closed++; }
  }

  // ------------------------------------ 2. clean the edge RGB (no black halo)
  // PNG alpha is straight, but the renderer baked black background into the
  // colour of every edge pixel. Lifting the shadows turns that into a grey
  // halo, so push interior colour outward and let alpha alone carry the edge.
  const R=new Float32Array(W*H), G=new Float32Array(W*H), B=new Float32Array(W*H);
  for(let k=0;k<W*H;k++){ R[k]=d[k*4]; G[k]=d[k*4+1]; B[k]=d[k*4+2]; }
  let known=new Uint8Array(W*H);
  for(let k=0;k<W*H;k++) known[k]=A[k]>=250?1:0;
  for(let it=0; it<5; it++){
    const nk=new Uint8Array(known), pend=[];
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const k=y*W+x; if(known[k]) continue;
      let sr=0,sg=0,sb=0,n=0;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
        const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue;
        const j=ny*W+nx; if(!known[j]) continue;
        sr+=R[j]; sg+=G[j]; sb+=B[j]; n++; }
      if(n) pend.push(k,sr/n,sg/n,sb/n);
    }
    for(let i=0;i<pend.length;i+=4){ const k=pend[i];
      R[k]=pend[i+1]; G[k]=pend[i+2]; B[k]=pend[i+3]; nk[k]=1; }
    known=nk;
  }

  // ------------------------------------------------ 3. tone curve + gradient map
  const L=new Float32Array(W*H), rr=new Float32Array(W*H),
        rg=new Float32Array(W*H), rb=new Float32Array(W*H), Lp=new Float32Array(W*H);
  for(let k=0;k<W*H;k++){
    const l=lum(R[k],G[k],B[k]);
    L[k]=l; rr[k]=R[k]-l; rg[k]=G[k]-l; rb[k]=B[k]-l;
    let t=l/P.LMAX;
    if(t>0.85) t=0.85+0.15*(1-Math.exp(-(t-0.85)/0.15));  // soft shoulder
    Lp[k]=P.SHADOW + P.RANGE*Math.pow(Math.max(0,Math.min(1,t)), P.GAMMA);
  }

  // ------------- 4. local contrast, mask-aware so the edge does not bloom
  const m=new Float32Array(W*H);
  for(let k=0;k<W*H;k++) m[k]=A[k]/255;
  const Lm=new Float32Array(W*H);
  for(let k=0;k<W*H;k++) Lm[k]=Lp[k]*m[k];
  const usm=(r)=>{ const a=blur3(Lm,W,H,r), b=blur3(m,W,H,r), o=new Float32Array(W*H);
    for(let k=0;k<W*H;k++) o[k]= b[k]>0.002 ? a[k]/b[k] : Lp[k];
    return o; };
  const b1=usm(P.USM_R1), b2=usm(P.USM_R2);
  for(let k=0;k<W*H;k++){
    let v = Lp[k] + P.USM_A1*(Lp[k]-b1[k]) + P.USM_A2*(Lp[k]-b2[k]);
    Lp[k] = Math.max(16, Math.min(242, v));   // no crush back to black, no clipping
  }

  // ----------------------------------------------- 5. colourise, then rim/outline
  const LIGHT=[-0.35,-0.94];       // the render is lit from above, a touch left
  const out=new Uint8ClampedArray(W*H*4);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const k=y*W+x;
    const hc=ramp(Math.max(0,Math.min(1,Lp[k]/255)));
    const s=Lp[k]/Math.max(1,lum(hc[0],hc[1],hc[2]));
    let r=hc[0]*s + rr[k]*P.CHROMA,
        g=hc[1]*s + rg[k]*P.CHROMA,
        bl=hc[2]*s + rb[k]*P.CHROMA;

    const dk=dist[k];
    if(P.RIM==='cream' && dk<=P.RIM_W && A[k]>8){
      const gx=(distS[Math.min(W-1,x+1)+y*W]-distS[Math.max(0,x-1)+y*W]);
      const gy=(distS[x+Math.min(H-1,y+1)*W]-distS[x+Math.max(0,y-1)*W]);
      const len=Math.hypot(gx,gy)||1;
      const dot=(-gx/len)*LIGHT[0] + (-gy/len)*LIGHT[1];
      const fall=1-dk/P.RIM_W;
      const w=Math.pow(Math.max(0,dot),P.RIM_POW)*fall*fall*P.RIM_AMT;
      r+=(240-r)*w; g+=(238-g)*w; bl+=(228-bl)*w;
    }
    if(P.OUT_W>0 && dk<=P.OUT_W && A[k]>8){
      const w=(1-dk/P.OUT_W)*P.OUT_AMT;
      r+=(23-r)*w; g+=(25-g)*w; bl+=(27-bl)*w;
    }
    out[k*4]=r; out[k*4+1]=g; out[k*4+2]=bl; out[k*4+3]=A[k];
  }

  // ------------------------------------------- 6. a contact shadow, page ink
  // key-mascot cut the render off at the boot row, so he ends on a hard
  // horizontal edge and floats. The shadow is what puts him on the floor and
  // it also sits exactly over that cut, which hides it.
  const SH = P.SHADOW_ON ? 32 : 0;
  const cf=document.createElement('canvas'); cf.width=W; cf.height=H+SH;
  const cx2=cf.getContext('2d');
  const fim=cx2.createImageData(W,H+SH), fd=fim.data;

  if(SH){
    let x0i=W, x1i=0;
    for(let y=H-9;y<H;y++) for(let x=0;x<W;x++)
      if(A[y*W+x]>200){ if(x<x0i)x0i=x; if(x>x1i)x1i=x; }
    if(x1i<x0i){ x0i=Math.round(W*0.25); x1i=Math.round(W*0.75); }
    const ccx=(x0i+x1i)/2, half=(x1i-x0i)/2;
    const soft={rx:half*1.55, ry:30, a:0.26}, core={rx:half*1.05, ry:12, a:0.34};
    const ss=(e)=>{ const t=Math.max(0,Math.min(1,1-e)); return t*t*(3-2*t); };
    for(let y=0;y<H+SH;y++) for(let x=0;x<W;x++){
      const dy=y-H;
      let a = soft.a*ss(Math.hypot((x-ccx)/soft.rx, dy/soft.ry))
            + core.a*ss(Math.hypot((x-ccx)/core.rx, dy/core.ry));
      a=Math.min(0.50,a); if(a<=0.002) continue;
      const i=(y*W+x)*4;
      fd[i]=26; fd[i+1]=30; fd[i+2]=26; fd[i+3]=Math.round(a*255);
    }
  }
  // composite him over the shadow, straight-alpha over
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const k=y*W+x, i=k*4, j=(y*W+x)*4;
    const sa=out[i+3]/255; if(sa<=0) continue;
    const da=fd[j+3]/255, oa=sa+da*(1-sa);
    fd[j]  =Math.round((out[i]  *sa + fd[j]  *da*(1-sa))/oa);
    fd[j+1]=Math.round((out[i+1]*sa + fd[j+1]*da*(1-sa))/oa);
    fd[j+2]=Math.round((out[i+2]*sa + fd[j+2]*da*(1-sa))/oa);
    fd[j+3]=Math.round(oa*255);
  }
  cx2.putImageData(fim,0,0);

  const co=document.createElement('canvas'); co.width=W; co.height=H;
  const oim=co.getContext('2d').createImageData(W,H);
  oim.data.set(out); co.getContext('2d').putImageData(oim,0,0);

  return { canvas:cf, charOnly:co, W, H:H+SH, filled, deFringed, closed, rekeyed, dropped, slab };
}

function measure(cv){
  const W=cv.width, H=cv.height;
  const x=cv.getContext('2d'), d=x.getImageData(0,0,W,H).data;
  const seen=new Uint8Array(W*H), st=[];
  for(let i=0;i<W;i++) st.push(i,0,i,H-1);
  for(let j=0;j<H;j++) st.push(0,j,W-1,j);
  while(st.length){ const y=st.pop(), xx=st.pop();
    if(xx<0||y<0||xx>=W||y>=H) continue;
    const k=y*W+xx; if(seen[k]||d[k*4+3]>8) continue; seen[k]=1;
    st.push(xx+1,y,xx-1,y,xx,y+1,xx,y-1); }
  let holes=0, semi=0, semiEdge=0;
  for(let k=0;k<W*H;k++){
    const a=d[k*4+3];
    if(a<=8){ if(!seen[k]) holes++; continue; }
    if(a<250){ semi++;
      const cx=k%W, cy=(k/W)|0; let near=false;
      for(let dy=-3;dy<=3&&!near;dy++) for(let dx=-3;dx<=3;dx++){
        const nx=cx+dx, ny=cy+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue;
        if(seen[ny*W+nx]){ near=true; break; } }
      if(near) semiEdge++;
    }
  }
  return { W,H, holes, semi, semiEdge, semiShadow: semi-semiEdge,
           fringePct:+(100*semi/(W*H)).toFixed(2),
           edgeFringePct:+(100*semiEdge/(W*H)).toFixed(2) };
}
`;

// ------------------------------------------------------------------ drivers
async function withPage(fn) {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent('<body style="margin:0"></body>');
  await p.addScriptTag({ content: PIPELINE });
  const r = await fn(p);
  await b.close();
  return r;
}
const load = (b64) => `(new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src='data:image/png;base64,${b64}'}))`;

async function grid() {
  const src = fs.readFileSync('assets/gio.png').toString('base64');
  const png = await withPage(p => p.evaluate(async ({ src, VARIANTS, GROUND }) => {
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + src; });
    const sheet = document.createElement('canvas');
    sheet.width = 1400; sheet.height = 900;
    const x = sheet.getContext('2d');
    x.fillStyle = GROUND; x.fillRect(0, 0, 1400, 900);
    x.font = '13px -apple-system, system-ui, sans-serif'; x.fillStyle = '#17191B';
    let col = 0;
    for (const P of VARIANTS) {
      const r = build(img, P);
      const ox = 20 + col * 230;
      // true ship size: contain into 200x306 -> height limited
      const s1 = 306 / r.H, w1 = r.W * s1;
      x.drawImage(r.canvas, ox, 60, w1, 306);
      x.fillText(P.name, ox, 46);
      x.fillText('ship ' + Math.round(w1) + 'x306', ox, 386);
      const s2 = 200 / r.W;
      x.drawImage(r.canvas, ox, 420, 200, r.H * s2);
      x.fillText('200 wide', ox, 880);
      col++;
    }
    return sheet.toDataURL('image/png');
  }, { src, VARIANTS, GROUND }));
  fs.writeFileSync('.design-audit/gio/relight-grid.png', Buffer.from(png.split(',')[1], 'base64'));
  console.log('grid -> .design-audit/gio/relight-grid.png');
}

async function final(pickName) {
  const P = VARIANTS.find(v => v.name === pickName) || VARIANTS[0];
  const src = fs.readFileSync('assets/gio.png').toString('base64');
  const out = await withPage(p => p.evaluate(async ({ src, P, GROUND, CURRENT }) => {
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + src; });
    const r = build(img, P);
    const stats = measure(r.canvas);
    const charStats = measure(r.charOnly);
    const png = r.canvas.toDataURL('image/png');
    const webp = r.canvas.toDataURL('image/webp', 0.92);
    // He only ever displays at 148x306. Lifting near-black to grainy midtone is
    // what costs the bytes, so measure what a right-sized asset would cost too.
    const alt = {};
    for (const w of [300, 250]) {
      const t = document.createElement('canvas');
      t.width = w; t.height = Math.round(r.H * w / r.W);
      const tc = t.getContext('2d'); tc.imageSmoothingQuality = 'high';
      tc.drawImage(r.canvas, 0, 0, t.width, t.height);
      alt[w + 'x' + t.height] = +(t.toDataURL('image/webp', 0.92).split(',')[1].length / 1024).toFixed(1);
    }

    // ------------------------------------------------------------ proof sheet
    const cur = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + CURRENT; });
    const S = document.createElement('canvas'); S.width = 1400; S.height = 900;
    const c = S.getContext('2d');
    c.fillStyle = GROUND; c.fillRect(0, 0, 1400, 900);
    c.font = '13px -apple-system, system-ui, sans-serif';
    const cap = (t, x0, y0) => { c.fillStyle = '#17191B'; c.fillText(t, x0, y0); };
    // unequal columns: 1:1 needs 410px of room, side-by-side needs two 200s
    const X = [0, 300, 720, 990, 1400];
    for (let i = 1; i < 4; i++) { c.fillStyle = '#E5E2DA'; c.fillRect(X[i], 0, 1, 900); }

    // a. AS SHIPPED ON THE PAGE
    cap('a. AS SHIPPED ON THE PAGE - 200px on #FBFAF7', 16, 26);
    {
      const h = r.H * (200 / r.W);
      c.drawImage(r.canvas, 50, 855 - h, 200, h);
      cap(r.W + 'x' + r.H + ' asset -> 200x' + Math.round(h), 16, 880);
      cap('real box is 200x306; contain lands him 148x306', 16, 896);
    }
    // b. 1:1
    cap('b. 1:1', X[1] + 16, 26);
    {
      let w = r.W, h = r.H, note = 'native ' + r.W + 'x' + r.H;
      if (h > 845) { const sc = 845 / h; w = Math.round(w * sc); h = 845; note = 'scaled to fit: ' + w + 'x' + h; }
      c.drawImage(r.canvas, X[1] + 8, 34, w, h);
      cap(note, X[1] + 16, 896);
    }
    // c. MATTE over magenta
    cap('c. MATTE over #FF00FF', X[2] + 16, 26);
    {
      const fw = X[3] - X[2] - 32, fh = 800;
      c.fillStyle = '#FF00FF'; c.fillRect(X[2] + 16, 34, fw, fh);
      const sc = Math.min(fw / r.W, fh / r.H);
      c.drawImage(r.canvas, X[2] + 16 + (fw - r.W * sc) / 2, 34, r.W * sc, r.H * sc);
      cap(charStats.holes + ' holes in the character. The ' + stats.holes, X[2] + 16, 866);
      cap('on the shipped file is the leg gap, sealed', X[2] + 16, 881);
      cap('by the baked shadow. fringe ' + stats.fringePct + '%, ' + (100*stats.semiShadow/stats.semi).toFixed(0) + '% shadow', X[2] + 16, 896);
    }
    // d. SIDE BY SIDE, both at 200px
    cap('d. SIDE BY SIDE at 200px', X[3] + 16, 26);
    {
      const hn = cur.height * (200 / cur.width), hy = r.H * (200 / r.W);
      c.drawImage(cur, X[3] + 5, 850 - hn, 200, hn);
      c.drawImage(r.canvas, X[3] + 208, 850 - hy, 200, hy);
      cap('now', X[3] + 90, 872);
      cap('yours', X[3] + 290, 872);
      cap('same 200px width, both bottom aligned', X[3] + 16, 896);
    }
    return { png, webp, alt, stats, charStats, filled: r.filled, deFringed: r.deFringed, closed: r.closed, dropped: r.dropped, rekeyed: r.rekeyed, slab: r.slab, proof: S.toDataURL('image/png') };
  }, { src, P, GROUND, CURRENT: src }));

  fs.writeFileSync('.design-audit/gio/relight.png', Buffer.from(out.png.split(',')[1], 'base64'));
  fs.writeFileSync('.design-audit/gio/relight-proof.png', Buffer.from(out.proof.split(',')[1], 'base64'));
  fs.writeFileSync('.design-audit/gio/relight.webp', Buffer.from(out.webp.split(',')[1], 'base64'));
  const b64len = out.webp.split(',')[1].length;
  console.log(JSON.stringify({
    variant: P.name, shipped: out.stats, characterLayer: out.charStats,
    holesFilled: out.filled, interiorFringeFixed: out.deFringed, strayResidueDropped: out.dropped, floorSlabRemoved: out.slab,
    pngKB: +(fs.statSync('.design-audit/gio/relight.png').size / 1024).toFixed(1),
    webpKB: +(fs.statSync('.design-audit/gio/relight.webp').size / 1024).toFixed(1),
    webpBase64KB: +(b64len / 1024).toFixed(1),
    downscaledBase64KB: out.alt,
  }, null, 1));
}

const mode = process.argv[2] || 'grid';
if (mode === 'grid') grid();
else if (mode === 'final') final(process.argv[3]);

// appended: diagnostic zoom on the boots, where the grid showed pale blocks
async function zoom(){
  const src = fs.readFileSync('assets/gio.png').toString('base64');
  const png = await withPage(p=>p.evaluate(async ({src, VARIANTS, GROUND})=>{
    const img=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src='data:image/png;base64,'+src;});
    const S=document.createElement('canvas'); S.width=1400; S.height=900;
    const c=S.getContext('2d'); c.fillStyle=GROUND; c.fillRect(0,0,1400,900);
    c.imageSmoothingEnabled=false;
    c.font='13px -apple-system, system-ui, sans-serif'; c.fillStyle='#17191B';
    // raw source alpha over magenta, bottom 240 rows at 2.4x
    const raw=document.createElement('canvas'); raw.width=img.width; raw.height=img.height;
    raw.getContext('2d').drawImage(img,0,0);
    c.fillStyle='#FF00FF'; c.fillRect(20,40,470,600);
    c.drawImage(raw, 60,575,196,250, 20,40,470,600);
    c.fillStyle='#17191B'; c.fillText('RAW assets/gio.png alpha, shins+boots, over magenta',20,28);

    const P0={...VARIANTS[0], CLOSE:0, RIM:'none'};
    const a=build(img,P0);
    c.fillStyle=GROUND; c.fillRect(500,40,430,600);
    c.drawImage(a.canvas, 60,575,196,250, 500,40,470,600);
    c.fillStyle='#17191B'; c.fillText('graded, CLOSE off, RIM off',500,28);

    const b=build(img,VARIANTS[0]);
    c.fillStyle=GROUND; c.fillRect(960,40,430,600);
    c.drawImage(b.canvas, 60,575,196,250, 960,40,430,600);
    c.fillStyle='#17191B'; c.fillText('graded, CLOSE 2 + cream RIM  <- the pale blocks',960,28);

    // and the shadow region at the very bottom
    c.fillStyle=GROUND; c.fillRect(20,680,1360,200);
    c.drawImage(b.canvas, 40,740,340,105, 20,680,1360,200);
    c.fillStyle='#17191B'; c.fillText('boot line + baked contact shadow, 4x',20,668);
    return S.toDataURL('image/png');
  },{src,VARIANTS,GROUND}));
  fs.writeFileSync('.design-audit/gio/relight-zoom.png', Buffer.from(png.split(',')[1],'base64'));
  console.log('zoom -> .design-audit/gio/relight-zoom.png');
}
if (mode === 'zoom') zoom();

// appended: the keyer only ever wrote ALPHA, so the original render's RGB is
// still intact inside every pixel it made transparent. That means the cut can
// be re-run at a lower threshold from assets/gio.png alone. Sweep it.
async function keysweep(){
  const src = fs.readFileSync('assets/gio.png').toString('base64');
  const png = await withPage(p=>p.evaluate(async ({src, GROUND})=>{
    const img=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src='data:image/png;base64,'+src;});
    const W=img.width,H=img.height;
    const c0=document.createElement('canvas'); c0.width=W;c0.height=H;
    c0.getContext('2d').drawImage(img,0,0);
    const d0=c0.getContext('2d').getImageData(0,0,W,H).data;
    const L=new Float32Array(W*H);
    for(let k=0;k<W*H;k++) L[k]=0.299*d0[k*4]+0.587*d0[k*4+1]+0.114*d0[k*4+2];

    const S=document.createElement('canvas'); S.width=1400;S.height=900;
    const c=S.getContext('2d'); c.fillStyle=GROUND; c.fillRect(0,0,1400,900);
    c.font='13px -apple-system, system-ui, sans-serif';
    c.imageSmoothingEnabled=false;
    const TH=[0.5,0.9,1.4,2.0,3.0,8.0];
    TH.forEach((T,i)=>{
      const bg=new Uint8Array(W*H), st=[];
      for(let x=0;x<W;x++) st.push(x,0,x,H-1);
      for(let y=0;y<H;y++) st.push(0,y,W-1,y);
      while(st.length){const y=st.pop(),x=st.pop();
        if(x<0||y<0||x>=W||y>=H) continue;
        const k=y*W+x; if(bg[k]||L[k]>T) continue; bg[k]=1;
        st.push(x+1,y,x-1,y,x,y+1,x,y-1);}
      let resurrected=0, bgpx=0;
      for(let k=0;k<W*H;k++){ if(bg[k]) bgpx++; else if(d0[k*4+3]<=8) resurrected++; }
      // draw the shin/boot region over magenta with this alpha
      const t=document.createElement('canvas'); t.width=W;t.height=H;
      const tx=t.getContext('2d'); const tim=tx.createImageData(W,H), td=tim.data;
      for(let k=0;k<W*H;k++){ td[k*4]=d0[k*4];td[k*4+1]=d0[k*4+1];td[k*4+2]=d0[k*4+2];
        td[k*4+3]= bg[k]?0:255; }
      tx.putImageData(tim,0,0);
      const ox=20+i*230;
      c.fillStyle='#FF00FF'; c.fillRect(ox,50,210,290);
      c.drawImage(t, 55,575,175,242, ox,50,210,290);
      c.fillStyle='#FF00FF'; c.fillRect(ox,370,210,290);
      c.drawImage(t, 0,0,W,H, ox,370,210,290*(H/W)/(H/W));
      c.drawImage(t, 0,0,W,H, ox,370,145,290);
      c.fillStyle='#17191B';
      c.fillText('threshold '+T,ox,40);
      c.fillText('+'+resurrected+'px',ox,356);
      c.fillText('bg '+(100*bgpx/(W*H)).toFixed(1)+'%',ox,676);
    });
    c.fillStyle='#17191B';
    c.fillText('re-key assets/gio.png from its own intact RGB. current keyer used threshold 8 with a border flood; +N is pixels it had killed that come back.',20,720);
    return S.toDataURL('image/png');
  },{src,GROUND}));
  fs.writeFileSync('.design-audit/gio/relight-keysweep.png', Buffer.from(png.split(',')[1],'base64'));
  console.log('keysweep -> .design-audit/gio/relight-keysweep.png');
}
if (mode === 'keysweep') keysweep();

// appended: final chooser. Everything at TRUE ship size (contain into the
// 200x306 box is height limited, so he lands at 148x306), plus a boot zoom.
async function choose(){
  const src = fs.readFileSync('assets/gio.png').toString('base64');
  const CAND = [
    ['relight (shipped)',   {...BASE}],
    ['P  gamma .95',        {...BASE, GAMMA:0.95, RANGE:150}],
    ['R  no black lift',    {...BASE, SHADOW:8, RANGE:150}],
    ['P + ink outline',     {...BASE, GAMMA:0.95, RANGE:150, RIM:'none', OUT_W:1.6, OUT_AMT:0.7}],
    ['P + no rim at all',   {...BASE, GAMMA:0.95, RANGE:150, RIM:'none'}],
  ];
  const png = await withPage(p=>p.evaluate(async ({src, CAND, GROUND})=>{
    const img=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src='data:image/png;base64,'+src;});
    const S=document.createElement('canvas'); S.width=1400;S.height=900;
    const c=S.getContext('2d'); c.fillStyle=GROUND; c.fillRect(0,0,1400,900);
    c.font='13px -apple-system, system-ui, sans-serif';
    CAND.forEach(([name,P],i)=>{
      const r=build(img,P);
      const ox=20+i*275;
      const sc=306/r.H;
      c.drawImage(r.canvas, ox, 60, r.W*sc, 306);
      c.fillStyle='#17191B'; c.fillText(name, ox, 46);
      // boot line at 3x, where the matte damage and the shadow both live
      c.drawImage(r.canvas, 55,600,300,245, ox, 400, 255, 208);
      c.fillText('boots 0.85x', ox, 626);
      // the head, 1:1, where the USM grain lives
      c.drawImage(r.canvas, 40,30,240,240, ox, 650, 240, 240);
      c.fillText('head 1:1', ox, 646);
    });
    return S.toDataURL('image/png');
  },{src,CAND,GROUND}));
  fs.writeFileSync('.design-audit/gio/relight-choose.png', Buffer.from(png.split(',')[1],'base64'));
  console.log('choose -> .design-audit/gio/relight-choose.png');
}
if (mode === 'choose') choose();

async function tail(){
  const src = fs.readFileSync('assets/gio.png').toString('base64');
  const png = await withPage(p=>p.evaluate(async ({src, BASE, GROUND})=>{
    const img=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src='data:image/png;base64,'+src;});
    const r0=build(img,{...BASE, SHADOW_ON:0});
    const r1=build(img,BASE);
    const S=document.createElement('canvas'); S.width=1400;S.height=900;
    const c=S.getContext('2d'); c.fillStyle=GROUND;c.fillRect(0,0,1400,900);
    c.font='13px -apple-system, system-ui, sans-serif'; c.imageSmoothingEnabled=false;
    // bottom 46 rows, no shadow, over magenta - 8x
    c.fillStyle='#FF00FF'; c.fillRect(20,50,1360,368);
    c.drawImage(r0.canvas, 40,769,340,46, 20,50,1360,368);
    c.fillStyle='#17191B'; c.fillText('character layer, bottom 46 rows, over magenta, 4x  <- the stray blob',20,40);
    // top-left contour of the G, 6x, on cream - where the rim speckles
    c.fillStyle=GROUND; c.fillRect(20,450,660,420);
    c.drawImage(r1.canvas, 30,20,110,70, 20,450,660,420);
    c.fillStyle='#17191B'; c.fillText('G top-left contour on cream, 6x  <- rim landing on jagged edge pixels',20,440);
    c.fillStyle='#FF00FF'; c.fillRect(700,450,660,420);
    c.drawImage(r1.canvas, 30,20,110,70, 700,450,660,420);
    c.fillStyle='#17191B'; c.fillText('same over magenta',700,440);
    return S.toDataURL('image/png');
  },{src,BASE,GROUND}));
  fs.writeFileSync('.design-audit/gio/relight-tail.png', Buffer.from(png.split(',')[1],'base64'));
  console.log('tail -> .design-audit/gio/relight-tail.png');
}
if (mode === 'tail') tail();
