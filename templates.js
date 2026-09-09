/* Editable template factories. All content remains independent Fabric objects. */
(() => {
  const F = window.fabric;
  const presets = [
    ['cover','封面标题','把日子过成\n喜欢的样子','#fff6f2','#d84462'],
    ['list','清单笔记','周末充电\n小清单','#f3f8f1','#477454'],
    ['quote','金句卡片','慢一点，\n也没关系。','#f4f1fa','#766296'],
    ['steps','步骤教程','把复杂的事\n拆成三步','#edf4fb','#386a9a'],
    ['magazine','杂志封面','LIFE\n日常观察','#f2eee7','#8d6652'],
    ['checklist','打勾清单','今天也要\n照顾好自己','#fff6df','#ad762b'],
    ['compare','对比卡片','换个方式\n看问题','#f2f5fb','#526b9b'],
    ['timeline','时间线','一个人的\n理想周末','#f5f8f3','#487654'],
    ['memo','便签拼贴','收集生活\n里的小确幸','#fff0f5','#b8547e'],
    ['code','代码 / 摘录','灵感，\n值得被记录','#252a36','#ffc77a']
  ];
  function make(key,w=1080,h=1440) {
    const p=presets.find(x=>x[0]===key)||presets[0];
    const dark=key==='code', ink=dark?'#f4f4f8':'#292c37', muted=dark?'#b0b5c2':'#85838b', accent=p[4];
    const items=[], s=Math.min(w/1080,h/1440), ox=(w-1080*s)/2, oy=(h-1440*s)/2;
    const text=(str,x,y,size=48,opts={})=>{const o=new F.Textbox(str,{fontFamily:'Microsoft YaHei',fill:ink,lineHeight:1.35,splitByGrapheme:true,...opts,left:ox+x*s,top:oy+y*s,width:(opts.width||880)*s,fontSize:size*s});items.push(o);return o};
    const rect=(x,y,ww,hh,fill,opts={})=>{const o=new F.Rect({left:ox+x*s,top:oy+y*s,width:ww*s,height:hh*s,fill,rx:18*s,ry:18*s,strokeWidth:0,...opts});items.push(o);return o};
    text('生活灵感 / NOTES',88,76,23,{fill:accent,charSpacing:130});
    text('@你的名字',88,1330,24,{fill:muted,width:600});
    text('记录 · 分享 · 收藏',730,1330,20,{fill:muted,width:280,textAlign:'right'});
    if(key==='cover'){
      rect(88,230,100,10,accent);
      text('把日子过成\n喜欢的样子',88,315,106,{fontWeight:700,lineHeight:1.25});
      text('不必等到一切准备好\n从今天的一件小事开始',94,690,38,{fill:muted});
      rect(88,970,904,220,'#f9e6df');
      text('给自己一点留白\n也给生活一点可能',125,1010,38,{width:810});
    } else if(key==='quote'){
      text('“',95,220,180,{fill:accent});
      text('慢一点，\n也没关系。',100,460,100,{fontFamily:'SimSun',textAlign:'center',fontWeight:700});
      text('你不需要和所有人\n走在同一个时区。',120,835,40,{textAlign:'center',fill:muted,width:840});
    } else if(key==='magazine'){
      text('LIFE',75,155,195,{fontFamily:'SimSun',fontWeight:700});
      rect(88,425,904,470,'#dfd6c7',{rx:0,ry:0});
      text('日常观察',128,530,100,{fontFamily:'SimSun',fontWeight:700,width:800});
      text('把平凡的瞬间\n留成自己的故事',130,700,36,{width:790});
      text('本期主题 / 找回生活的节奏',88,980,36,{fill:accent});
      text('散步 · 阅读 · 好好吃饭',88,1060,31,{fill:muted});
    } else if(key==='compare'){
      text('换个方式看问题',88,225,74,{fontWeight:700});
      rect(88,460,425,650,'#e4e8ef');rect(541,460,451,650,'#dceade');
      text('以前',125,510,45,{width:330,fill:muted});
      text('现在',580,510,45,{width:330,fill:accent});
      text('等完美时机\n\n一次做太多\n\n只看结果',125,630,34,{width:340});
      text('先开始一点\n\n每天进一步\n\n记录小进步',580,630,34,{width:340});
    } else if(key==='memo'){
      text('收集生活的小确幸',88,225,70,{fontWeight:700});
      rect(105,445,790,300,'#ffe1a3',{angle:-3});
      text('今天的开心\n喝到一杯刚好的咖啡',140,485,44,{width:700,angle:-3});
      rect(170,840,790,320,'#e3e7fc',{angle:3});
      text('给明天的自己\n别忘记出门看看天空',205,888,44,{width:700,angle:3});
    } else if(key==='code'){
      text('灵感，值得被记录',88,245,70,{fontWeight:700});
      rect(88,480,904,650,'#171b24');
      text('NOTE TO SELF',130,530,28,{fill:accent,width:800,fontFamily:'Consolas'});
      text('const today = {\n  mood: "保持好奇",\n  plan: "先做一点",\n  progress: true\n};\n\n// 每一步都算数',130,635,37,{fontFamily:'Consolas',width:790});
    } else {
      const titles={list:'周末充电小清单',steps:'把复杂的事拆成三步',checklist:'今天也要照顾好自己',timeline:'一个人的理想周末'};
      text(titles[key],88,225,70,{fontWeight:700});
      const rows=key==='timeline'?['09:00  /  出门散步','14:00  /  读几页喜欢的书','20:00  /  整理今天的心情']:key==='steps'?['先找到一个具体问题','把它拆成可以完成的小事','开始行动，再慢慢调整']:key==='checklist'?['喝水，伸个懒腰','给自己做一顿喜欢的饭','留一点时间，什么也不做']:['放下手机，出门走走','找一本想读很久的书','收拾一个让你放松的角落'];
      rows.forEach((row,i)=>{
        const y=465+i*215;
        rect(88,y,904,170,key==='checklist'?'#ffedbb':'#ffffff');
        text(key==='checklist'?'✓':String(i+1).padStart(2,'0'),125,y+48,43,{fill:accent,width:95});
        text(row,245,y+55,35,{width:690});
      });
    }
    return {objects:items,background:{kind:'solid',color:p[3]}};
  }
  function universityBackground(w,h,bg){
    const s=Math.min(w,h)/1080,inset=22*s;
    const objects=[new F.Rect({width:w,height:h,fill:bg.color||'#f4f5f7',strokeWidth:0}),
      new F.Rect({left:inset,top:inset,width:w-2*inset,height:h-2*inset,rx:32*s,ry:32*s,fill:'#fff',strokeWidth:0})];
    if(bg.decorations!==false){
      for(let row=0;row<4;row++)for(let col=0;col<6;col++)objects.push(new F.Circle({left:w-(243-col*27)*s,top:(112+row*27)*s,radius:4*s,fill:bg.accent,opacity:.22,strokeWidth:0}));
      objects.push(new F.Rect({left:82*s,top:h-110*s,width:164*s,height:7*s,rx:3*s,ry:3*s,fill:bg.accent,opacity:.55,strokeWidth:0}));
    }
    return new F.Group(objects,{left:0,top:0,selectable:false,evented:false,objectCaching:false});
  }
  // Compatibility renderer for backgrounds already saved in existing drafts.
  window.CardTemplates={presets,make,universityBackground};
})();
