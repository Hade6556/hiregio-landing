const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const keyed = fs.readFileSync('assets/gio.png').toString('base64');
  await p.setContent('<canvas id=c></canvas>');
  const out = await p.evaluate(async ({ keyed }) => {
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + keyed; });
    const W = img.width, H = img.height;
    const c = document.getElementById('c'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, W, H).data;

    // border-reachable transparent flood
    const seen = new Uint8Array(W*H), st = [];
    for (let i=0;i<W;i++) st.push(i,0,i,H-1);
    for (let j=0;j<H;j++) st.push(0,j,W-1,j);
    while (st.length) { const y=st.pop(), xx=st.pop();
      if (xx<0||y<0||xx>=W||y>=H) continue;
      const k=y*W+xx; if (seen[k]||d[k*4+3]>8) continue; seen[k]=1;
      st.push(xx+1,y,xx-1,y,xx,y+1,xx,y-1); }

    // label interior hole components
    const lab = new Int32Array(W*H).fill(-1);
    const comps = [];
    for (let s=0;s<W*H;s++) {
      if (lab[s]!==-1 || seen[s] || d[s*4+3]>8) continue;
      const id = comps.length, q=[s]; lab[s]=id;
      let n=0, minx=W,maxx=0,miny=H,maxy=0;
      while(q.length){ const k=q.pop(); n++;
        const cx=k%W, cy=(k/W)|0;
        if(cx<minx)minx=cx; if(cx>maxx)maxx=cx; if(cy<miny)miny=cy; if(cy>maxy)maxy=cy;
        for(const[nx,ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]){
          if(nx<0||ny<0||nx>=W||ny>=H) continue;
          const nk=ny*W+nx; if(lab[nk]!==-1||seen[nk]||d[nk*4+3]>8) continue;
          lab[nk]=id; q.push(nk); } }
      comps.push({n,box:[minx,miny,maxx,maxy]});
    }
    comps.sort((a,b)=>b.n-a.n);

    // alpha histogram
    let clear=0,semi=0,opaque=0;
    for(let i=3;i<d.length;i+=4){const a=d[i]; if(a<=8)clear++; else if(a>=250)opaque++; else semi++;}

    // where are the semi pixels? interior (surrounded by opaque) vs on the outer boundary
    let semiInterior=0;
    for(let k=0;k<W*H;k++){const a=d[k*4+3]; if(a<=8||a>=250) continue;
      // is it adjacent to a border-reachable transparent pixel within 2px?
      const cx=k%W, cy=(k/W)|0; let near=false;
      for(let dy=-2;dy<=2&&!near;dy++)for(let dx=-2;dx<=2;dx++){
        const nx=cx+dx, ny=cy+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue;
        if(seen[ny*W+nx]){near=true;break;} }
      if(!near) semiInterior++; }

    // luminance of the OPAQUE material, so I know what I am grading
    const hist=new Array(24).fill(0); let n=0;
    for(let k=0;k<W*H;k++){ if(d[k*4+3]<250) continue; n++;
      const i=k*4, L=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
      hist[Math.min(23,Math.floor(L/8))]++; }
    // percentiles
    const pct=(q)=>{let acc=0,target=q*n; for(let i=0;i<24;i++){acc+=hist[i]; if(acc>=target) return i*8;} return 192;};

    // chroma of the material
    let sr=0,sg=0,sb=0;
    for(let k=0;k<W*H;k++){ if(d[k*4+3]<250) continue; const i=k*4; sr+=d[i];sg+=d[i+1];sb+=d[i+2]; }

    return { W,H, clear,semi,opaque, pctSemi:+(100*semi/(W*H)).toFixed(2),
      holesTotal: comps.reduce((a,b)=>a+b.n,0), holeComps: comps.length,
      biggest: comps.slice(0,8),
      semiInterior,
      matHist: hist, matN:n, p05:pct(0.05), p50:pct(0.5), p95:pct(0.95), p99:pct(0.99),
      meanRGB:[+(sr/n).toFixed(1),+(sg/n).toFixed(1),+(sb/n).toFixed(1)] };
  }, { keyed });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
