const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer(async(req,res)=>{
  try {
    const rel=new URL(req.url,'http://localhost').pathname.replace(/^\/tool_xiaohongshu-card-generator/,'');
    const file=path.resolve(root,'.'+(rel==='/'?'/index.html':rel));
    if(!file.startsWith(root+path.sep))throw Error();
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
    res.end(await fs.readFile(file));
  }catch{res.statusCode=404;res.end();}
});
const wait=async p=>{await p.locator('#busy').waitFor({state:'hidden'});await p.waitForFunction(()=>document.getElementById('saveStatus').textContent==='已保存到此浏览器');};
const draft=async p=>p.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('xiaohongshu-free-canvas',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('draft').objectStore('draft').get('current');q.onsuccess=()=>{resolve(q.result);db.close();};};}));
async function selectTop(p) {
 await p.locator('[data-inspector-tab="layers"]').click();
 await p.locator('.layer-name').first().click();
 await p.locator('[data-inspector-tab="attributes"]').click();
}
async function run(){
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port+'/tool_xiaohongshu-card-generator/';
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  await fs.mkdir(path.join(root,'test-results/toolbar'),{recursive:true});
  const errors=[];
  try{
    const p=await browser.newPage({viewport:{width:1440,height:1000}});
    p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
    await p.goto(url);await wait(p);await p.locator('[data-action="addHeading"]').click();await wait(p);
    const actions=p.locator('.object-actions');
    assert.equal(await actions.locator('svg').count(),4);
    const widths=await actions.locator('button:visible').evaluateAll(bs=>bs.map(b=>b.getBoundingClientRect().width));
    assert.ok(widths.every(w=>w>=30));
    assert.equal(await p.locator('.home-link').getAttribute('href'),'https://andycr0w.github.io/');
    assert.equal(await p.locator('.asset-footer a').count(),0);
    await p.evaluate(()=>{
      window.originalLockIcon=document.querySelector('#lockButton svg');
      window.feedbackCount=0;
      new MutationObserver(ms=>{for(const m of ms)if(m.target.classList.contains('is-feedback')&&!(m.oldValue||'').includes('is-feedback'))window.feedbackCount++;}).observe(document.querySelector('.object-actions'),{attributes:true,attributeFilter:['class'],attributeOldValue:true,subtree:true});
    });
    // Disabled controls cannot initiate a feedback cycle.
    await p.locator('#groupButton').evaluate(b=>b.click());assert.equal(await p.evaluate(()=>window.feedbackCount),0);
    await p.locator('#lockButton').focus();await p.keyboard.press('Enter');await wait(p);
    assert.equal(await p.locator('#lockButton').getAttribute('aria-label'),'解锁');
    assert.equal(await p.locator('#lockButton').getAttribute('aria-pressed'),'true');
    assert.ok(await p.evaluate(()=>window.originalLockIcon===document.querySelector('#lockButton svg')));
    for(let i=0;i<3;i++){await p.locator('#lockButton').click();await wait(p);}
    assert.equal(await p.locator('#lockButton').getAttribute('aria-pressed'),'false');
    assert.ok(await p.evaluate(()=>window.originalLockIcon===document.querySelector('#lockButton svg')));
    // Fail a clone operation deliberately: no success motion or new object.
    const before=await p.locator('.layer').count();
    await p.evaluate(()=>{window.cloneBackup=fabric.Textbox.prototype.clone;fabric.Textbox.prototype.clone=()=>Promise.reject(new Error('test clone failure'));});
    const countBefore=await p.evaluate(()=>window.feedbackCount);
    await p.locator('[data-action="duplicate"]').click();await wait(p);
    assert.equal(await p.locator('.layer').count(),before);
    assert.equal(await p.evaluate(()=>window.feedbackCount),countBefore);
    await p.evaluate(()=>{fabric.Textbox.prototype.clone=window.cloneBackup;});
    for(let i=0;i<3;i++){await p.locator('[data-action="duplicate"]').click();await wait(p);}
    assert.equal(await p.locator('.layer').count(),before+3);
    assert.ok(await p.evaluate(()=>window.feedbackCount)>countBefore);
    await p.waitForTimeout(300);assert.equal(await p.locator('.is-feedback').count(),0);
    // New SVG format buttons preserve the exact two-character selection.
    await require('./text-edit-helper.cjs')(p);await p.keyboard.insertText('图标选区测试');
    await p.keyboard.press('Home');await p.keyboard.down('Shift');await p.keyboard.press('ArrowRight');await p.keyboard.press('ArrowRight');await p.keyboard.up('Shift');
    await p.locator('#boldButton').click();await wait(p);
    await p.locator('[data-text-align="center"]').click();await wait(p);
    await p.locator('#italicButton').click();await wait(p);
    let d=await draft(p),o=d.pages[d.current].scene.objects.at(-1);
    assert.equal(o.text,'图标选区测试');assert.equal(o.textAlign,'center');assert.equal(o.styles[0].start,0);assert.equal(o.styles[0].end,2);assert.equal(o.styles[0].style.fontStyle,'italic');
    assert.equal(await p.locator('[data-text-align="center"]').getAttribute('aria-pressed'),'true');
    await p.keyboard.press('Escape');await selectTop(p);
    await p.locator('[data-align="center"]').click();await wait(p);
    assert.equal(await p.locator('[data-align="center"]').getAttribute('aria-pressed'),'true');
    for(const align of ['left','center','right','top','middle','bottom']){
      await p.locator('[data-align="'+align+'"]').click();await wait(p);
      assert.equal(await p.locator('[data-align="'+align+'"]').getAttribute('aria-pressed'),'true');
    }
    await p.emulateMedia({reducedMotion:'reduce'});
    await p.locator('#lockButton').click();await wait(p);
    assert.equal(await p.locator('.is-feedback').count(),0);
    assert.equal(await p.locator('.lock-shackle').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
    await p.locator('#lockButton').click();await wait(p);
    await p.emulateMedia({reducedMotion:'no-preference'});
    await p.locator('#propertySettings').evaluate(el=>el.scrollTop=0);
    await p.screenshot({path:path.join(root,'test-results/toolbar/desktop.png')});
    console.log('PASS toolbar: icons survive state updates; keyboard, disabled, failed, repeated actions; partial text selection; paragraph/alignment states; reduced motion.');
    await p.close();
    // Desktop browser zoom changes effective CSS viewport and device pixel ratio.
    // Model both together; do not use CSS zoom or canvas/page-scale emulation.
    const cases=[
      {name:'dpr-1',w:1440,h:1000,dpr:1},{name:'dpr-125',w:1440,h:1000,dpr:1.25},
      {name:'dpr-150',w:1440,h:1000,dpr:1.5},{name:'dpr-2',w:1440,h:1000,dpr:2},
      {name:'zoom-125-equivalent',w:1152,h:800,dpr:1.25},
      {name:'zoom-150-equivalent',w:960,h:667,dpr:1.5},
      {name:'narrow',w:800,h:850,dpr:1},
      {name:'mobile',w:390,h:844,dpr:2,mobile:true},
      {name:'mobile-small',w:320,h:720,dpr:2,mobile:true}
    ];
    for(const spec of cases){
      const c=await browser.newContext({viewport:{width:spec.w,height:spec.h},deviceScaleFactor:spec.dpr,isMobile:!!spec.mobile,hasTouch:!!spec.mobile});
      const q=await c.newPage();q.setDefaultTimeout(12000);q.on('pageerror',e=>errors.push(e.message));
      await q.goto(url);await wait(q);
      if(spec.mobile)await q.locator('[data-action="showElements"]').click();
      await q.locator('[data-action="addHeading"]').click();await wait(q);
      if(spec.mobile)await q.locator('[data-action="showProperties"]').click();
      const metrics=await q.evaluate(()=>{
        const home=document.querySelector('.home-link').getBoundingClientRect();
        const exp=document.querySelector('.top-actions').getBoundingClientRect();
        const css=sel=>getComputedStyle(document.querySelector(sel));
        const overlaps=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
        return {overflow:document.documentElement.scrollWidth>innerWidth,homeVisible:home.x>=0&&home.y>=0&&home.right<=innerWidth,homeOverlaps:overlaps(home,exp),input:parseFloat(css('#fontSize').fontSize),label:parseFloat(css('.properties .field').fontSize),hint:parseFloat(css('#controlTooltip').fontSize),transform:css('#fontSize').transform};
      });
      assert.equal(metrics.overflow,false,spec.name+' horizontal overflow');
      assert.ok(metrics.homeVisible);assert.equal(metrics.homeOverlaps,false);
      assert.ok(metrics.input>=(spec.mobile?16:14));assert.ok(metrics.label>=13);assert.ok(metrics.hint>=12);assert.equal(metrics.transform,'none');
      const edge=await q.locator('.inspector-tabs').evaluate(e=>e.getBoundingClientRect().right);
      for(const control of await q.locator('#selectedProperties .info-button:visible, #selectedProperties .selection-heading .danger').all()){
        const r=await control.boundingBox();assert.ok(r.x+r.width<=edge+1&&r.width>=24,spec.name+' header actions stay within panel');
      }
      const gaps=await q.locator('#textProperties').evaluate(e=>({group:getComputedStyle(e).rowGap,field:getComputedStyle(e.querySelector('.field')).gap}));
      assert.equal(gaps.group,'12px');assert.equal(gaps.field,'6px');
      await q.locator('[data-align="bottom"]').scrollIntoViewIfNeeded();
      const icons=await q.locator('.align-buttons button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),svg=e.querySelector('svg').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,icon:svg.width};}));
      assert.equal(icons.length,6);assert.equal(new Set(icons.map(r=>r.y)).size,1);
      assert.ok(icons.every(r=>r.icon===18&&r.h>=(spec.mobile?44:36)&&r.x>=0&&r.x+r.w<=spec.w));
      if(spec.mobile)assert.ok(icons.every(r=>r.w>=44));
      const labels=await q.locator('.align-buttons .control-label, .object-actions button:visible .control-label').evaluateAll(es=>es.map(e=>({hidden:e.classList.contains('sr-only'),fits:e.scrollWidth<=e.clientWidth,help:e.parentElement.hasAttribute('data-help')})));
      assert.ok(labels.every(e=>e.hidden?e.help:e.fits&&!e.help),'icon alignment has accessible names and tooltips; action labels fit');
      const rows=await q.locator('.object-actions button:visible').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().y));
      assert.equal(new Set(rows).size,1);
      assert.equal(await q.locator('.info-button svg').first().evaluate(e=>e.getBoundingClientRect().width),16);
      await q.screenshot({path:path.join(root,'test-results/toolbar/'+spec.name+'.png')});
      await c.close();
    }
    assert.deepEqual(errors,[]);
    console.log('PASS display matrix: DPR 1/1.25/1.5/2, 100/125/150% zoom-equivalent layouts, 800px desktop, 390/320px mobile; readable CSS sizes, no overflow or Home/export overlap.');
  }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());

