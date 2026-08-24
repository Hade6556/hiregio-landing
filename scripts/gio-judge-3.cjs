const { chromium } = require('playwright');
const fs=require('fs'),path=require('path');
const ROOT='/Users/bo./projects/agentic-recruiting-landing';
const uri=p=>'data:image/png;base64,'+fs.readFileSync(path.join(ROOT,p)).toString('base64');
(async()=>{
 const br=await chromium.launch();
 const p=await br.newPage({viewport:{width:1300,height:520},deviceScaleFactor:2});
 // zoom the left flank of the head for src / A / B, 4x, on cream
 const rows=[['SRC (opaque)','.design-audit/gio-src.png',442,864],['A','.design-audit/gio/matte-repair.png',420,810],['B','.design-audit/gio/relight.png',410,847]];
 const cells=rows.map(([n,f,W,H])=>{
   // region: x 0..0.30W, y 0.28H..0.62H  -> left flank of head
   const rx=0, ry=Math.round(0.26*H), rw=Math.round(0.30*W), rh=Math.round(0.34*H);
   const z=380/rw;
   return `<div class=cell><div class=lab>${n}</div>
   <div class=win style="width:380px;height:${Math.round(rh*z)}px">
     <img src="${uri(f)}" style="position:absolute;left:${-rx*z}px;top:${-ry*z}px;width:${W*z}px;height:${H*z}px;image-rendering:auto">
   </div></div>`;
 }).join('');
 await p.setContent(`<style>*{margin:0;box-sizing:border-box}body{background:#FBFAF7;font:11px/1.4 system-ui;padding:12px;color:#17191B}
 .row{display:flex;gap:14px}.win{position:relative;overflow:hidden;border:1px solid #E5E2DA;background:#FBFAF7}
 .lab{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:rgba(23,25,27,.6);margin-bottom:5px}
 .cap{margin-top:10px;font-size:10px;color:rgba(23,25,27,.6)}</style>
 <div class=row>${cells}</div><div class=cap>left flank of the head, same region, on cream. is the little grey block part of the render or a matte artifact?</div>`);
 await p.screenshot({path:path.join(ROOT,'.design-audit/gio/judge-flank.png'),fullPage:true});
 await br.close();console.log('ok');
})();
