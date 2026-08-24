const { chromium } = require('playwright');
const fs=require('fs'),path=require('path');
const ROOT='/Users/bo./projects/agentic-recruiting-landing';
(async()=>{
 const br=await chromium.launch(); const p=await br.newPage(); await p.setContent('<canvas id=c></canvas><canvas id=d></canvas>');
 const src=fs.readFileSync(ROOT+'/.design-audit/gio-src.png').toString('base64');
 const a=fs.readFileSync(ROOT+'/.design-audit/gio/matte-repair.png').toString('base64');
 const out=await p.evaluate(async ({src,a})=>{
   const ld=b64=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src='data:image/png;base64,'+b64;});
   const S=await ld(src), A=await ld(a);
   const c=document.getElementById('c'); c.width=S.width;c.height=S.height;
   const x=c.getContext('2d'); x.drawImage(S,0,0);
   const sd=x.getImageData(0,0,S.width,S.height).data;
   // ground truth mask: anything above the measured true-bg mean 0.3 by a wide margin
   const W=S.width,H=S.height; const lum=new Float32Array(W*H);
   for(let i=0,k=0;i<sd.length;i+=4,k++) lum[k]=0.299*sd[i]+0.587*sd[i+1]+0.114*sd[i+2];
   // per-row, find leftmost and rightmost pixel with lum>1.0 (bg is 0.3 mean, essentially 0)
   const rows=[];
   for(let y=0;y<H;y+=1){ let L=-1,R=-1; for(let xx=0;xx<W;xx++){ if(lum[y*W+xx]>1.0){ if(L<0)L=xx; R=xx; } } rows.push([L,R]); }
   // A mask edges
   const d2=document.getElementById('d'); d2.width=A.width;d2.height=A.height;
   const x2=d2.getContext('2d'); x2.clearRect(0,0,A.width,A.height); x2.drawImage(A,0,0);
   const ad=x2.getImageData(0,0,A.width,A.height).data;
   const AW=A.width,AH=A.height; const arows=[];
   for(let y=0;y<AH;y++){ let L=-1,R=-1; for(let xx=0;xx<AW;xx++){ if(ad[(y*AW+xx)*4+3]>128){ if(L<0)L=xx; R=xx; } } arows.push([L,R]); }
   // report the head band: source y 0.26H..0.62H
   const samp=[];
   for(let t=0.28;t<=0.60;t+=0.04){
     const sy=Math.round(t*H); const ay=Math.round(t*AH);
     samp.push({t:+t.toFixed(2), srcL:rows[sy][0], srcLpct:+(rows[sy][0]/W).toFixed(4), aL:arows[ay][0], aLpct:+(arows[ay][0]/AW).toFixed(4)});
   }
   // how much real material (lum>1) sits in the leftmost 12% of the frame, head band
   let mat=0, matBright=0;
   for(let y=Math.round(0.26*H);y<Math.round(0.62*H);y++) for(let xx=0;xx<Math.round(0.14*W);xx++){ const l=lum[y*W+xx]; if(l>1.0)mat++; if(l>8)matBright++; }
   return {W,H,AW,AH,samp,mat,matBright};
 },{src,a});
 console.log(JSON.stringify(out,null,1));
 await br.close();
})();
