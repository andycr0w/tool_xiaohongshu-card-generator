/* Pure browser editor. Document coordinates always use export pixels. */
(() => {
'use strict';
const $=id=>document.getElementById(id), F=window.fabric;
if(!F){$('saveStatus').textContent='编辑器未加载，请刷新页面';return;}
F.FabricObject.customProperties=['name','locked'];
Object.assign(F.FabricObject.ownDefaults,{cornerColor:'#ffffff',cornerStrokeColor:'#df3d60',borderColor:'#df3d60',cornerSize:11,touchCornerSize:28,transparentCorners:false,cornerStyle:'circle',padding:3});
const canvas=new F.Canvas('editorCanvas',{preserveObjectStacking:true,selectionColor:'#df3d6018',selectionBorderColor:'#df3d60',selectionKey:'shiftKey',stopContextMenu:true,fireRightClick:false});
const clone=x=>JSON.parse(JSON.stringify(x));
const page=()=>doc.pages[doc.current];
const blank=(w=1080,h=1440)=>({id:crypto.randomUUID(),width:w,height:h,background:{kind:'solid',color:'#ffffff'},scene:{version:F.version,objects:[]}});
let doc={version:1,name:'我的图文笔记',current:0,pages:[blank()]};
let history=[],historyIndex=-1,loading=false,zoom=.4,autoFit=true,multi=false,saveTimer,textTimer,db=null;
let selectedRange=null,clipboard=null,thumbs=new Map(),guides=[],cropTarget=null,cropBox=null,saveFailed=false;
let persistedSnapshot='',saveSequence=0,liveDirty=false;
const backgrounds=[
 {name:'纯白',kind:'solid',color:'#ffffff'},
 {name:'莓果',kind:'solid',color:'#fff2f5'},
 {name:'奶油',kind:'solid',color:'#fff7e6'},
 {name:'苔绿',kind:'solid',color:'#edf5ef'},
 {name:'墨夜',kind:'solid',color:'#252a36'},
 {name:'粉蓝渐变',kind:'gradient',color:'#ffe4ed',color2:'#e0edff'},
 {name:'日落渐变',kind:'gradient',color:'#fff2c7',color2:'#ffd5c5'},
 {name:'方格纸',kind:'grid',color:'#fafaf7'},
 {name:'点阵',kind:'dots',color:'#f4f6fa'},
 {name:'纸张',kind:'paper',color:'#f5efe1'}
];
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('visible'),3200);}
async function busy(fn){if(loading)return;loading=true;$('busy').hidden=false;try{return await fn();}catch(e){console.error(e);toast('操作未完成：'+(e.message||'请重试'));}finally{loading=false;$('busy').hidden=true;updateProperties();}}
function isText(o){return o instanceof F.IText;}
function typeName(o){return isText(o)?'文字':o instanceof F.FabricImage?'图片':o instanceof F.ActiveSelection?'多选':o instanceof F.Group?'组合':'图形';}
function exitText(){const o=canvas.getActiveObject();if(isText(o)&&o.isEditing)o.exitEditing();selectedRange=null;clearTimeout(textTimer);}
function capture(){
 const active=canvas.getActiveObject(),selected=active instanceof F.ActiveSelection?active.getObjects():null;
 // ActiveSelection stores relative child coordinates: restore world transforms before serializing.
 if(selected)canvas.discardActiveObject();
 page().scene={version:F.version,objects:canvas.toObject().objects};
 if(selected)canvas.setActiveObject(new F.ActiveSelection(selected,{canvas}));
 doc.name=$('documentName').value.trim()||'未命名作品';
}
function historyButtons(){$('undo').disabled=historyIndex<=0;$('redo').disabled=historyIndex>=history.length-1;}
function commit(){
 if(loading)return;
 capture();const snapshot=JSON.stringify(doc);
 if(history[historyIndex]!==snapshot){history.splice(historyIndex+1);history.push(snapshot);while(history.length>2&&(history.length>50||history.reduce((n,s)=>n+s.length,0)>32*1024*1024))history.shift();historyIndex=history.length-1;}
 liveDirty=false;
 historyButtons();scheduleSave();refreshThumbnail();updateProperties();
}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('xiaohongshu-free-canvas',1);r.onupgradeneeded=()=>r.result.createObjectStore('draft');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function readDraft(){return new Promise((resolve,reject)=>{const r=db.transaction('draft').objectStore('draft').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function scheduleSave(){if(!db){$('saveStatus').textContent='本地保存不可用，请及时导出';return;}$('saveStatus').textContent='正在保存…';clearTimeout(saveTimer);saveTimer=setTimeout(saveDraft,250);}
async function saveDraft(){
 clearTimeout(saveTimer);if(!db)return;
 const data=clone(doc),serial=JSON.stringify(data),seq=++saveSequence;
 try{await new Promise((resolve,reject)=>{const tx=db.transaction('draft','readwrite');tx.objectStore('draft').put(data,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
 if(seq===saveSequence){persistedSnapshot=serial;saveFailed=false;$('saveStatus').textContent='已保存到此浏览器';}
 }catch(e){saveFailed=true;$('saveStatus').textContent='保存失败，请先导出图片';toast('浏览器存储不可用或空间不足，请导出图片以免丢失');}
}
async function setBackground(target,p){
 const bg=p.background;target.backgroundImage=undefined;
 if(bg.kind==='university-card'){
   target.backgroundColor=bg.color;target.backgroundImage=CardTemplates.universityBackground(p.width,p.height,bg);
 }else if(bg.kind==='image'){
   const img=await F.FabricImage.fromURL(bg.src);const scale=Math.max(p.width/img.width,p.height/img.height);
   img.set({left:(p.width-img.width*scale)/2,top:(p.height-img.height*scale)/2,scaleX:scale,scaleY:scale,selectable:false,evented:false});
   target.backgroundColor='#fff';target.backgroundImage=img;
 }else if(bg.kind==='gradient'){
   target.backgroundColor=new F.Gradient({type:'linear',gradientUnits:'pixels',coords:{x1:0,y1:0,x2:p.width,y2:p.height},colorStops:[{offset:0,color:bg.color},{offset:1,color:bg.color2}]});
 }else if(['grid','dots','paper'].includes(bg.kind)){
   const tile=document.createElement('canvas');tile.width=tile.height=bg.kind==='paper'?128:48;
   const c=tile.getContext('2d');c.fillStyle=bg.color;c.fillRect(0,0,tile.width,tile.height);
   if(bg.kind==='grid'){c.strokeStyle='#7c88751e';c.lineWidth=1;c.beginPath();c.moveTo(.5,48);c.lineTo(.5,.5);c.lineTo(48,.5);c.stroke();}
   if(bg.kind==='dots'){c.fillStyle='#8994a650';c.beginPath();c.arc(24,24,2,0,Math.PI*2);c.fill();}
   if(bg.kind==='paper'){let seed=12345;for(let i=0;i<2200;i++){seed=(seed*16807)%2147483647;const x=seed%128;seed=(seed*16807)%2147483647;const y=seed%128;c.fillStyle=i%2?'#866d4610':'#ffffff40';c.fillRect(x,y,1,1);}}
   target.backgroundColor=new F.Pattern({source:tile,repeat:'repeat'});
 }else target.backgroundColor=bg.color;
 target.requestRenderAll();
}
function sceneOnly(p){return {version:F.version,objects:p.scene.objects||[]};}
async function loadPage(){
 selectedRange=null;canvas.discardActiveObject();await canvas.loadFromJSON(sceneOnly(page()));await setBackground(canvas,page());
 canvas.getObjects().forEach(o=>applyLock(o,!!o.locked));
 $('canvasSize').value=page().width+','+page().height;$('documentName').value=doc.name;
 $('dimensions').textContent=page().width+' × '+page().height;
 if(autoFit)fit();else setZoom(zoom);
 refreshThumbnail();renderPages();updateProperties();
}
function setZoom(value){zoom=Math.max(.08,Math.min(2,value));canvas.setDimensions({width:Math.round(page().width*zoom),height:Math.round(page().height*zoom)});canvas.setViewportTransform([zoom,0,0,zoom,0,0]);const menu=$('zoomLabel');menu.options[0].textContent='适应窗口'+(autoFit?' · '+Math.round(zoom*100)+'%':'');menu.options[5].textContent=Math.round(zoom*100)+'%';menu.value=autoFit?'fit':[.5,.75,1,1.5].includes(zoom)?String(zoom):'custom';canvas.calcOffset();}
function fit(){autoFit=true;const el=$('stage'),style=getComputedStyle(el);setZoom(Math.min((el.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight))/page().width,(el.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom))/page().height,1));}
function closePanels(options){SheetUI.close(options);}
function showTab(tab){['elements','templates','backgrounds'].forEach(t=>{$(t+'Tab').hidden=t!==tab;document.querySelector('[data-tab="'+t+'"]').setAttribute('aria-selected',String(t===tab));});}
function showAssets(tab){showTab(tab);SheetUI.toggle('assetsPanel',tab);}
function renderPages(){
 $('pageCount').textContent='第 '+(doc.current+1)+' / '+doc.pages.length+' 页';
 $('pages').replaceChildren();doc.pages.forEach((p,i)=>{
 const b=document.createElement('button');b.className='page-thumb'+(i===doc.current?' active':'');b.title='第 '+(i+1)+' 页';b.setAttribute('aria-label',b.title);b.setAttribute('aria-current',String(i===doc.current));
 const img=document.createElement('img');img.alt='';if(thumbs.has(p.id))img.src=thumbs.get(p.id);
 const num=document.createElement('span');num.textContent=i+1;b.append(img,num);b.onclick=()=>switchPage(i);$('pages').append(b);
 });document.querySelector('[data-action="deletePage"]').disabled=doc.pages.length===1;
 document.querySelector('[data-action="pageLeft"]').disabled=doc.current===0;
 document.querySelector('[data-action="pageRight"]').disabled=doc.current===doc.pages.length-1;
}
function refreshThumbnail(){
 try{thumbs.set(page().id,canvas.toDataURL({format:'png',multiplier:80/(page().width*zoom),enableRetinaScaling:false}));}catch(e){console.warn('Thumbnail unavailable',e);}
 renderPages();
}
async function switchPage(i){if(loading||i===doc.current)return;exitText();capture();await busy(async()=>{doc.current=i;await loadPage();});scheduleSave();}
async function newPage(template){
 exitText();capture();await busy(async()=>{
 const p=blank(page().width,page().height);doc.pages.push(p);doc.current=doc.pages.length-1;
 await loadPage();
 if(template){const t=CardTemplates.make(template,p.width,p.height);canvas.add(...t.objects);p.background=t.background;await setBackground(canvas,p);}
 });commit();closePanels();
}
async function undo(delta){if(loading||historyIndex+delta<0||historyIndex+delta>=history.length)return;exitText();await busy(async()=>{historyIndex+=delta;doc=JSON.parse(history[historyIndex]);thumbs.clear();await loadPage();await regenerateThumbnails();});historyButtons();scheduleSave();}
async function regenerateThumbnails(){for(const p of doc.pages){if(thumbs.has(p.id))continue;const out=await renderPage(p,80/p.width);thumbs.set(p.id,out.toDataURL());}renderPages();}
function addObject(o){canvas.add(o);canvas.setActiveObject(o);o.setCoords();commit();closePanels();}
function addText(heading){const p=page();addObject(new F.Textbox(heading?'写下你的标题':'在这里写下你的想法\n双击文字，自由编辑',{left:p.width*.1,top:p.height*.25,width:p.width*.75,fontSize:heading?80:40,fontWeight:heading?700:400,lineHeight:1.35,fontFamily:'Microsoft YaHei',fill:'#252735',splitByGrapheme:true}));}
function addShape(kind){const opts={left:page().width*.25,top:page().height*.35,fill:'#df3d60',strokeWidth:0};addObject(kind==='circle'?new F.Circle({...opts,radius:150}):new F.Rect({...opts,width:kind==='line'?420:380,height:kind==='line'?8:260,rx:kind==='round'?30:0,ry:kind==='round'?30:0}));}
function applyLock(o,value){o.set({locked:value,lockMovementX:value,lockMovementY:value,lockScalingX:value,lockScalingY:value,lockRotation:value,hasControls:!value,editable:!value,selectable:!value,evented:!value});}
function selectionObjects(){return canvas.getActiveObjects();}
function deleteSelection(){const objects=selectionObjects();if(objects.some(o=>o.locked)){toast('请先解锁元素');return;}exitText();canvas.discardActiveObject();canvas.remove(...objects);commit();}
function labelOf(o){return o.name||(isText(o)?o.text.replace(/\n/g,' ').slice(0,24):typeName(o));}
function renderLayers(){
 const selected=selectionObjects();$('layers').replaceChildren();
 canvas.getObjects().slice().reverse().forEach(o=>{
 const row=document.createElement('div');row.className='layer'+(selected.includes(o)?' active':'');
 const name=document.createElement('button');name.className='layer-name';name.textContent=(isText(o)?'T  ':o instanceof F.FabricImage?'▧  ':'◇  ')+labelOf(o);
 name.onclick=()=>{if(loading)return;exitText();if(multi&&!o.locked)toggleSelection(o);else canvas.setActiveObject(o);canvas.requestRenderAll();updateProperties();};
 const lock=document.createElement('button');lock.append(ToolbarUI.icon('lock'));lock.title=o.locked?'解锁':'锁定';lock.setAttribute('aria-label',lock.title+' '+labelOf(o));
 lock.onclick=()=>{exitText();canvas.discardActiveObject();applyLock(o,!o.locked);canvas.setActiveObject(o);commit();};
 row.append(name,lock);$('layers').append(row);
 });
}
function currentTextStyle(o,key){if(selectedRange?.object===o&&selectedRange.end>selectedRange.start){return o.getSelectionStyles(selectedRange.start,selectedRange.start+1,true)[0]?.[key]??o[key];}return o[key];}
function updateAlignmentState(){
 const objects=selectionObjects(),rects=objects.map(o=>o.getBoundingRect());
 const bounds=rects.length===1?{left:0,top:0,width:page().width,height:page().height}:canvas.getActiveObject()?.getBoundingRect();
 const position=(r,key)=>key==='left'?r.left:key==='right'?r.left+r.width:key==='center'?r.left+r.width/2:key==='top'?r.top:key==='bottom'?r.top+r.height:r.top+r.height/2;
 document.querySelectorAll('[data-align]').forEach(b=>{
   b.disabled=!objects.length||objects.some(o=>o.locked);
   b.setAttribute('aria-pressed',String(!!bounds&&rects.length>0&&rects.every(r=>Math.abs(position(r,b.dataset.align)-position(bounds,b.dataset.align))<1)));
 });
}
function updateProperties(){
 const o=canvas.getActiveObject();$('emptySelection').hidden=!!o;$('selectedProperties').hidden=!o;renderLayers();
 if(!o){$('selectionHint').textContent=multi?'多选模式：依次点选元素':'拖动排版 · 双击文字编辑 · 双指缩放画布';return;}
 const t=isText(o),image=o instanceof F.FabricImage,selection=o instanceof F.ActiveSelection;
 updateAlignmentState();
 $('objectType').textContent=typeName(o)+(selection?' · '+o.getObjects().length+' 个元素':'');
 $('textProperties').hidden=!t;$('imageProperties').hidden=!image;$('shapeProperties').hidden=t||image||o instanceof F.Group;
 $('editTextButton').hidden=!t;$('editTextButton').disabled=!!o.locked;
 $('groupButton').hidden=!selection;$('ungroupButton').hidden=!(o instanceof F.Group)||selection;
 $('groupButton').disabled=!selection||selectionObjects().some(x=>x.locked);$('ungroupButton').disabled=!(o instanceof F.Group)||selection||o.locked;
 ToolbarUI.label($('lockButton'),o.locked?'解锁':'锁定');$('lockButton').setAttribute('aria-pressed',String(!!o.locked));$('lockButton').disabled=selection;
 $('objectX').value=Math.round(o.left);$('objectY').value=Math.round(o.top);$('objectWidth').value=Math.round(o.width*o.scaleX);$('objectHeight').value=Math.round(o.height*o.scaleY);$('objectAngle').value=o.angle;$('objectOpacity').value=Math.round(o.opacity*100);
 $('objectHeight').disabled=t;$('textSizeHint').hidden=!t;
 $('selectionHint').textContent=o.locked?'元素已锁定，可在属性或图层中解锁':t?'双击编辑文字 · 拖动两侧调整换行':selection?'多选后可组合、对齐或一起移动':'拖动角点缩放 · 顶部手柄旋转';
 if(t){$('fontFamily').value=currentTextStyle(o,'fontFamily');$('fontSize').value=currentTextStyle(o,'fontSize');$('textColor').value=currentTextStyle(o,'fill');document.querySelectorAll('[data-text-align]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.textAlign===o.textAlign)));$('lineHeight').value=o.lineHeight;
 $('boldButton').setAttribute('aria-pressed',String(['bold',700,800,900].includes(currentTextStyle(o,'fontWeight'))));$('italicButton').setAttribute('aria-pressed',String(currentTextStyle(o,'fontStyle')==='italic'));$('underlineButton').setAttribute('aria-pressed',String(!!currentTextStyle(o,'underline')));}
 else if(!image&&typeof o.fill==='string')$('shapeColor').value=o.fill;
}
function textStyle(key,value){
 const o=canvas.getActiveObject();if(!isText(o)||o.locked)return;
 const range=selectedRange?.object===o?selectedRange:null;
 if(range&&range.end>range.start)o.setSelectionStyles({[key]:value},range.start,range.end);
 else {o.set(key,value);o.removeStyle(key);}
 o.dirty=true;o.initDimensions();o.setCoords();canvas.requestRenderAll();commit();
}
function editableObject(){const o=canvas.getActiveObject();if(o?.locked){toast('请先解锁元素');return null;}return o;}
function changeObject(fn){const o=editableObject();if(!o)return;fn(o);o.setCoords();canvas.requestRenderAll();commit();}
async function duplicate(){
 exitText();const original=canvas.getActiveObject();if(!original)return;
 const completed=await busy(async()=>{const copy=await original.clone();canvas.discardActiveObject();
 const objects=copy instanceof F.ActiveSelection?copy.removeAll():[copy];
 objects.forEach(o=>{o.set({left:o.left+28,top:o.top+28});canvas.add(o);o.setCoords();});
 canvas.setActiveObject(objects.length>1?new F.ActiveSelection(objects,{canvas}):objects[0]);return true;});commit();return completed;
}
function group(){
 exitText();const objects=selectionObjects();if(objects.length<2||objects.some(o=>o.locked))return;
 const index=Math.max(...objects.map(o=>canvas.getObjects().indexOf(o)));
 canvas.discardActiveObject();canvas.remove(...objects);const g=new F.Group(objects);canvas.add(g);canvas.moveObjectTo(g,Math.min(index,canvas.size()-1));canvas.setActiveObject(g);commit();return true;
}
function ungroup(){const g=editableObject();if(!(g instanceof F.Group)||g instanceof F.ActiveSelection)return;const index=canvas.getObjects().indexOf(g);canvas.discardActiveObject();const objects=g.removeAll();canvas.remove(g);objects.forEach((o,i)=>{canvas.insertAt(index+i,o);o.setCoords();});canvas.setActiveObject(new F.ActiveSelection(objects,{canvas}));commit();return true;}
function align(direction){
 exitText();const objects=selectionObjects();if(!objects.length||objects.some(o=>o.locked))return;
 canvas.discardActiveObject();const rects=objects.map(o=>o.getBoundingRect());
 const bounds=objects.length===1?{left:0,top:0,width:page().width,height:page().height}:F.util.makeBoundingBoxFromPoints(rects.flatMap(r=>[new F.Point(r.left,r.top),new F.Point(r.left+r.width,r.top+r.height)]));
 objects.forEach((o,i)=>{const r=rects[i];let dx=0,dy=0;if(direction==='left')dx=bounds.left-r.left;if(direction==='right')dx=bounds.left+bounds.width-r.left-r.width;if(direction==='center')dx=bounds.left+bounds.width/2-r.left-r.width/2;if(direction==='top')dy=bounds.top-r.top;if(direction==='bottom')dy=bounds.top+bounds.height-r.top-r.height;if(direction==='middle')dy=bounds.top+bounds.height/2-r.top-r.height/2;o.set({left:o.left+dx,top:o.top+dy});o.setCoords();});
 canvas.setActiveObject(objects.length===1?objects[0]:new F.ActiveSelection(objects,{canvas}));commit();
}
async function imageData(file){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('请选择 PNG、JPG 或 WebP 图片');
 if(file.size>30*1024*1024)throw Error('单张图片请小于 30 MB');
 const url=URL.createObjectURL(file);
 try{const img=await F.FabricImage.fromURL(url);const el=img.getElement();const scale=Math.min(1,4096/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(el,0,0,c.width,c.height);return c.toDataURL(file.type==='image/jpeg'?'image/jpeg':'image/png',.94);}finally{URL.revokeObjectURL(url);}
}
async function importImages(files,background=false){
 if(!files.length)return;exitText();await busy(async()=>{
 for(const file of files){const src=await imageData(file);
 if(background){page().background={kind:'image',src};await setBackground(canvas,page());break;}
 const img=await F.FabricImage.fromURL(src);const scale=Math.min(page().width*.7/img.width,page().height*.55/img.height,1);
 img.set({left:page().width*.15,top:page().height*.2,scaleX:scale,scaleY:scale,name:file.name});canvas.add(img);canvas.setActiveObject(img);
 }
 });commit();closePanels();
}
function openCrop(){
 const o=editableObject();if(!(o instanceof F.FabricImage))return;cropTarget=o;
 $('cropRatio').value='original';$('cropZoom').value=1;$('cropX').value=.5;$('cropY').value=.5;drawCrop();$('cropDialog').showModal();
}
function drawCrop(){
 if(!cropTarget)return;const img=cropTarget.getElement(),iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
 const ratio=$('cropRatio').value==='original'?iw/ih:Number($('cropRatio').value);
 const z=Number($('cropZoom').value);let w=iw,h=iw/ratio;if(h>ih){h=ih;w=h*ratio;}w/=z;h/=z;
 cropBox={x:(iw-w)*Number($('cropX').value),y:(ih-h)*Number($('cropY').value),w,h};
 const c=$('cropPreview'),scale=Math.min(480/w,320/h);c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));c.getContext('2d').drawImage(img,cropBox.x,cropBox.y,w,h,0,0,c.width,c.height);
}
function applyCrop(){
 if(!cropTarget||!cropBox)return;const displayWidth=cropTarget.width*cropTarget.scaleX;
 cropTarget.set({cropX:cropBox.x,cropY:cropBox.y,width:cropBox.w,height:cropBox.h,scaleX:displayWidth/cropBox.w,scaleY:displayWidth/cropBox.w});cropTarget.setCoords();$('cropDialog').close();cropTarget=null;commit();
}
async function renderPage(p,scale=1){
 const out=new F.StaticCanvas(document.createElement('canvas'),{width:Math.round(p.width*scale),height:Math.round(p.height*scale),enableRetinaScaling:false,renderOnAddRemove:false});
 try{await out.loadFromJSON(sceneOnly(p));await setBackground(out,p);out.setViewportTransform([scale,0,0,scale,0,0]);out.renderAll();const c=document.createElement('canvas');c.width=out.width;c.height=out.height;c.getContext('2d').drawImage(out.lowerCanvasEl,0,0);return c;}finally{await out.dispose();}
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function exportImages(all){
 exitText();capture();await busy(async()=>{
 await document.fonts.ready;const scale=Number($('exportScale').value),ps=all?doc.pages:[page()],files={};
 const base=doc.name.replace(/[\\/:*?"<>|]/g,'-').slice(0,60)||'小红书画布';
 for(let i=0;i<ps.length;i++){
 $('busy').firstElementChild.textContent='正在导出 '+(i+1)+' / '+ps.length+'…';
 const c=await renderPage(ps[i],scale);const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!blob)throw Error('图片生成失败，请选择标准清晰度重试');
 const name=base+'-'+String(all?i+1:doc.current+1).padStart(2,'0')+'.png';
 if(all)files[name]=new Uint8Array(await blob.arrayBuffer());else downloadBlob(blob,name);
 c.width=c.height=1;
 }
 if(all){const zipped=await new Promise((resolve,reject)=>window.fflate.zip(files,{level:0},(err,data)=>err?reject(err):resolve(data)));downloadBlob(new Blob([zipped],{type:'application/zip'}),base+'.zip');}
 $('exportDialog').close();toast(all?'已生成全部页面 ZIP':'已生成当前页 PNG');
 });$('busy').firstElementChild.textContent='正在处理…';
}
function toggleSelection(target){
 if(target.locked)return;const objects=canvas.getActiveObjects().filter(o=>!o.locked);canvas.discardActiveObject();
 const i=objects.indexOf(target);if(i<0)objects.push(target);else objects.splice(i,1);
 if(objects.length)canvas.setActiveObject(objects.length===1?objects[0]:new F.ActiveSelection(objects,{canvas}));
 canvas.requestRenderAll();updateProperties();
}
function snap(o){
 guides=[];if(o.locked)return;const r=o.getBoundingRect(),threshold=6/zoom;
 const xs=[0,page().width/2,page().width],ys=[0,page().height/2,page().height];
 canvas.getObjects().filter(x=>x!==o&&!canvas.getActiveObjects().includes(x)&&x.visible).forEach(x=>{const b=x.getBoundingRect();xs.push(b.left,b.left+b.width/2,b.left+b.width);ys.push(b.top,b.top+b.height/2,b.top+b.height);});
 let bestX=threshold,bestY=threshold,dx=0,dy=0,gx,gy;
 [r.left,r.left+r.width/2,r.left+r.width].forEach(x=>xs.forEach(t=>{if(Math.abs(t-x)<bestX){bestX=Math.abs(t-x);dx=t-x;gx=t;}}));
 [r.top,r.top+r.height/2,r.top+r.height].forEach(y=>ys.forEach(t=>{if(Math.abs(t-y)<bestY){bestY=Math.abs(t-y);dy=t-y;gy=t;}}));
 o.set({left:o.left+dx,top:o.top+dy});if(gx!==undefined)guides.push(['x',gx]);if(gy!==undefined)guides.push(['y',gy]);
}
canvas.on('after:render',()=>{if(!guides.length)return;const c=canvas.getContext();c.save();c.strokeStyle='#df3d60';c.lineWidth=1;c.setLineDash([4,4]);guides.forEach(([axis,v])=>{c.beginPath();if(axis==='x'){c.moveTo(v*zoom,0);c.lineTo(v*zoom,canvas.height);}else{c.moveTo(0,v*zoom);c.lineTo(canvas.width,v*zoom);}c.stroke();});c.restore();});
canvas.on('object:moving',({target,e})=>{liveDirty=true;if(!e?.altKey)snap(target);});
canvas.on('object:scaling',()=>{liveDirty=true;});
canvas.on('object:rotating',()=>{liveDirty=true;});
canvas.on('object:modified',()=>{guides=[];canvas.requestRenderAll();commit();});
canvas.on('mouse:up',()=>{guides=[];canvas.requestRenderAll();});
['selection:created','selection:updated','selection:cleared'].forEach(event=>canvas.on(event,()=>{selectedRange=null;updateProperties();}));
canvas.on('text:selection:changed',({target})=>{selectedRange={object:target,start:target.selectionStart,end:target.selectionEnd};updateProperties();});
canvas.on('text:changed',()=>{liveDirty=true;clearTimeout(textTimer);textTimer=setTimeout(commit,350);});
canvas.on('text:editing:exited',()=>{clearTimeout(textTimer);commit();});
canvas.on('mouse:dblclick',({target})=>{if(isText(target)&&!target.locked)closePanels({restoreFocus:false});});
// Keep text selection when a toolbar control receives focus.
$('propertiesPanel').addEventListener('pointerdown',()=>{const o=canvas.getActiveObject();if(isText(o)&&o.isEditing)selectedRange={object:o,start:o.selectionStart,end:o.selectionEnd};},true);
document.querySelectorAll('.formatting button, [data-text-align]').forEach(b=>b.addEventListener('mousedown',e=>e.preventDefault()));
// A touch multi-select button provides Shift-click without a keyboard.
const originalSelection=canvas._isSelectionKeyPressed.bind(canvas);
canvas._isSelectionKeyPressed=e=>multi||originalSelection(e);
// Two fingers zoom and pan the workspace; a single finger edits objects.
let pinch=null;
const distance=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
$('artboard').addEventListener('touchstart',e=>{
 if(e.touches.length!==2)return;e.preventDefault();e.stopImmediatePropagation();
 // End any one-finger transform before starting the view gesture.
 if(canvas._currentTransform){canvas.endCurrentTransform(e);}
 pinch={distance:distance(e.touches),zoom,x:(e.touches[0].clientX+e.touches[1].clientX)/2,y:(e.touches[0].clientY+e.touches[1].clientY)/2,left:$('stage').scrollLeft,top:$('stage').scrollTop};
}, {capture:true,passive:false});
$('artboard').addEventListener('touchmove',e=>{if(!pinch||e.touches.length!==2)return;e.preventDefault();e.stopImmediatePropagation();autoFit=false;setZoom(pinch.zoom*distance(e.touches)/pinch.distance);$('stage').scrollLeft=pinch.left+pinch.x-(e.touches[0].clientX+e.touches[1].clientX)/2;$('stage').scrollTop=pinch.top+pinch.y-(e.touches[0].clientY+e.touches[1].clientY)/2;},{capture:true,passive:false});
$('artboard').addEventListener('touchend',()=>{pinch=null;},{capture:true});
$('stage').addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();autoFit=false;setZoom(zoom*(e.deltaY<0?1.08:.92));}},{passive:false});
$('stage').addEventListener('scroll',()=>canvas.calcOffset());
new ResizeObserver(()=>{if(autoFit)fit();}).observe($('stage'));
$('zoomLabel').onchange=()=>{if($('zoomLabel').value==='fit')fit();else {autoFit=false;setZoom(Number($('zoomLabel').value));}};
const actions={
 beginTemplates:()=>showAssets('templates'),beginText:()=>addText(false),
 focusMode:()=>{const focused=document.body.classList.toggle('focus-mode');$('focusMode').setAttribute('aria-pressed',String(focused));$('focusMode').textContent=focused?'退出专注':'专注编辑';TooltipUI.close();},
 addHeading:()=>addText(true),addText:()=>addText(false),uploadImage:()=>$('imageInput').click(),uploadBackground:()=>$('backgroundInput').click(),
 undo:()=>undo(-1),redo:()=>undo(1),fit,zoomIn:()=>{autoFit=false;setZoom(zoom*1.2);},zoomOut:()=>{autoFit=false;setZoom(zoom/1.2);},
 addPage:()=>newPage(),duplicatePage:async()=>{exitText();capture();await busy(async()=>{const p=clone(page());p.id=crypto.randomUUID();doc.pages.splice(doc.current+1,0,p);doc.current++;await loadPage();});commit();},
 deletePage:async()=>{if(doc.pages.length===1)return;if(!confirm('删除当前页？可以通过撤销恢复。'))return;exitText();await busy(async()=>{doc.pages.splice(doc.current,1);doc.current=Math.min(doc.current,doc.pages.length-1);await loadPage();});commit();},
 pageLeft:()=>movePage(-1),pageRight:()=>movePage(1),
 duplicate,deleteSelection,group,ungroup,lock:()=>{const o=canvas.getActiveObject();if(!o||o instanceof F.ActiveSelection)return;exitText();applyLock(o,!o.locked);canvas.requestRenderAll();commit();return true;},
 raise:()=>{const objects=selectionObjects();if(objects.some(o=>o.locked))return;canvas.getObjects().slice().reverse().filter(o=>objects.includes(o)).forEach(o=>canvas.bringObjectForward(o));commit();},
 lower:()=>{const objects=selectionObjects();if(objects.some(o=>o.locked))return;canvas.getObjects().filter(o=>objects.includes(o)).forEach(o=>canvas.sendObjectBackwards(o));commit();},
 editText:()=>{const o=editableObject();if(isText(o)){closePanels({restoreFocus:false});o.enterEditing();o.selectAll();o.hiddenTextarea?.focus();canvas.requestRenderAll();}},
 bold:()=>{const o=canvas.getActiveObject();if(isText(o))textStyle('fontWeight',['bold',700,800,900].includes(currentTextStyle(o,'fontWeight'))?400:700);},
 italic:()=>{const o=canvas.getActiveObject();if(isText(o))textStyle('fontStyle',currentTextStyle(o,'fontStyle')==='italic'?'normal':'italic');},
 underline:()=>{const o=canvas.getActiveObject();if(isText(o))textStyle('underline',!currentTextStyle(o,'underline'));},
 crop:openCrop,applyCrop,flip:()=>changeObject(o=>o.set('flipX',!o.flipX)),
 showElements:()=>showAssets('elements'),showTemplates:()=>showAssets('templates'),showBackgrounds:()=>showAssets('backgrounds'),
 showProperties:()=>SheetUI.toggle('propertiesPanel','properties'),closePanel:()=>closePanels(),
 multi:()=>{multi=!multi;$('multiButton').setAttribute('aria-pressed',String(multi));toast(multi?'多选已开启，依次点选元素':'已退出多选');updateProperties();},
 export:()=>{exitText();capture();$('exportInfo').textContent='共 '+doc.pages.length+' 页 · 当前第 '+(doc.current+1)+' 页 · '+page().width+' × '+page().height;$('exportDialog').showModal();},
 exportCurrent:()=>exportImages(false),exportAll:()=>exportImages(true)
};
function movePage(delta){const next=doc.current+delta;if(next<0||next>=doc.pages.length)return;capture();[doc.pages[doc.current],doc.pages[next]]=[doc.pages[next],doc.pages[doc.current]];doc.current=next;commit();}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b||b.disabled||loading)return;
 if(b.dataset.action){try{const completed=await actions[b.dataset.action]?.();if(completed===true&&b.closest('.object-actions'))ToolbarUI.feedback(b);}catch(e){console.error(e);toast('操作未完成，请重试');}}
 if(b.dataset.textAlign)changeObject(o=>{if(isText(o))o.set('textAlign',b.dataset.textAlign);});
 if(b.dataset.tab){showTab(b.dataset.tab);SheetUI.setEntry(b.dataset.tab);}if(b.dataset.shape)addShape(b.dataset.shape);if(b.dataset.align)align(b.dataset.align);
});
$('documentName').addEventListener('change',commit);
document.querySelectorAll('[data-style]').forEach(input=>input.addEventListener('change',()=>{let value=input.value;if(input.dataset.style==='fontSize'){value=Number(value);if(!Number.isFinite(value)||value<8||value>400){updateProperties();return;}}textStyle(input.dataset.style,value);}));
$('lineHeight').onchange=()=>changeObject(o=>o.set('lineHeight',Math.max(.8,Math.min(3,Number($('lineHeight').value)||1.3))));
$('shapeColor').onchange=()=>changeObject(o=>o.set('fill',$('shapeColor').value));
$('objectOpacity').onchange=()=>{const value=Math.max(0,Math.min(1,Number($('objectOpacity').value)/100));if(selectionObjects().some(o=>o.locked))return;selectionObjects().forEach(o=>o.set('opacity',value));canvas.requestRenderAll();commit();};
document.querySelectorAll('[data-geometry]').forEach(input=>input.onchange=()=>changeObject(o=>{
 const key=input.dataset.geometry,v=Number(input.value);if(!Number.isFinite(v))return;
 if(key==='width'){if(v<1)return;if(isText(o)){o.set('width',v/o.scaleX);o.initDimensions();}else o.set('scaleX',v/o.width);}
 else if(key==='height'){if(v>=1&&!isText(o))o.set('scaleY',v/o.height);}
 else o.set(key,v);
}));
$('canvasSize').onchange=async()=>{exitText();const [w,h]=$('canvasSize').value.split(',').map(Number);await busy(async()=>{page().width=w;page().height=h;await setBackground(canvas,page());$('dimensions').textContent=w+' × '+h;fit();});commit();toast('已更改画布尺寸，元素位置保留，可继续调整');};
$('backgroundColor').onchange=async()=>{await busy(async()=>{page().background={kind:'solid',color:$('backgroundColor').value};await setBackground(canvas,page());});commit();};
$('imageInput').onchange=async e=>{await importImages([...e.target.files]);e.target.value='';};
$('backgroundInput').onchange=async e=>{await importImages([...e.target.files],true);e.target.value='';};
['cropRatio','cropZoom','cropX','cropY'].forEach(id=>$(id).addEventListener('input',drawCrop));
$('stage').addEventListener('dragover',e=>{e.preventDefault();$('stage').classList.add('drag-over');});
$('stage').addEventListener('dragleave',()=>$('stage').classList.remove('drag-over'));
$('stage').addEventListener('drop',e=>{e.preventDefault();$('stage').classList.remove('drag-over');importImages([...e.dataTransfer.files]);});
document.addEventListener('paste',e=>{if(/INPUT|TEXTAREA/.test(document.activeElement.tagName)||canvas.getActiveObject()?.isEditing)return;const files=[...(e.clipboardData?.files||[])];if(files.length){e.preventDefault();importImages(files);}});
document.addEventListener('keydown',async e=>{
 if(loading||document.querySelector('dialog[open]'))return;
 const native=/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)||canvas.getActiveObject()?.isEditing;
 if(native)return;const mod=e.ctrlKey||e.metaKey;
 if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey?1:-1);}
 else if(mod&&e.key.toLowerCase()==='y'){e.preventDefault();undo(1);}
 else if(mod&&e.key.toLowerCase()==='a'){e.preventDefault();canvas.discardActiveObject();canvas.setActiveObject(new F.ActiveSelection(canvas.getObjects().filter(o=>!o.locked),{canvas}));canvas.requestRenderAll();}
 else if(mod&&e.key.toLowerCase()==='d'){e.preventDefault();duplicate();}
 else if(mod&&e.key.toLowerCase()==='c'){const o=canvas.getActiveObject();if(o){e.preventDefault();clipboard=await o.clone();}}
 else if(mod&&e.key.toLowerCase()==='v'&&clipboard){e.preventDefault();await busy(async()=>{const o=await clipboard.clone();canvas.discardActiveObject();const objects=o instanceof F.ActiveSelection?o.removeAll():[o];objects.forEach(x=>{x.set({left:x.left+24,top:x.top+24});canvas.add(x);});canvas.setActiveObject(objects.length===1?objects[0]:new F.ActiveSelection(objects,{canvas}));});commit();}
 else if(mod&&e.key.toLowerCase()==='g'){e.preventDefault();e.shiftKey?ungroup():group();}
 else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteSelection();}
 else if(e.key==='Escape'){exitText();canvas.discardActiveObject();closePanels();canvas.requestRenderAll();}
 else if(e.key.startsWith('Arrow')){e.preventDefault();const d=e.shiftKey?10:1;changeObject(o=>{if(selectionObjects().some(x=>x.locked))return;if(e.key==='ArrowLeft')o.left-=d;if(e.key==='ArrowRight')o.left+=d;if(e.key==='ArrowUp')o.top-=d;if(e.key==='ArrowDown')o.top+=d;});}
});
window.addEventListener('beforeunload',e=>{if(saveFailed||liveDirty||(!loading&&JSON.stringify(doc)!==persistedSnapshot)){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&!loading){capture();saveDraft();}});
backgrounds.forEach(bg=>{const b=document.createElement('button');b.title=bg.name;b.style.background=bg.kind==='gradient'?'linear-gradient(135deg,'+bg.color+','+bg.color2+')':bg.color;
 if(bg.kind==='grid')b.style.backgroundImage='linear-gradient(#88997722 1px,transparent 1px),linear-gradient(90deg,#88997722 1px,transparent 1px)';
 if(bg.kind==='dots')b.style.backgroundImage='radial-gradient(#8899aa66 1px,transparent 1px)';
 if(bg.kind==='paper')b.style.backgroundImage='repeating-linear-gradient(25deg,transparent 0 3px,#9e83500a 4px 5px)';
 if(bg.kind==='grid'||bg.kind==='dots')b.style.backgroundSize='12px 12px';
 const s=document.createElement('span');s.textContent=bg.name;b.append(s);b.onclick=async()=>{if(loading)return;await busy(async()=>{page().background=clone(bg);await setBackground(canvas,page());});commit();};$('backgroundList').append(b);
});
CardTemplates.presets.forEach(p=>{const b=document.createElement('button');b.className='template-card';const art=document.createElement('div');art.className='template-art';art.style.background=p[3];art.style.color=p[4];const title=document.createElement('b');title.textContent=p[2];art.append(document.createElement('i'),title);const label=document.createElement('span');label.textContent=p[1];b.append(art,label);b.onclick=()=>newPage(p[0]);$('templateList').append(b);});
async function init(){
 await busy(async()=>{
 try{db=await openDB();const draft=await readDraft();if(draft?.version===1&&Array.isArray(draft.pages)&&draft.pages.length){doc=draft;doc.current=Math.max(0,Math.min(doc.current,doc.pages.length-1));}else{const t=CardTemplates.make('cover');doc.pages[0].background=t.background;doc.pages[0].scene={objects:t.objects.map(o=>o.toObject())};}}
 catch(e){console.warn(e);saveFailed=true;$('saveStatus').textContent='本地保存不可用，请及时导出';toast('此浏览器不允许本地存储，仍可编辑和导出');}
 await loadPage();await regenerateThumbnails();
 });commit();if(!db)$('saveStatus').textContent='本地保存不可用，请及时导出';
}
init();
})();
