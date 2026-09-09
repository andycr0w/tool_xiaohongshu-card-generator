const {chromium}=require('playwright');
const editSelectedText=require('./text-edit-helper.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer(async(req,res)=>{
  try{
    const file=path.resolve(root,'.'+(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));
    if(!file.startsWith(root+path.sep))throw Error();
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
    res.end(await fs.readFile(file));
  }catch{res.statusCode=404;res.end();}
});
async function saved(p){
  await p.locator('#busy').waitFor({state:'hidden'});
  await p.waitForFunction(()=>document.getElementById('saveStatus').textContent==='已保存到此浏览器');
}
async function stable(p){
  await p.waitForFunction(()=>[...document.querySelectorAll('.sheet-mounted')].every(el=>el.getAnimations().length===0));
}
async function doc(p){
  return p.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('xiaohongshu-free-canvas',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('draft').objectStore('draft').get('current');q.onsuccess=()=>{resolve(q.result);db.close();};};}));
}
async function fits(p){
  for(const id of ['geometryDetails'])if(await p.locator('#'+id).getAttribute('open')===null)await p.locator('#'+id+' summary').click();
  const size=await p.locator('#propertySettings').evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight}));
  assert.ok(size.height>0,'properties have a usable scrolling area');
  await p.locator('[data-align="bottom"]').scrollIntoViewIfNeeded();
  assert.ok(await p.locator('[data-align="bottom"]').isVisible(),'last alignment control remains reachable');
  await p.locator('#propertySettings').evaluate(e=>e.scrollTop=0);
  const fields=await p.locator('.properties .field:visible').evaluateAll(fields=>fields.map(e=>getComputedStyle(e).flexDirection));
  assert.ok(fields.every(direction=>direction==='column'),'labels sit above their controls');
}
async function run(){
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  const url='http://127.0.0.1:'+server.address().port;
  const out=path.join(root,'test-results/panels');await fs.mkdir(out,{recursive:true});
  const errors=[];
  try{
    const p=await browser.newPage({viewport:{width:1366,height:768}});
    p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
    await p.goto(url);await saved(p);await p.locator('[data-action="addText"]').click();await saved(p);await fits(p);
    const angle=p.locator('#objectAngle'),opacity=p.locator('#objectOpacity');
    await angle.fill('-12.5');await angle.press('Tab');await saved(p);
    assert.equal(Number(await angle.inputValue()),-12.5);
    await angle.focus();await angle.press('ArrowUp');await angle.press('Tab');await saved(p);
    assert.ok(Math.abs(Number(await angle.inputValue())+12.4)<0.001);
    for(const value of ['0','100']){await opacity.fill(value);await opacity.press('Tab');await saved(p);assert.equal((await doc(p)).pages[0].scene.objects.at(-1).opacity,Number(value)/100);}
    await angle.fill('0');await angle.press('Tab');await saved(p);
    assert.equal(await angle.getAttribute('aria-label'),'旋转角度（度）');
    assert.equal(await p.locator('.field-unit').count(),2);
    assert.equal(await p.locator('#layersView').isVisible(),false);
    await p.locator('#layersTab').click();assert.ok(await p.locator('#layersView').isVisible());
    await p.locator('.layer-name').first().click();await p.locator('#attributesTab').click();
    const beforeTabs=(await doc(p)).pages[0].scene.objects.at(-1).left;
    await p.locator('#attributesTab').focus();await p.keyboard.press('ArrowRight');
    assert.equal(await p.locator('#layersTab').getAttribute('aria-selected'),'true');
    await p.keyboard.press('ArrowLeft');assert.equal(await p.locator('#attributesTab').getAttribute('aria-selected'),'true');
    assert.equal((await doc(p)).pages[0].scene.objects.at(-1).left,beforeTabs,'tab arrow keys must not move artwork');
    await editSelectedText(p);await p.keyboard.insertText('提示不会改变选区');
    await p.keyboard.press('Home');await p.keyboard.down('Shift');await p.keyboard.press('ArrowRight');await p.keyboard.press('ArrowRight');await p.keyboard.up('Shift');
    const info=p.locator('[aria-label="文字编辑说明"]');
    await info.scrollIntoViewIfNeeded();await p.mouse.move(600,100);await info.hover();await p.locator('#controlTooltip').waitFor({state:'visible'});
    assert.equal(await info.getAttribute('aria-describedby'),'controlTooltip');
    await p.keyboard.press('Escape');assert.equal(await p.locator('#controlTooltip').isVisible(),false);
    await p.locator('#italicButton').click();await saved(p);
    const d=await doc(p),text=d.pages[d.current].scene.objects.at(-1);
    assert.equal(text.styles[0].start,0);assert.equal(text.styles[0].end,2);assert.equal(text.styles[0].style.fontStyle,'italic');
    // Keyboard focus exposes the same help and Escape dismisses it without editing.
    await info.focus();assert.ok(await p.locator('#controlTooltip').isVisible());await p.keyboard.press('Escape');
    await p.locator('#attributesTab').click();await info.scrollIntoViewIfNeeded();await p.mouse.move(600,100);await info.hover();await p.locator('#controlTooltip').waitFor({state:'visible'});
    const tip=await p.locator('#controlTooltip').boundingBox(),panel=await p.locator('#propertiesPanel').boundingBox();
    assert.ok(tip.x>=0&&tip.y>=0&&tip.x+tip.width<=1366&&tip.y+tip.height<=768);
    assert.ok(tip.x+tip.width<panel.x,'desktop help should sit outside the controls');
    await info.click();await p.mouse.move(600,100);await p.locator('#controlTooltip').waitFor({state:'hidden'});
    await p.locator('#attributesTab').click();assert.equal(await p.locator('#controlTooltip').isVisible(),false);
    await p.locator('.canvas-toolbar').click({position:{x:2,y:2}});await p.screenshot({path:path.join(out,'desktop-1366.png')});
    // Shape, image and multi-selection all keep their common controls reachable.
    await p.locator('[data-shape="rect"]').click();await saved(p);await fits(p);
    const png=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=40;c.getContext('2d').fillRect(0,0,40,40);return c.toDataURL().split(',')[1];});
    await p.locator('#imageInput').setInputFiles({name:'square.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await saved(p);await fits(p);
    await p.locator('.canvas-toolbar').click({position:{x:2,y:2}});await p.keyboard.press('Control+a');await fits(p);
    // Short windows retain genuine overflow and let the user reach the last control.
    await p.setViewportSize({width:1000,height:420});
    await p.locator('[data-action="addText"]').click();await saved(p);
    const overflow=await p.locator('#propertySettings').evaluate(e=>e.scrollHeight>e.clientHeight);
    assert.ok(overflow);await p.locator('#objectOpacity').scrollIntoViewIfNeeded();
    assert.ok(await p.locator('#propertySettings').evaluate(e=>e.scrollTop>0));
    // Page actions preserve confirmation, order boundaries, undo and saved pages.
    const action=a=>p.locator('[data-action="'+a+'"]');
    assert.ok(await action('pageLeft').isDisabled());assert.ok(await action('pageRight').isDisabled());assert.ok(await action('deletePage').isDisabled());
    assert.equal(await p.locator('.page-actions button svg').count(),4);
    await action('duplicatePage').click();await saved(p);
    let pages=await doc(p);assert.equal(pages.pages.length,2);const copyId=pages.pages[1].id;
    assert.ok(await action('pageRight').isDisabled());
    await action('pageLeft').click();await saved(p);assert.equal((await doc(p)).pages[0].id,copyId);assert.ok(await action('pageLeft').isDisabled());
    await action('pageRight').click();await saved(p);assert.equal((await doc(p)).pages[1].id,copyId);
    p.once('dialog',dialog=>dialog.dismiss());await action('deletePage').click();assert.equal((await doc(p)).pages.length,2);
    p.once('dialog',dialog=>dialog.accept());await action('deletePage').click();await saved(p);assert.equal((await doc(p)).pages.length,1);
    await action('undo').click();await saved(p);assert.equal((await doc(p)).pages[1].id,copyId);
    await p.reload();await saved(p);assert.equal((await doc(p)).pages[1].id,copyId);
    const rows=await p.locator('.page-actions button').evaluateAll(es=>es.map(e=>Math.round(e.getBoundingClientRect().top)));
    assert.equal(new Set(rows).size,1);
    console.log('PASS spacious inspector: text/shape/image/multi controls, tabs, unpinned tooltip hover/focus/Escape, preserved text selection and short-window scrolling.');
    await p.close();

    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
    const m=await context.newPage();m.setDefaultTimeout(12000);m.on('pageerror',e=>errors.push(e.message));
    await m.goto(url);await saved(m);
    const mobileActions=await m.locator('.page-actions button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {y:r.y,w:r.width,h:r.height};}));
    assert.equal(new Set(mobileActions.map(r=>r.y)).size,1);assert.ok(mobileActions.every(r=>r.w>=44&&r.h>=44));
    assert.ok((await m.locator('.pages').boundingBox()).y<mobileActions[0].y);
    await m.locator('[data-action="showProperties"]').tap();await stable(m);
    const props=m.locator('#propertiesPanel');
    assert.equal(await props.getAttribute('data-detent'),'half');
    const half=await props.boundingBox();assert.ok(half.y>300&&half.y<500);
    await m.locator('[data-action="showProperties"]').tap();await m.locator('.sheet-mounted').waitFor({state:'detached'});
    assert.equal(await m.locator('[data-action="showProperties"]').getAttribute('aria-pressed'),'false');
    await m.locator('[data-action="showProperties"]').tap();await stable(m);
    await m.screenshot({path:path.join(out,'mobile-half.png')});
    await props.locator('.sheet-grabber').tap();await stable(m);
    assert.equal(await props.getAttribute('data-detent'),'expanded');
    const expanded=await props.boundingBox();assert.ok(expanded.y<half.y-100);
    await m.locator('[data-action="showTemplates"]').tap();await stable(m);
    assert.equal(await m.locator('#assetsPanel').getAttribute('data-detent'),'expanded');
    assert.equal(await m.locator('.sheet-mounted').count(),1);
    await m.locator('[data-action="showBackgrounds"]').tap();await stable(m);
    assert.equal(await m.locator('#assetsPanel').getAttribute('data-detent'),'expanded');
    assert.equal(await m.locator('[data-action="showBackgrounds"]').getAttribute('aria-pressed'),'true');
    await m.locator('[data-action="showBackgrounds"]').tap();await m.locator('.sheet-mounted').waitFor({state:'detached'});
    await m.locator('[data-action="showTemplates"]').tap();await stable(m);
    await m.locator('#assetsPanel .sheet-grabber').tap();await stable(m);
    // Real list scrolling leaves the detent unchanged.
    const cdp=await context.newCDPSession(m);
    const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({x,y,id,radiusX:4,radiusY:4,force:1}))});
    const list=await m.locator('#templatesTab').boundingBox();
    await touch('touchStart',[[list.x+100,list.y+220]]);await touch('touchMove',[[list.x+100,list.y+80]]);await touch('touchEnd',[]);
    assert.equal(await m.locator('#assetsPanel').getAttribute('data-detent'),'expanded');
    // Drag only the handle: expanded -> half -> closed, then restore dock focus.
    async function dragBy(delta,cancel=false){
      const b=await m.locator('.sheet-mounted .sheet-grabber').boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;
      await touch('touchStart',[[x,y]]);for(let i=1;i<=6;i++)await touch('touchMove',[[x,y+delta*i/6]]);
      await touch(cancel?'touchCancel':'touchEnd',[]);await stable(m);
    }
    await dragBy(100);assert.equal(await m.locator('#assetsPanel').getAttribute('data-detent'),'half');
    await dragBy(-80,true);assert.equal(await m.locator('#assetsPanel').getAttribute('data-detent'),'half');
    await dragBy(110);await m.locator('.sheet-mounted').waitFor({state:'detached'});
    assert.equal(await m.evaluate(()=>document.activeElement.dataset.action),'showTemplates');
    assert.equal(await m.locator('#sheetBackdrop').getAttribute('aria-hidden'),'true');
    // Interrupted opens/closes cannot leave duplicate sheets or inert canvas.
    await m.evaluate(()=>{
      const fire=a=>document.querySelector('[data-action="'+a+'"]').click();
      fire('showElements');fire('showProperties');fire('showBackgrounds');
      document.querySelector('#assetsPanel [data-action="closePanel"]').click();
      fire('showProperties');
    });
    await stable(m);assert.equal(await m.locator('.sheet-mounted').count(),1);assert.ok(await props.isVisible());
    await m.locator('#sheetBackdrop').tap({position:{x:20,y:80}});
    await m.locator('.sheet-mounted').waitFor({state:'detached'});
    assert.equal(await m.locator('.studio').evaluate(el=>el.inert),false);
    await m.locator('[data-action="showElements"]').tap();await stable(m);
    await m.locator('[data-action="addText"]').tap();await saved(m);await m.locator('.sheet-mounted').waitFor({state:'detached'});
    await m.locator('[data-action="showProperties"]').tap();await stable(m);await props.locator('.sheet-grabber').tap();await stable(m);
    await m.locator('[aria-label="文字编辑说明"]').tap();assert.ok(await m.locator('#controlTooltip').isVisible());
    await m.locator('[aria-label="文字编辑说明"]').tap();assert.equal(await m.locator('#controlTooltip').isVisible(),false);
    await editSelectedText(m);
    assert.equal(await m.evaluate(()=>document.activeElement.tagName),'TEXTAREA');
    await m.keyboard.insertText('手机继续编辑');await saved(m);
    await m.locator('[data-action="showProperties"]').tap();await stable(m);
    // A reduced visual viewport is a deterministic keyboard-resize surrogate.
    await m.setViewportSize({width:390,height:480});await stable(m);
    const keyboardBox=await props.boundingBox();assert.ok(keyboardBox.y>=0);
    await m.locator('#propertiesPanel [data-action="closePanel"]').tap();await m.locator('.sheet-mounted').waitFor({state:'detached'});
    await m.setViewportSize({width:844,height:390});assert.equal(await props.evaluate(el=>el.inert),false);
    await m.setViewportSize({width:390,height:844});
    await m.emulateMedia({reducedMotion:'reduce'});
    await m.locator('[data-action="showProperties"]').tap();
    assert.equal(await props.evaluate(el=>el.getAnimations().length),0);
    await props.locator('.sheet-grabber').tap();await m.screenshot({path:path.join(out,'mobile-expanded.png')});
    await m.keyboard.press('Escape');assert.equal(await m.locator('.sheet-mounted').count(),0);
    assert.deepEqual(errors,[]);
    console.log('PASS sheets: half/expanded, real touch drag and cancel, list scroll, switch/reopen interruptions, backdrop/focus, text keyboard focus, viewport/orientation, reduced motion.');
    await context.close();
  }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
