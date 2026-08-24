const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const ROOT='/Users/bo./projects/agentic-recruiting-landing';
const CANDS=[['now','assets/gio.png'],['a','.design-audit/gio/matte-repair.png'],['b','.design-audit/gio/relight.png'],['c','.design-audit/gio/dark-plate.png'],['d','.design-audit/gio/flat-silhouette.png']];
const uri=p=>'data:image/png;base64,'+fs.readFileSync(path.join(ROOT,p)).toString('base64');
(async()=>{
 const br=await chromium.launch();
 // ---- webp payload at 2x the shipped box
 {
  const p=await br.newPage(); await p.setContent('<canvas id=c></canvas>');
  for(const [n,f] of CANDS){
    const b64=fs.readFileSync(path.join(ROOT,f)).toString('base64');
    const r=await p.evaluate(async b64=>{
      const img=await new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.src='data:image/png;base64,'+b64;});
      // contain into 200x306 css, at dpr2 -> 400x612 device
      const s=Math.min(400/img.width,612/img.height);
      const W=Math.round(img.width*s),H=Math.round(img.height*s);
      const c=document.getElementById('c');c.width=W;c.height=H;
      const x=c.getContext('2d');x.clearRect(0,0,W,H);x.imageSmoothingQuality='high';x.drawImage(img,0,0,W,H);
      const out={W,H};
      for(const q of [0.8,0.9]) out['q'+q]=Math.round(c.toDataURL('image/webp',q).length*3/4/1024);
      return out;
    },b64);
    console.log('WEBP', n, JSON.stringify(r));
  }
  await p.close();
 }
 // ---- hero with mascot deleted
 {
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const p=await br.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  await p.setContent(html,{waitUntil:'load'});
  await p.addStyleTag({content:'.hero-mascot{display:none !important}'});
  await p.waitForTimeout(500);
  await p.screenshot({path:path.join(ROOT,'.design-audit/gio/judge-no-mascot.png'),clip:{x:0,y:0,width:1440,height:900}});
  await p.close();
 }
 await br.close(); console.log('ok');
})();
