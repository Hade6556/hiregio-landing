/* Proof sheet for STRATEGY C - DARK PLATE.  1400x900, #FBFAF7 ground.
   a  AS SHIPPED     whole cream hero at 28%, then the bottom-right corner 1:1
   b  CTA PANE       the same figure on --dark, 1:1, then the whole pane
   c  MATTE          there is no matte. Over magenta anyway, then two 4x
                     blow-ups: the plate's outer edge against cream, and the
                     place where the render's own black rectangle falls
   d  SIDE BY SIDE   assets/gio.png against this one, in the real box and at
                     200px wide, on the cream page ground                      */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, '.design-audit/gio');

const d64 = f => 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, f)).toString('base64');
const PLATE = d64('.design-audit/gio/dark-plate.png');
const CTA   = d64('.design-audit/gio/dark-plate-cta.png');
const NOW   = d64('assets/gio.png');
const META  = JSON.parse(fs.readFileSync(path.join(OUT, '_dark-plate.json'), 'utf8'));
const { dX, dY } = META.src;                    // the render's rect inside the plate

const A = 396, B = 292, C = 200, D = 424, GAP = 16, PAD = 20, H = 828;
const VW = 1400, VH = 828;                      // the viewport the mocks assume
const WRAP_R = (VW - 1280) / 2 + 40;            // page x of the wrap's content right edge = VW - WRAP_R

// ---------------------------------------------------------------- hero mock
const hero = () => `
<div class="dm" style="width:${VW}px;height:${VH}px;background:#FBFAF7;color:#17191B;position:relative">
  <div style="position:absolute;inset:0;background:radial-gradient(120% 88% at 50% 108%,rgba(30,107,78,0.20) 0%,rgba(30,107,78,0.07) 44%,rgba(251,250,247,0) 74%)"></div>
  <div style="height:77px;border-bottom:1px solid #E5E2DA;display:flex;align-items:center;justify-content:space-between;padding:0 ${WRAP_R}px">
    <span style="font-size:22px;font-weight:700;letter-spacing:-.03em">HireGio</span>
    <span style="display:flex;align-items:center;gap:32px;font-size:15px;color:rgba(23,25,27,.68)">
      <span>Platform</span><span>How it works</span><span>Pricing</span>
      <span style="display:inline-flex;align-items:center;height:40px;padding:0 16px;border-radius:10px;background:#1E6B4E;color:#fff;font-weight:500">Book a demo</span>
    </span>
  </div>
  <div style="position:relative;width:1280px;margin:0 auto;padding:40px 40px 0;height:${VH-77}px;display:flex;flex-direction:column">
    <div style="position:relative;flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center">
      <p style="margin:0 0 24px;font-size:12px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:rgba(23,25,27,.62)">The agentic recruiting platform</p>
      <h1 style="margin:0 auto 24px;max-width:1120px;font-size:84px;line-height:1.02;letter-spacing:-.035em;font-weight:500">Somewhere out there is your next great hire. Gio will find them.</h1>
      <p style="margin:0 auto 40px;max-width:760px;font-size:21px;line-height:1.45;letter-spacing:-.01em;color:rgba(23,25,27,.68)">Gio agents work until they find the one person who is actually right for the role, in minutes, not days.</p>
      <div style="display:flex;gap:16px;justify-content:center">
        <span style="display:inline-flex;align-items:center;height:50px;padding:0 24px;border-radius:10px;background:#1E6B4E;color:#fff;font-size:16px;font-weight:500">Book a demo</span>
        <span style="display:inline-flex;align-items:center;height:50px;padding:0 24px;border-radius:10px;border:1px solid #E5E2DA;background:#fff;font-size:16px;font-weight:500">Start for free</span>
      </div>
      <p style="margin:24px 0 0;font-size:14px;color:rgba(23,25,27,.62)">Works with Greenhouse, Lever, Ashby and 20 more</p>
      <p style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;margin:40px 0 0">
        <span style="font-size:12px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:rgba(23,25,27,.62);margin-right:8px">Built for</span>
        ${['Founders','TA teams','Hiring managers','Recruiters','Agencies'].map(t=>`<span style="border:1px solid #E5E2DA;border-radius:999px;padding:8px 16px;font-size:13px;color:rgba(23,25,27,.68);background:#FBFAF7">${t}</span>`).join('')}
      </p>
      <!-- .hero-mascot, exactly as index.html positions it -->
      <div style="position:absolute;right:40px;bottom:0;width:200px;height:306px;
                  background:url(${PLATE}) right bottom/contain no-repeat"></div>
    </div>
    <div style="margin-top:auto;padding-top:24px;border-top:1px solid #E5E2DA;text-align:center;padding-bottom:24px">
      <p style="margin:0 0 16px;font-size:12px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:rgba(23,25,27,.62)">Trusted by teams hiring at speed</p>
      <div style="display:flex;justify-content:center;gap:24px 80px;font-size:20px;font-weight:700;letter-spacing:-.02em;color:rgba(23,25,27,.62)">
        <span>Northwind</span><span>Meridian</span><span>Kestrel</span><span>Fieldbook</span><span>Loomis</span><span>Arcadia</span>
      </div>
    </div>
  </div>
</div>`;

// ----------------------------------------------------------------- cta mock
const CTA_W = 260;
const ctaPane = () => `
<div class="dm" style="position:relative;width:${VW}px;height:${VH}px;background:#0F1F19;overflow:hidden">
  <div style="position:absolute;inset:0;background:radial-gradient(120% 88% at 50% 108%,rgba(46,122,91,0.30) 0%,rgba(19,51,39,0.16) 46%,rgba(15,31,25,0) 76%)"></div>
  <div style="position:absolute;left:50%;transform:translateX(-50%);top:200px;width:760px;text-align:center;color:#fff">
    <p style="margin:0 0 24px;font-size:12px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.62)">Get started</p>
    <h2 style="margin:0;font-size:48px;line-height:1.08;letter-spacing:-.025em;font-weight:500">Open a role. See a shortlist today.</h2>
    <p style="margin:24px 0 0;font-size:21px;line-height:1.45;letter-spacing:-.01em;color:rgba(255,255,255,.72)">Bring one job description. We will show you the brief, the shortlist and the reasoning.</p>
    <div style="display:flex;gap:16px;justify-content:center;margin-top:40px">
      <span style="display:inline-flex;align-items:center;height:50px;padding:0 24px;border-radius:10px;background:#fff;color:#0F1F19;font-size:16px;font-weight:500">Book a demo</span>
      <span style="display:inline-flex;align-items:center;height:50px;padding:0 24px;border-radius:10px;border:1px solid rgba(255,255,255,.28);color:#fff;font-size:16px;font-weight:500">Start for free</span>
    </div>
  </div>
  <div style="position:absolute;right:${WRAP_R}px;bottom:0;width:${CTA_W}px;height:${Math.round(CTA_W*760/520)}px;
              background:url(${CTA}) right bottom/contain no-repeat"></div>
</div>`;

// the CTA figure's centre, in page x, so the 1:1 crop can be centred on him
const CTA_CX = VW - WRAP_R - CTA_W / 2;
// the plate's centre in the hero, likewise
const HERO_CX = VW - WRAP_R - 100;

const html = (nowH) => `
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box}
  body{margin:0;width:1400px;height:900px;background:#FBFAF7;
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
  .sheet{display:flex;gap:${GAP}px;padding:${PAD}px}
  .cap{font-size:13px;line-height:1.25;color:#17191B;margin:0 0 3px}
  .sub{font-size:11px;line-height:1.35;color:rgba(23,25,27,0.62);margin:0 0 8px;height:30px;overflow:hidden}
  .tick{font-size:10.5px;line-height:1.35;color:rgba(23,25,27,0.62);margin:5px 0 0;text-align:center}
  .tick b{color:#17191B;font-weight:700}
  .fr{position:relative;overflow:hidden;border:1px solid #E5E2DA}
  .dm{font-family:"DM Sans",system-ui,-apple-system,sans-serif}
</style>
<div class="sheet">

  <!-- ============ a ============ -->
  <div style="width:${A}px">
    <p class="cap">a &nbsp;AS SHIPPED ON THE PAGE</p>
    <p class="sub">The ground this strategy proposes: a --dark plate in the cream hero's right gutter.</p>
    <div class="fr" style="width:${A}px;height:${Math.round(VH*A/VW)}px">
      <div style="position:absolute;left:0;top:0;transform:scale(${(A/VW).toFixed(5)});transform-origin:0 0">${hero()}</div>
    </div>
    <p class="tick">whole hero, ${(A/VW*100).toFixed(0)}% &mdash; does the plate read as part of the page?</p>
    <div class="fr" style="width:${A}px;height:523px;margin-top:8px">
      <div style="position:absolute;left:${-(HERO_CX - A/2)}px;bottom:0">${hero()}</div>
    </div>
    <p class="tick"><b>1:1 &mdash; the corner, at the only size that ships.</b></p>
  </div>

  <!-- ============ b ============ -->
  <div style="width:${B}px">
    <p class="cap">b &nbsp;THE DARK CTA PANE</p>
    <p class="sub">Second placement. On --dark no plate is needed &mdash; the falloff field is the alpha.</p>
    <div class="fr" style="width:${B}px;height:520px">
      <div style="position:absolute;left:${-(CTA_CX - B/2)}px;bottom:0">${ctaPane()}</div>
    </div>
    <p class="tick">1:1 over the pane's gradient wash. No rectangle,<br>because the asset's own edge is fully transparent.</p>
    <div class="fr" style="width:${B}px;height:${Math.round(VH*B/VW)}px;margin-top:8px">
      <div style="position:absolute;left:0;top:0;transform:scale(${(B/VW).toFixed(5)});transform-origin:0 0">${ctaPane()}</div>
    </div>
    <p class="tick">whole pane, ${(B/VW*100).toFixed(0)}%. Gio at 260 CSS px.</p>
  </div>

  <!-- ============ c ============ -->
  <div style="width:${C}px">
    <p class="cap">c &nbsp;MATTE &mdash; there isn't one</p>
    <p class="sub">The plate is opaque. Over magenta only its top corners show.</p>
    <div style="width:${C}px;background:#FF00FF">
      <img src="${PLATE}" style="display:block;width:200px;height:306px">
    </div>
    <p class="tick">the asset over #FF00FF</p>
    <div style="width:${C}px;height:180px;background:#FBFAF7;overflow:hidden;position:relative;margin-top:8px;border:1px solid #E5E2DA">
      <div style="position:absolute;inset:0;background:url(${PLATE}) no-repeat;background-size:1600px 2448px;
                  background-position:36px -8px;image-rendering:pixelated"></div>
    </div>
    <p class="tick">4&times; &mdash; the plate's outer edge on cream:<br>a deliberate card corner, 18px, lit rim.</p>
    <div style="width:${C}px;height:180px;background:#FBFAF7;overflow:hidden;position:relative;margin-top:8px;border:1px solid #E5E2DA">
      <div style="position:absolute;inset:0;background:url(${PLATE}) no-repeat;background-size:1600px 2448px;
                  background-position:${-(dX-25)*4}px ${-290*4}px;image-rendering:pixelated"></div>
      <div style="position:absolute;left:100px;top:0;bottom:0;width:1px;background:rgba(255,0,255,.9)"></div>
    </div>
    <p class="tick">4&times; &mdash; magenta marks the left edge of the<br>render's own black rectangle. No seam.</p>
  </div>

  <!-- ============ d ============ -->
  <div style="width:${D}px">
    <p class="cap">d &nbsp;SIDE BY SIDE</p>
    <p class="sub">Left, the current keyed asset. Right, this one. Both on cream.</p>
    <div style="width:${D}px;height:803px;border:1px solid #E5E2DA;background:#FBFAF7;padding:4px 12px;overflow:hidden">
      <p class="tick" style="margin:0 0 4px"><b>as it actually ships</b> &mdash; the real 200 &times; 306 box, contain</p>
      <div style="display:flex;gap:16px;justify-content:center">
        <div style="width:200px;height:306px;outline:1px dashed #D8D4CA;background:url(${NOW}) right bottom/contain no-repeat"></div>
        <div style="width:200px;height:306px;outline:1px dashed #D8D4CA;background:url(${PLATE}) right bottom/contain no-repeat"></div>
      </div>
      <div style="display:flex;gap:16px;justify-content:center">
        <p class="tick" style="width:200px;margin-top:3px"><b>now</b> &mdash; 154 &times; 306 inside the box</p>
        <p class="tick" style="width:200px;margin-top:3px"><b>yours</b> &mdash; 200 &times; 306, fills it</p>
      </div>
      <div style="height:1px;background:#E5E2DA;margin:5px 0"></div>
      <p class="tick" style="margin:0 0 4px"><b>at 200px wide</b>, bottom-aligned</p>
      <div style="display:flex;gap:16px;justify-content:center;align-items:flex-end;height:398px">
        <img src="${NOW}" style="display:block;width:200px;height:${nowH}px">
        <img src="${PLATE}" style="display:block;width:200px;height:306px">
      </div>
      <div style="display:flex;gap:16px;justify-content:center">
        <p class="tick" style="width:200px;margin-top:3px"><b>now</b> &mdash; 1463 holes, 2.38% fringe</p>
        <p class="tick" style="width:200px;margin-top:3px"><b>yours</b> &mdash; 0 holes, 0.05% fringe</p>
      </div>
    </div>
  </div>

</div>`;

(async () => {
  const browser = await chromium.launch();
  const probe = await browser.newPage();
  await probe.setContent('<i></i>');
  const nowSize = await probe.evaluate(async (u) => { const i = await new Promise(r=>{const m=new Image();m.onload=()=>r(m);m.src=u}); return {w:i.width,h:i.height}; }, NOW);
  await probe.close();

  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  await page.setContent(html(Math.round(200 * nowSize.h / nowSize.w)), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, 'dark-plate-proof.png'), clip: { x: 0, y: 0, width: 1400, height: 900 } });
  console.log('now asset', nowSize, '-> .design-audit/gio/dark-plate-proof.png');
  await browser.close();
})();
