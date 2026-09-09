const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep))throw Error();
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
    res.end(await fs.readFile(file));
  }catch{res.statusCode=404;res.end();}
});
const saved=async p=>{await p.locator('#busy').waitFor({state:'hidden'});await p.waitForFunction(()=>document.getElementById('saveStatus').textContent==='已保存到此浏览器');};
const draft=p=>p.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('xiaohongshu-free-canvas',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('draft').objectStore('draft').get('current');q.onsuccess=()=>{resolve(q.result);db.close();};};}));
const height=p=>p.locator('.upper-canvas').evaluate(e=>e.getBoundingClientRect().height);
async function exportCurrent(p,file){
  await p.locator('[data-action="export"]').click();
  const download=p.waitForEvent('download');await p.locator('[data-action="exportCurrent"]').click();
  await (await download).saveAs(file);await p.locator('#busy').waitFor({state:'hidden'});
  if(await p.locator('#exportDialog').isVisible())await p.locator('#exportDialog [aria-label="关闭"]').click();
  return fs.readFile(file);
}
async function run(){
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  const out=path.join(root,'test-results/workspace');await fs.mkdir(out,{recursive:true});
  const errors=[];
  try{
    const p=await browser.newPage({viewport:{width:1280,height:720}});p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
    await p.goto('http://127.0.0.1:'+server.address().port);await saved(p);
    const initial=await draft(p),normalHeight=await height(p);
    // Previous layout: 76px header, 57px toolbar, 28px status, 106px pages, 56px padding.
    assert.ok(normalHeight>=(720-76-57-28-106-56)*1.1,'at least 10% more canvas height');
    assert.equal(await p.locator('#zoomLabel').inputValue(),'fit');
    await p.screenshot({path:path.join(out,'desktop-1280.png')});
    const originalPNG=await exportCurrent(p,path.join(out,'before-view.png'));
    await p.locator('[data-action="beginTemplates"]').click();
    assert.equal(await p.locator('[data-tab="templates"]').getAttribute('aria-selected'),'true');
    await p.locator('#focusMode').click();
    await p.waitForFunction(()=>document.querySelector('.upper-canvas').height>0);
    assert.equal(await p.locator('#assetsPanel').isVisible(),false);
    assert.equal(await p.locator('#propertiesPanel').isVisible(),false);
    assert.equal(await p.locator('.pages-bar').isVisible(),false);
    await p.locator('#zoomLabel').selectOption('1');assert.equal(await height(p),1440);
    await p.setViewportSize({width:1440,height:900});assert.equal(await height(p),1440);
    await p.locator('#focusMode').click();assert.equal(await height(p),1440);
    assert.equal(await p.locator('[data-tab="templates"]').getAttribute('aria-selected'),'true');
    await p.locator('#zoomLabel').selectOption('fit');assert.ok(await height(p)<1440);
    for(const v of ['0.5','0.75','1.5']){await p.locator('#zoomLabel').selectOption(v);assert.equal(await height(p),1440*Number(v));}
    await p.locator('[data-action="zoomOut"]').click();assert.equal(await p.locator('#zoomLabel').inputValue(),'custom');
    await p.locator('#zoomLabel').selectOption('fit');
    assert.deepEqual(await draft(p),initial,'view operations must not change saved artwork');
    assert.ok(await p.locator('#undo').isDisabled());assert.ok(await p.locator('#redo').isDisabled());
    assert.deepEqual(await exportCurrent(p,path.join(out,'after-view.png')),originalPNG,'view changes preserve exported pixels');
    await p.locator('[data-action="beginText"]').click();await saved(p);
    const contrast=await p.evaluate(()=>{
      const luminance=rgb=>{const v=rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
      return ['.top-actions .primary','.asset-footer','.add-text span','.properties .field'].map(selector=>{
        const el=document.querySelector(selector),style=getComputedStyle(el);let parent=el,bg;
        do{bg=getComputedStyle(parent).backgroundColor;parent=parent.parentElement;}while(parent&&(bg==='transparent'||bg==='rgba(0, 0, 0, 0)'));
        const a=luminance(style.color),b=luminance(bg);return {selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
      });
    });
    assert.ok(contrast.every(x=>x.ratio>=4.5),JSON.stringify(contrast));
    assert.equal(await p.locator('#geometryDetails').getAttribute('open'),null);
    assert.equal(await p.locator('#alignmentDetails').getAttribute('open'),null);
    assert.equal(await p.locator('#groupButton').isVisible(),false);assert.equal(await p.locator('#ungroupButton').isVisible(),false);
    await p.locator('#geometryDetails summary').click();await p.locator('#alignmentDetails summary').click();
    const added=await draft(p);
    await p.locator('#focusMode').click();await p.locator('#focusMode').click();
    assert.notEqual(await p.locator('#geometryDetails').getAttribute('open'),null);
    assert.notEqual(await p.locator('#alignmentDetails').getAttribute('open'),null);
    assert.deepEqual(await draft(p),added);
    await p.locator('#editTextButton').click();await p.waitForFunction(()=>document.activeElement?.tagName==='TEXTAREA');
    await p.keyboard.insertText('明确的编辑入口');await p.keyboard.press('Escape');await saved(p);
    assert.equal((await draft(p)).pages[0].scene.objects.at(-1).text,'明确的编辑入口');
    await p.locator('.canvas-toolbar').click({position:{x:2,y:2}});await p.keyboard.press('Control+a');
    assert.ok(await p.locator('#groupButton').isVisible());assert.equal(await p.locator('#ungroupButton').isVisible(),false);
    await p.locator('#groupButton').click();await saved(p);
    assert.equal(await p.locator('#groupButton').isVisible(),false);assert.ok(await p.locator('#ungroupButton').isVisible());
    await p.locator('#ungroupButton').click();await saved(p);
    await p.locator('#undo').click();await saved(p);assert.equal((await draft(p)).pages[0].scene.objects.length,1);
    await p.locator('#undo').click();await saved(p);assert.equal((await draft(p)).pages[0].scene.objects.length,added.pages[0].scene.objects.length);
    await p.locator('#undo').click();await saved(p);assert.deepEqual(await draft(p),added,'view changes must not add undo steps');
    await p.locator('#undo').click();await saved(p);assert.deepEqual(await draft(p),initial);
    assert.ok(await p.locator('#undo').isDisabled());
    await p.screenshot({path:path.join(out,'desktop-1440.png')});
    const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const m=await mobile.newPage();m.on('pageerror',e=>errors.push(e.message));
    await m.goto('http://127.0.0.1:'+server.address().port);await saved(m);
    assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await m.locator('#focusMode').isVisible(),false);
    const boxes=await m.locator('.page-actions button, #pageCount').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
    assert.ok(boxes.every(r=>r.x>=0&&r.x+r.w<=390));
    await m.screenshot({path:path.join(out,'mobile-390.png')});
    await m.locator('[data-action="showProperties"]').tap();
    await m.locator('[data-action="beginText"]').tap();await saved(m);await m.locator('.sheet-mounted').waitFor({state:'detached'});
    await m.locator('[data-action="showProperties"]').tap();await m.locator('#editTextButton').tap();
    await m.waitForFunction(()=>document.activeElement?.tagName==='TEXTAREA');await m.locator('.sheet-mounted').waitFor({state:'detached'});
    await m.keyboard.insertText('手机编辑入口');await m.keyboard.press('Escape');await saved(m);
    assert.equal((await draft(m)).pages[0].scene.objects.at(-1).text,'手机编辑入口');
    assert.deepEqual(errors,[]);
    console.log('PASS workspace: canvas '+normalHeight+'px, target viewports, zoom/focus isolation, restored panels, undo history, collapsible properties, group visibility and desktop/mobile text entry.');
    await mobile.close();
  }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
