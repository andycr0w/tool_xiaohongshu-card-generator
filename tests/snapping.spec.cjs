// Exercise real Fabric pointer transforms; expose observation only in the test server.
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
  let data=await fs.readFile(file);
  if(path.basename(file)==='editor.js')data=data.toString().replace(/\ninit\(\);/, '\nwindow.__snapTest={canvas,get guides(){return guides.map(g=>g.slice());}};\ninit();');
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
  res.end(data);
 }catch{res.statusCode=404;res.end();}
});
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-5,`${label}: ${actual} != ${expected}`);
async function saved(p){
 await p.locator('#busy').waitFor({state:'hidden'});
 await p.waitForFunction(()=>document.getElementById('saveStatus').textContent==='已保存到此浏览器');
 return p.evaluate(()=>new Promise(resolve=>{
  const r=indexedDB.open('xiaohongshu-free-canvas',1);
  r.onsuccess=()=>{const db=r.result,q=db.transaction('draft').objectStore('draft').get('current');q.onsuccess=()=>{db.close();resolve(q.result);};};
 }));
}
async function fixture(p,{kind='rect',refs=[260],hidden=false}={}){
 await p.evaluate(({kind,refs,hidden})=>{
  const c=__snapTest.canvas,F=fabric;
  c.discardActiveObject();c.remove(...c.getObjects());
  const rect=(opts={})=>new F.Rect({left:140,top:140,width:120,height:120,strokeWidth:0,fill:'#e08090',...opts});
  let active;
  if(kind==='group'||kind==='multi'){
   const a=rect({width:50}),b=rect({left:210,width:50});
   if(kind==='group'){active=new F.Group([a,b],{name:'moving'});c.add(active);}
   else{a.name='moving';b.name='companion';c.add(a,b);active=new F.ActiveSelection([a,b],{canvas:c});}
  }else{
   if(kind==='text')active=new F.Textbox('拖动\n文字',{left:140,top:140,width:120,fontSize:40,name:'moving'});
   else if(kind==='image'){
    const image=document.createElement('canvas');image.width=image.height=120;
    image.getContext('2d').fillRect(0,0,120,120);
    active=new F.FabricImage(image,{left:140,top:140,name:'moving'});
   }else active=rect({name:'moving',angle:kind==='rotated'?27:0});
   c.add(active);
  }
  refs.forEach((x,i)=>c.add(rect({name:'reference'+i,left:x,top:450+i*120,width:83,height:61,visible:!hidden})));
  c.setActiveObject(active);c.fire('object:modified',{target:active});c.requestRenderAll();
 },{kind,refs,hidden});
 await saved(p);
}
const state=p=>p.evaluate(()=>{
 const c=__snapTest.canvas,o=c.getActiveObject();
 return {left:o?.left,top:o?.top,bounds:o?.getBoundingRect(),guides:__snapTest.guides};
});
async function begin(p){
 const start=await p.evaluate(()=>{
  const c=__snapTest.canvas,o=c.getActiveObject(),r=c.upperCanvasEl.getBoundingClientRect();
  const center=o.getCenterPoint(),z=c.getZoom();
  return {x:Math.round(r.left+center.x*z),y:Math.round(r.top+center.y*z),z,left:o.left,top:o.top,bounds:o.getBoundingRect()};
 });
 await p.mouse.move(start.x,start.y);await p.mouse.down();
 return start;
}
async function move(p,start,dx,dy=0){
 await p.mouse.move(Math.round(start.x+dx*start.z),Math.round(start.y+dy*start.z));
 return state(p);
}
async function end(p){await p.mouse.up();await saved(p);assert.deepEqual((await state(p)).guides,[]);}
async function run(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 const errors=[];
 const url='http://127.0.0.1:'+server.address().port;
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1000}});
  p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await saved(p);
  // The first large move catches stale aCoords; subsequent moves catch accumulated offsets.
  for(const zoom of ['fit','0.5','1','1.5']){
   await p.locator('#zoomLabel').selectOption(zoom);await fixture(p);
   const s=await begin(p),toLine=260-s.bounds.left;
   for(const [gap,expected] of [[3,260],[5,260],[6,260-6/s.z],[4,260-4/s.z],[2,260]]){
    const result=await move(p,s,toLine-gap/s.z);
    near(result.bounds.left,expected,zoom+' gap '+gap);
   }
   await end(p);
  }
  console.log('PASS snapping: current-frame bounds, 3px entry / 5px release at fit, 50%, 100%, 150%.');
  await p.locator('#zoomLabel').selectOption('1');
  // Close parallel lines cannot steal a held target; release cannot acquire another line that frame.
  await fixture(p,{refs:[260,264]});let s=await begin(p),result;
  near((await move(p,s,118)).bounds.left,260,'initial line');
  near((await move(p,s,123)).bounds.left,260,'closer competing line does not steal lock');
  near((await move(p,s,126)).bounds.left,266,'release skips competing line');
  near((await move(p,s,125)).bounds.left,264,'next movement may acquire competing line');
  await end(p);
  await fixture(p);s=await begin(p);
  near((await move(p,s,20,308)).bounds.top,450,'Y enters snap');
  result=await move(p,s,30,314);
  near(result.bounds.top,450,'Y holds snap');near(result.left,170,'X stays independent');
  near((await move(p,s,30,316)).bounds.top,456,'Y releases snap');await end(p);
  await fixture(p);s=await begin(p);
  near((await move(p,s,-138)).bounds.left,0,'artboard edge snaps');await end(p);
  // X/Y locks act independently, and candidates are a snapshot for one drag.
  await fixture(p);s=await begin(p);await move(p,s,118);
  await p.evaluate(()=>{const o=__snapTest.canvas.getObjects().find(o=>o.name==='reference0');o.left=300;o.setCoords();});
  result=await move(p,s,119,20);
  near(result.bounds.left,260,'cached reference');near(result.top,s.top+20,'other axis stays free');
  await end(p);
  await fixture(p,{hidden:true});s=await begin(p);
  near((await move(p,s,118)).bounds.left,258,'hidden reference ignored');await end(p);
  // Board ties beat object ties even when different moving anchors are involved.
  await fixture(p,{refs:[416]});s=await begin(p);
  result=await move(p,s,278);near(result.bounds.left,420,'artboard wins equal-distance tie');
  assert.ok(result.guides.some(([axis,v])=>axis==='x'&&v===540));await end(p);
  // Alt clears already-rendered guides without needing a pointer movement.
  await fixture(p);s=await begin(p);await move(p,s,118);
  assert.ok((await state(p)).guides.length);
  await p.keyboard.down('Alt');assert.deepEqual((await state(p)).guides,[]);
  near((await move(p,s,119)).bounds.left,259,'Alt bypasses correction');
  await p.keyboard.up('Alt');near((await move(p,s,118)).bounds.left,260,'Alt release resumes snapping');
  await end(p);
  // Mouseup clears the old lock: a fresh drag at 4px must not inherit the 5px hold radius.
  s=await begin(p);near((await move(p,s,-4)).bounds.left,256,'new drag has no inherited lock');await end(p);
  console.log('PASS snapping: stable targets, independent axes, candidate snapshot, hidden exclusions, ties and Alt.');
  for(const kind of ['rotated','group','multi','text','image']){
   await fixture(p,{kind});s=await begin(p);
   result=await move(p,s,260-s.bounds.left-2);
   near(result.bounds.left,260,kind+' snaps world bounds');await end(p);
   const d=await saved(p),objects=d.pages[d.current].scene.objects;
   if(kind==='multi')near(objects.find(o=>o.name==='companion').left-objects.find(o=>o.name==='moving').left,70,'multi member spacing');
  }
  // Multi-selection must not snap back to its own members.
  await fixture(p,{kind:'multi',refs:[]});s=await begin(p);
  near((await move(p,s,2)).bounds.left,s.bounds.left+2,'selection members excluded');await end(p);
  // One gesture creates one undo step, and the committed coordinates survive reload.
  await fixture(p);s=await begin(p);await move(p,s,118);await move(p,s,119);await end(p);
  await p.locator('#undo').click();let d=await saved(p);
  near(d.pages[d.current].scene.objects.find(o=>o.name==='moving').left,140,'one undo restores drag start');
  await p.locator('#redo').click();await saved(p);await p.reload();d=await saved(p);
  near(d.pages[d.current].scene.objects.find(o=>o.name==='moving').left,260,'redo and reload preserve snapped position');
  for(const event of ['blur','touchcancel','pointercancel','selection']){
   await fixture(p);s=await begin(p);await move(p,s,118);
   await p.evaluate(event=>{
    if(event==='selection')__snapTest.canvas.discardActiveObject();
    else (event==='blur'?window:document).dispatchEvent(new Event(event));
   },event);
   assert.deepEqual((await state(p)).guides,[],event+' clears guides');
   await p.mouse.up();await saved(p);
  }
  await fixture(p);s=await begin(p);await move(p,s,118);
  await p.locator('[data-action="addPage"]').evaluate(el=>el.click());await saved(p);
  assert.deepEqual((await state(p)).guides,[],'page change clears guides');await p.mouse.up();
  console.log('PASS snapping: rotated/group/multi, save/reload/undo, new-drag reset and interruption cleanup.');
  // A real dense template exercises many simultaneous alignment candidates.
  await p.locator('#zoomLabel').selectOption('fit');
  await p.locator('[data-tab="templates"]').click();
  await p.locator('.template-card').filter({hasText:'打勾清单'}).click();await saved(p);
  await p.evaluate(()=>{
   const c=__snapTest.canvas,o=c.getObjects().find(o=>o.text==='喝水，伸个懒腰');
   if(!o)throw Error('Template text missing');c.setActiveObject(o);c.requestRenderAll();
  });
  s=await begin(p);let previous=s.left,snappedFrames=0;
  for(let pixels=1;pixels<=110;pixels++){
   result=await move(p,s,pixels/s.z);
   const correction=(result.left-s.left)*s.z-pixels;
   assert.ok(Math.abs(correction)<=5.00001,'dense template never accumulates pointer drift');
   assert.ok((result.left-previous)*s.z>=-3.00001,'dense template has no large backward jump');
   if(result.guides.length)snappedFrames++;previous=result.left;
  }
  assert.ok(snappedFrames>0,'dense drag exercises snapping');
  await end(p);
  const out=path.join(root,'test-results/snapping');await fs.mkdir(out,{recursive:true});
  await p.screenshot({path:path.join(out,'dense-template.png')});
  console.log('PASS snapping: 110-frame dense-template drag remains within 5px of the pointer.');
  // Real single-finger dragging and a second finger interrupting an active snap.
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const mobile=await context.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(url);await saved(mobile);
  await fixture(mobile);
  const cdp=await context.newCDPSession(mobile);
  const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({x,y,id,radiusX:3,radiusY:3,force:1}))});
  const t=await mobile.evaluate(()=>{
   const c=__snapTest.canvas,r=c.upperCanvasEl.getBoundingClientRect(),o=c.getActiveObject(),z=c.getZoom(),center=o.getCenterPoint();
   return {x:r.x+center.x*z,y:r.y+center.y*z,z,left:o.getBoundingRect().left};
  });
  await touch('touchStart',[[t.x,t.y]]);
  // The mobile pipeline may round CSS pointer coordinates; stay safely inside each threshold.
  const at=t.x+(260-t.left)*t.z;
  await touch('touchMove',[[at-1,t.y]]);result=await state(mobile);
  near(result.bounds.left,260,'touch enters snap');
  await touch('touchMove',[[at-8,t.y]]);result=await state(mobile);
  assert.ok(Math.abs(result.bounds.left-260)*t.z>5,'touch releases snap');
  await touch('touchMove',[[at-1,t.y]]);
  assert.ok((await state(mobile)).guides.length);
  await touch('touchStart',[[at-1,t.y],[at+55,t.y+35]]);
  assert.deepEqual((await state(mobile)).guides,[],'pinch start clears guides');
  await touch('touchMove',[[at-10,t.y],[at+70,t.y+35]]);await touch('touchEnd',[]);await saved(mobile);
  assert.deepEqual((await state(mobile)).guides,[]);await context.close();
  assert.deepEqual(errors,[]);
  console.log('PASS snapping: real touch acquisition/release, pinch interruption, no browser errors.');
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
