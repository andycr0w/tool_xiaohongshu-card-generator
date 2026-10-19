// Global artwork history must be independent of the page the user is viewing.
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
  if(!file.startsWith(root+path.sep))throw Error('Invalid path');
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
  res.end(await fs.readFile(file));
 }catch{res.statusCode=404;res.end();}
});
async function saved(p){
 await p.locator('#busy').waitFor({state:'hidden'});
 await p.waitForFunction(()=>document.getElementById('saveStatus').textContent==='已保存到此浏览器');
 return p.evaluate(()=>new Promise((resolve,reject)=>{
  const r=indexedDB.open('xiaohongshu-free-canvas',1);
  r.onerror=()=>reject(r.error);
  r.onsuccess=()=>{
   const db=r.result,q=db.transaction('draft').objectStore('draft').get('current');
   q.onsuccess=()=>{db.close();resolve(q.result);};q.onerror=()=>{db.close();reject(q.error);};
  };
 }));
}
async function action(p,name){await p.locator('[data-action="'+name+'"]').click();return saved(p);}
async function select(p,index){await p.locator('.page-thumb').nth(index).click();return saved(p);}
async function rect(p){
 if(!await p.locator('#assetsPanel').isVisible())await p.locator('[data-action="showElements"]').click();
 await p.locator('[data-shape="rect"]').click();return saved(p);
}
const count=(d,id)=>d.pages.find(p=>p.id===id).scene.objects.length;
const order=d=>d.pages.map(p=>p.id);
const thumbnails=p=>p.locator('.page-thumb img').evaluateAll(imgs=>imgs.map(img=>img.src));
async function current(p,id){
 const d=await saved(p),index=d.pages.findIndex(page=>page.id===id);
 assert.ok(index>=0,'expected page still exists');assert.equal(d.current,index,'saved current page follows its ID');
 assert.equal(await p.locator('.page-thumb.active').count(),1);
 assert.equal(await p.locator('.page-thumb.active').getAttribute('aria-label'),'第 '+(index+1)+' 页');
 assert.equal(await p.locator('.page-thumb[aria-current="true"]').getAttribute('aria-label'),'第 '+(index+1)+' 页');
 assert.equal(await p.locator('#pageCount').textContent(),'第 '+(index+1)+' / '+d.pages.length+' 页');
 assert.equal(await p.locator('.layer').count(),d.pages[index].scene.objects.length,'canvas layers match viewed page');
 return d;
}
async function abc(browser,url,errors,mobile=false){
 const p=await browser.newPage(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1440,height:1000}});
 p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
 await p.goto(url);await saved(p);await action(p,'addPage');await action(p,'addPage');await select(p,0);
 // History remains in memory; reloading starts a clean baseline containing all three pages.
 await p.reload();const base=await saved(p);
 assert.equal(base.pages.length,3);assert.ok(await p.locator('#undo').isDisabled());
 return {p,base,ids:order(base)};
}
async function run(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 const url='http://127.0.0.1:'+server.address().port,errors=[];
 try{
  for(const mobile of [false,true]){
   const {p,base,ids:[a,b]}=await abc(browser,url,errors,mobile);
   await rect(p);await select(p,1);await rect(p);const changed=await thumbnails(p);
   await action(p,'undo');let d=await current(p,b);
   assert.equal(count(d,b),count(base,b));assert.equal(count(d,a),count(base,a)+1);
   assert.notEqual((await thumbnails(p))[1],changed[1],'undo refreshes B thumbnail');
   // Exercise the keyboard shortcut as well as the toolbar, while remaining on B.
   await p.keyboard.press('Control+z');d=await current(p,b);
   assert.equal(count(d,a),count(base,a));assert.equal(count(d,b),count(base,b));
   assert.notEqual((await thumbnails(p))[0],changed[0],'offscreen A thumbnail refreshes');
   await p.keyboard.press('Control+Shift+z');d=await current(p,b);
   assert.equal(count(d,a),count(base,a)+1);assert.equal(count(d,b),count(base,b));
   await action(p,'redo');d=await current(p,b);assert.equal(count(d,b),count(base,b)+1);
   await p.reload();await current(p,b);
   assert.ok(await p.locator('#undo').isDisabled());assert.ok(await p.locator('#redo').isDisabled());
   await p.close();
  }
  console.log('PASS history: A/B global undo/redo stays on B, keyboard and toolbar, thumbnails, persisted current page, desktop/mobile.');
  {
   const {p,base,ids:[a,b,c]}=await abc(browser,url,errors);
   await rect(p);await select(p,1);await rect(p);await select(p,2);
   await action(p,'undo');let d=await current(p,c);
   assert.equal(count(d,b),count(base,b));assert.equal(count(d,a),count(base,a)+1);
   await action(p,'undo');d=await current(p,c);assert.equal(count(d,a),count(base,a));
   assert.ok(await p.locator('#undo').isDisabled());assert.ok(await p.locator('#redo').isEnabled());
   await select(p,0);await select(p,1);
   // Dispatch a real no-op input change to exercise commit() after navigating.
   await p.locator('#documentName').evaluate(el=>el.dispatchEvent(new Event('change',{bubbles:true})));await saved(p);
   assert.ok(await p.locator('#undo').isDisabled(),'navigation/no-op does not add history');
   assert.ok(await p.locator('#redo').isEnabled(),'navigation/no-op does not truncate redo');
   await action(p,'redo');d=await current(p,b);assert.equal(count(d,a),count(base,a)+1);
   await select(p,2);await action(p,'redo');d=await current(p,c);assert.equal(count(d,b),count(base,b)+1);
   await action(p,'undo');await rect(p);d=await current(p,c);
   assert.equal(count(d,a),count(base,a)+1);assert.equal(count(d,b),count(base,b));assert.equal(count(d,c),count(base,c)+1);
   assert.ok(await p.locator('#redo').isDisabled(),'real artwork edit creates a new history branch');
   await action(p,'undo');d=await current(p,c);assert.equal(count(d,c),count(base,c));
   await action(p,'undo');d=await current(p,c);assert.equal(count(d,a),count(base,a));
   assert.ok(await p.locator('#undo').isDisabled());await p.close();
  }
  console.log('PASS history: global edits while viewing C, navigation/no-op preserves redo, real edits truncate redo.');
  {
   const {p,ids:[a,b,c]}=await abc(browser,url,errors);
   await select(p,1);await action(p,'pageLeft');assert.deepEqual(order(await current(p,b)),[b,a,c]);
   await action(p,'undo');assert.deepEqual(order(await current(p,b)),[a,b,c]);
   await action(p,'redo');assert.deepEqual(order(await current(p,b)),[b,a,c]);
   await select(p,2);await action(p,'undo');assert.deepEqual(order(await current(p,c)),[a,b,c]);
   await action(p,'redo');assert.deepEqual(order(await current(p,c)),[b,a,c]);await p.close();
  }
  {
   const {p,ids:[a,b,c]}=await abc(browser,url,errors);
   const added=await action(p,'addPage'),newId=added.pages.at(-1).id;await current(p,newId);
   await action(p,'undo');assert.deepEqual(order(await current(p,c)),[a,b,c]);
   await action(p,'redo');assert.deepEqual(order(await current(p,c)),[a,b,c,newId]);
   await select(p,3);await action(p,'undo');await current(p,c);
   // Duplicating B inserts at index 2; removing that copy falls forward to C at index 2.
   await select(p,1);const copied=await action(p,'duplicatePage'),copyId=copied.pages[2].id;
   await current(p,copyId);assert.deepEqual(order(copied),[a,b,copyId,c]);
   await action(p,'undo');assert.deepEqual(order(await current(p,c)),[a,b,c]);
   await action(p,'redo');assert.deepEqual(order(await current(p,c)),[a,b,copyId,c]);await p.close();
  }
  {
   const {p,ids:[a,b,c]}=await abc(browser,url,errors);
   await select(p,1);p.once('dialog',dialog=>dialog.accept());await action(p,'deletePage');
   assert.deepEqual(order(await current(p,c)),[a,c]);
   await action(p,'undo');assert.deepEqual(order(await current(p,c)),[a,b,c]);
   // Redo deletion while viewing the page being removed, rather than the fallback page.
   await select(p,1);await action(p,'redo');assert.deepEqual(order(await current(p,c)),[a,c]);
   await action(p,'undo');await current(p,c);
   p.once('dialog',dialog=>dialog.accept());await action(p,'deletePage');
   assert.deepEqual(order(await current(p,b)),[a,b]);
   await action(p,'undo');assert.deepEqual(order(await current(p,b)),[a,b,c]);
   await action(p,'redo');assert.deepEqual(order(await current(p,b)),[a,b]);await p.close();
  }
  console.log('PASS history: page-ID tracking through reorder/add/copy/delete, nearest-page fallback when current page disappears.');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
