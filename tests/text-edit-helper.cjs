// Exercise the real canvas entry point, including closing a mobile sheet first.
module.exports=async function editSelectedText(p){
  const sheet=p.locator('.sheet-mounted');
  if(await sheet.count()){
    await sheet.locator('[data-action="closePanel"]').click();
    await sheet.waitFor({state:'detached'});
  }
  const point=await p.evaluate(()=>new Promise(resolve=>{
    const request=indexedDB.open('xiaohongshu-free-canvas',1);
    request.onsuccess=()=>{const db=request.result,get=db.transaction('draft').objectStore('draft').get('current');
      get.onsuccess=()=>{const d=get.result,page=d.pages[d.current],o=page.scene.objects.at(-1),r=document.querySelector('.upper-canvas').getBoundingClientRect();
        resolve({x:r.x+(o.left+12*o.scaleX)*r.width/page.width,y:r.y+(o.top+o.fontSize*.5*o.scaleY)*r.height/page.height});db.close();};};
  }));
  await p.mouse.dblclick(point.x,point.y);
  await p.waitForFunction(()=>document.activeElement?.tagName==='TEXTAREA');
  await p.keyboard.press('Control+a');
};
