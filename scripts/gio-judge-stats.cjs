const { chromium } = require('playwright');
const fs = require('fs');
const ROOT='/Users/bo./projects/agentic-recruiting-landing';
(async()=>{
 const b=await chromium.launch(); const p=await b.newPage();
 await p.setContent('<canvas id=c></canvas>');
 for (const f of ['.design-audit/gio/matte-repair.png','.design-audit/gio/relight.png','.design-audit/gio/flat-silhouette.png','assets/gio.png']){
  const b64=fs.readFileSync(ROOT+'/'+f).toString('base64');
  const r=await p.evaluate(async(b64)=>{
    const img=await new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.src='data:image/png;base64,'+b64;});
    const W=img.width,H=img.height;const c=document.getElementById('c');c.width=W;c.height=H;
    const x=c.getContext('2d');x.clearRect(0,0,W,H);x.drawImage(img,0,0);
    const d=x.getImageData(0,0,W,H).data;
    // connected components of alpha>=40
    const seen=new Uint8Array(W*H); const comps=[];
    for(let s=0;s<W*H;s++){
      if(seen[s]||d[s*4+3]<40)continue;
      let n=0,minx=W,maxx=0,miny=H,maxy=0;const st=[s];seen[s]=1;
      while(st.length){const k=st.pop();n++;const kx=k%W,ky=(k/W)|0;
        if(kx<minx)minx=kx;if(kx>maxx)maxx=kx;if(ky<miny)miny=ky;if(ky>maxy)maxy=ky;
        const nb=[k-1,k+1,k-W,k+W];
        for(const j of nb){if(j<0||j>=W*H)continue;if(Math.abs((j%W)-kx)>1)continue;if(seen[j]||d[j*4+3]<40)continue;seen[j]=1;st.push(j);}}
      comps.push({n,box:[minx,miny,maxx,maxy]});
    }
    comps.sort((a,b)=>b.n-a.n);
    // semi transparent count
    let semi=0,opaque=0;
    for(let k=0;k<W*H;k++){const a=d[k*4+3];if(a>0&&a<250)semi++;if(a>=250)opaque++;}
    // interior holes: alpha<40 not reachable from border
    const bg=new Uint8Array(W*H);const st2=[];
    for(let cx=0;cx<W;cx++){st2.push(cx,cx+(H-1)*W);} for(let cy=0;cy<H;cy++){st2.push(cy*W,cy*W+W-1);}
    while(st2.length){const k=st2.pop();if(k<0||k>=W*H)continue;if(bg[k]||d[k*4+3]>=40)continue;bg[k]=1;
      const kx=k%W;const nb=[k-1,k+1,k-W,k+W];
      for(const j of nb){if(j<0||j>=W*H)continue;if(Math.abs((j%W)-kx)>1)continue;st2.push(j);}}
    let holes=0;for(let k=0;k<W*H;k++)if(d[k*4+3]<40&&!bg[k])holes++;
    return {W,H,ncomp:comps.length,top:comps.slice(0,6).map(c=>({px:c.n,box:c.box})),semi,semiPct:+(100*semi/(W*H)).toFixed(2),opaque,holes};
  },b64);
  console.log(f, JSON.stringify(r));
 }
 await b.close();
})();
