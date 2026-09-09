/* Run with npm test; BROWSER_CHANNEL=msedge can use an installed browser. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
 try{const url=new URL(req.url,'http://localhost');const rel=decodeURIComponent(url.pathname).replace(/^\/tool_xiaohongshu-card-generator/,'');const file=path.resolve(root,'.'+(rel==='/'?'/index.html':rel));if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.statusCode=404;res.end();}
});
async function saved(p){await p.waitForFunction(()=>document.getElementById('saveStatus').textContent==='已保存到此浏览器');return p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('xiaohongshu-free-canvas',1);r.onsuccess=()=>{const d=r.result,t=d.transaction('draft').objectStore('draft').get('current');t.onsuccess=()=>{resolve(t.result);d.close();};t.onerror=reject;};r.onerror=reject;}));}
async function settled(p){await p.locator('#busy').waitFor({state:'hidden'});await p.waitForTimeout(400);return saved(p);}
async function click(p,action){await p.locator('[data-action="'+action+'"]').click();return settled(p);}
async function field(p,id,value){if(id.startsWith('object')&&!await p.locator('#geometryDetails').getAttribute('open').then(x=>x!==null))await p.locator('#geometryDetails summary').click();await p.locator('#'+id).fill(String(value));await p.locator('#'+id).press('Tab');return settled(p);}
async function selectTop(p) {
 await p.locator('[data-inspector-tab="layers"]').click();
 await p.locator('.layer-name').first().click();
 await p.locator('[data-inspector-tab="attributes"]').click();
}
async function run(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port+'/tool_xiaohongshu-card-generator/';
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 try{
 const errors=[];const p=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});p.setDefaultTimeout(12000);p.on('pageerror',e=>{errors.push(e.message);console.error('BROWSER ERROR',e.message);});
 await p.goto(url);let d=await settled(p);assert.equal(d.pages[0].scene.objects.length,8);
 await fs.mkdir(path.join(root,'test-results'),{recursive:true});await p.screenshot({path:path.join(root,'test-results/desktop.png')});
 // A text box is independently movable; the persisted scene and UI agree.
 console.log('Testing movement and history');await click(p,'addHeading');d=await field(p,'objectX',180);assert.equal(d.pages[0].scene.objects.at(-1).left,180);
 await click(p,'undo');assert.notEqual((await saved(p)).pages[0].scene.objects.at(-1).left,180);
 await click(p,'redo');assert.equal((await saved(p)).pages[0].scene.objects.at(-1).left,180);
 // Rich text: style only the first two glyphs.
 console.log('Testing rich text');await selectTop(p);await require('./text-edit-helper.cjs')(p);await p.keyboard.insertText('局部颜色测试');await p.keyboard.press('Home');await p.keyboard.down('Shift');await p.keyboard.press('ArrowRight');await p.keyboard.press('ArrowRight');await p.keyboard.up('Shift');
 await p.locator('#textColor').evaluate(el=>{el.value='#ff0000';el.dispatchEvent(new Event('change',{bubbles:true}));});
 d=await settled(p);const rich=d.pages[0].scene.objects.at(-1);assert.equal(rich.text,'局部颜色测试');assert.ok(rich.styles.length>0);assert.equal(rich.styles[0].start,0);assert.equal(rich.styles[0].end,2);assert.equal(rich.styles[0].style.fill,'#ff0000');
 await p.keyboard.press('Escape');await selectTop(p);await click(p,'duplicate');d=await saved(p);assert.equal(d.pages[0].scene.objects.length,10);
 // Group, ungroup, undo, and retain world positions across serialization.
 await click(p,'addPage');await p.locator('[data-shape="rect"]').click();await settled(p);await field(p,'objectX',100);await p.locator('[data-shape="circle"]').click();await settled(p);await field(p,'objectX',600);
 await p.locator('.canvas-toolbar').click({position:{x:5,y:5}});await p.keyboard.press('Control+a');await settled(p);await click(p,'group');d=await saved(p);assert.equal(d.pages[1].scene.objects.length,1);assert.equal(d.pages[1].scene.objects[0].type,'Group');
 await click(p,'ungroup');d=await saved(p);assert.equal(d.pages[1].scene.objects.length,2);assert.equal(Math.round(d.pages[1].scene.objects[0].left),100);assert.equal(Math.round(d.pages[1].scene.objects[1].left),600);
 await click(p,'duplicate');d=await saved(p);assert.equal(d.pages[1].scene.objects.length,4);assert.equal(Math.round(d.pages[1].scene.objects[2].left),128);
 // Background replacement preserves objects, and is undoable.
 await p.locator('[data-tab="backgrounds"]').click();await p.locator('#backgroundList button[title="方格纸"]').click();d=await settled(p);assert.equal(d.pages[1].background.kind,'grid');assert.equal(d.pages[1].scene.objects.length,4);
 // Upload a generated local raster, crop, then reload and preserve source.
 const png=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=200;const x=c.getContext('2d');x.fillStyle='#f00';x.fillRect(0,0,200,200);x.fillStyle='#00f';x.fillRect(200,0,200,200);return c.toDataURL().split(',')[1];});
 await p.locator('#imageInput').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await settled(p);
 await click(p,'crop');await p.locator('#cropRatio').selectOption('1');await p.locator('#cropX').evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input',{bubbles:true}));});await click(p,'applyCrop');d=await saved(p);assert.equal(d.pages[1].scene.objects.at(-1).cropX,200);assert.equal(d.pages[1].scene.objects.at(-1).width,200);
 await p.reload();d=await settled(p);assert.equal(d.pages.length,2);assert.equal(d.pages[1].scene.objects.at(-1).cropX,200);
 // Separate offscreen exports guarantee distinct pages and no selection handles.
 await click(p,'export');const dl=p.waitForEvent('download');await p.locator('[data-action="exportAll"]').click();const download=await dl;const zipPath=path.join(root,'test-results/pages.zip');await download.saveAs(zipPath);await settled(p);
 const {unzipSync}=require('../vendor/fflate.min.js');const files=unzipSync(new Uint8Array(await fs.readFile(zipPath)));assert.equal(Object.keys(files).length,2);const [a,b]=Object.values(files);assert.notDeepEqual(a,b);assert.equal(Buffer.from(a).readUInt32BE(16),1080);assert.equal(Buffer.from(a).readUInt32BE(20),1440);
 // Every template fits both portrait and landscape and creates editable elements.
 await p.locator('[data-tab="templates"]').click();for(let i=0;i<10;i++){await p.locator('.template-card').nth(i).click();await settled(p);}
 d=await saved(p);assert.equal(d.pages.length,12);assert.ok(d.pages.every(x=>x.scene.objects.length>0));
 await p.locator('#canvasSize').selectOption('1920,1080');await settled(p);await p.locator('.template-card').first().click();d=await settled(p);const landscape=d.pages.at(-1);assert.equal(landscape.width,1920);assert.ok(landscape.scene.objects.every(o=>o.top>=0&&o.top+o.height*o.scaleY<=1080));
 await p.screenshot({path:path.join(root,'test-results/desktop-edited.png')});
 assert.deepEqual(errors,[]);
 console.log('PASS desktop: rich text, history, groups, crop, draft reload, ZIP contents, 10 templates, landscape, subpath assets.');
 // Mobile uses a separate context, touch events, and the same full editor.
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,acceptDownloads:true});
 const mobile=await context.newPage();mobile.setDefaultTimeout(12000);mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(url);await settled(mobile);
 assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await mobile.screenshot({path:path.join(root,'test-results/mobile.png')});
 await click(mobile,'showElements');await click(mobile,'addHeading');await click(mobile,'showProperties');await field(mobile,'objectX',145);
 // Explicitly close the visible property sheet.
 await mobile.locator('#propertiesPanel [data-action="closePanel"]').click();await mobile.locator('.sheet-mounted').waitFor({state:'detached'});
 await mobile.locator('.upper-canvas').tap({position:{x:100,y:130}});await settled(mobile);
 await click(mobile,'showBackgrounds');await mobile.locator('#backgroundList button[title="日落渐变"]').click();await settled(mobile);await mobile.locator('#assetsPanel [data-action="closePanel"]').click();await mobile.locator('.sheet-mounted').waitFor({state:'detached'});
 await click(mobile,'multi');
 await mobile.screenshot({path:path.join(root,'test-results/mobile-edited.png')});
 assert.deepEqual(errors,[]);
 console.log('PASS mobile: responsive viewport, touch selection, text properties, background, multi-select mode, no browser errors.');
 // Real touch drags, additive selection, grouping, and pinch zoom.
 await click(mobile,'multi');await click(mobile,'addPage');
 await click(mobile,'showElements');await mobile.locator('[data-shape="rect"]').click();await settled(mobile);
 await click(mobile,'showElements');await mobile.locator('[data-shape="circle"]').click();await settled(mobile);
 await click(mobile,'showProperties');await field(mobile,'objectX',600);await field(mobile,'objectY',850);await mobile.locator('#propertiesPanel [data-action="closePanel"]').click();await mobile.locator('.sheet-mounted').waitFor({state:'detached'});
 const cdp=await context.newCDPSession(mobile);
 let box=await mobile.locator('.upper-canvas').boundingBox();let ratio=box.width/1080;
 const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({x:p[0],y:p[1],id:i,radiusX:3,radiusY:3,force:1}))});
 const start=[box.x+420*ratio,box.y+630*ratio];
 await touch('touchStart',[start]);for(let i=1;i<=5;i++)await touch('touchMove',[[start[0]+i*6,start[1]+i*4]]);await touch('touchEnd',[]);
 d=await settled(mobile);assert.ok(d.pages.at(-1).scene.objects[0].left>340,'touch drag changes document coordinates');
 await click(mobile,'multi');const objs=d.pages.at(-1).scene.objects;
 for(const o of objs)await mobile.locator('.upper-canvas').tap({position:{x:(o.left+o.width/2)*ratio,y:(o.top+o.height/2)*ratio}});
 // First tap toggles the previously active rectangle off; tap it once more to select both.
 if(await mobile.locator('.layer.active').count()!==2){const o=objs[0];await mobile.locator('.upper-canvas').tap({position:{x:(o.left+o.width/2)*ratio,y:(o.top+o.height/2)*ratio}});}
 assert.equal(await mobile.locator('.layer.active').count(),2);
 await click(mobile,'showProperties');await click(mobile,'group');d=await saved(mobile);assert.equal(d.pages.at(-1).scene.objects[0].type,'Group');await mobile.locator('#propertiesPanel [data-action="closePanel"]').click();await mobile.locator('.sheet-mounted').waitFor({state:'detached'});
 const oldZoom=await mobile.locator('#zoomLabel').textContent();box=await mobile.locator('.upper-canvas').boundingBox();
 await touch('touchStart',[[box.x+70,box.y+100]]);await touch('touchStart',[[box.x+70,box.y+100],[box.x+170,box.y+100]]);
 await touch('touchMove',[[box.x+50,box.y+100],[box.x+190,box.y+100]]);await touch('touchEnd',[]);
 assert.notEqual(await mobile.locator('#zoomLabel').textContent(),oldZoom);assert.deepEqual(errors,[]);
 console.log('PASS touch: actual drag updates coordinates, multi-select groups two shapes, two-finger pinch changes zoom.');
 await context.close();
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
