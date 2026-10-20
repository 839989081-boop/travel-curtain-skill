'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const stage = $('stage'), back = $('background'), front = $('foreground'), shadow = $('shadow');
  const bg = back.getContext('2d'), fg = front.getContext('2d'), sh = shadow.getContext('2d');
  const sampleTitles=[['山湖倒影','木屋与花园','走进山野','雾中的森林'],['水边人家','山间茶田','石桥旧梦','马头墙下'],['寺院庭深（示意）','斗拱光影（示意）','河畔暮色（示意）','山间古寺（示意）']];
  const cities=TravelPlaces.places;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let COLS = 32, DX = 12.75, BW = 6.3;
  const ROWS = 72, DY = 6.1, BH = 4.25;
  let width = 0, height = 0, dpr = 1, base = 1, city = 0, columns = [], groups = [], selected = 42, selectedRow = 32;
  let zoom = 1, zoomTarget = 1, camX = 0, camY = -110, hover = null, lastTime = 0, dragging = false, dragged = false;
  let pointer = {x:-999,y:-999,wx:0,wy:0,active:false}, pinch = null, pointers = new Map(), drawFrame = 0, textureVersion = 0;
  let ready = false, stored = {}, busy = false, db = null;
  let curtainOpen=false, reveal=0, revealStarted=0, actionPhoto=null;
  let categoryFilter='all',photoQueue=[],photoIndex=0,currentPhoto=null,carouselDrag=null,classificationRun=0;
  let records={};try{records=JSON.parse(localStorage.getItem('travel-curtain-records-v1')||'{}');}catch{}
  const categoryNames={landscape:'风景',portrait:'人物',mixed:'人景合照',unknown:'待确认'};
  function photoKey(photo){return photo.sourceKey || `sample-${photo.sample}`;}
  function recordFor(photo){return records[photoKey(photo)]||{};}
  function categoryFor(photo){return recordFor(photo).category || photo.category || 'unknown';}
  function sourceGroups(){return stored[city]||makeDemo();}
  function filteredGroups(){return sourceGroups().map(g=>({name:g.name,photos:g.photos.filter(p=>(categoryFilter==='all'||categoryFor(p)===categoryFilter))})).filter(g=>g.photos.length);}
  function refreshFilters(preserve=false){
    const previousName=groups[selected]?.name,previousRow=selectedRow,previousZoom=zoomTarget;
    const all=sourceGroups().flatMap(g=>g.photos),unique=[...new Map(all.map(p=>[photoKey(p),p])).values()];
    groups=filteredGroups();const count=groups.reduce((n,g)=>n+g.photos.length,0);
    $('filter-summary').textContent=stored[city]?`${count} 张照片`:`${unique.length} 张示例`;
    if(!count){groups=[{name:'暂无符合筛选的照片',photos:[]}];toast('暂无符合条件的照片，可以切换筛选或导入照片');}
    if(!preserve || !count)reset();makeColumns();
    if(preserve && count){const match=groups.findIndex(g=>g.name===previousName);selected=match<0?0:match;selectedRow=Math.min(previousRow,columns[selected].length-1);zoomTarget=previousZoom;hover=null;actionPhoto=null;updatePeriod();}
  }
  function saveRecord(photo,patch){
    const key=photoKey(photo),next={...records,[key]:{...recordFor(photo),...patch}};
    try{localStorage.setItem('travel-curtain-records-v1',JSON.stringify(next));records=next;return true;}
    catch{toast('记录未保存：浏览器存储空间不足');return false;}
  }
  const roof = new Image(), sheet = new Image(), thumbs = [], demoPhotos = [];
  roof.src = 'assets/roofs-v2.png'; sheet.src = 'assets/photos-v2.png';
  const importedImages = new Map();
  function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 4500); }
  function loadImage(img) { return new Promise((resolve,reject) => { if(img.complete && img.naturalWidth) return resolve(img); img.onload = () => resolve(img); img.onerror = () => reject(new Error('图片素材未能加载')); }); }
  function monthFor(col) { const date = new Date(2022, col, 1); return `${date.getFullYear()}年${date.getMonth()+1}月`; }
  function makeDemo() {
    return Array.from({length:COLS}, (_,i) => ({name:monthFor(i), photos:Array.from({length:ROWS}, (_,j) => demoPhotos[cities[city].demoIndex*4+(j+i)%4])}));
  }
  function photoAt(col,row) { const g = groups[col]; return g.photos[((row % g.photos.length)+g.photos.length)%g.photos.length]; }
  function makeColumns() {
    columns = Array.from({length:groups.length},(_,c) => Array.from({length:Math.max(1,stored[city]?groups[c].photos.length:ROWS)},(_,r) => { const x=(c-(groups.length-1)/2)*DX; return {x,y:r*DY,px:x,py:r*DY,ox:x,oy:r*DY}; }));
    selected = Math.floor(groups.length/2); selectedRow=Math.min(32,Math.floor(columns[selected].length/2)); textureVersion++;
    $('collection-info').textContent = `${cities[city].name} · ${stored[city] ? stored[city].reduce((n,g)=>n+g.photos.length,0)+' 张照片' : '示例风景'}`;
    $('sample-label').textContent=stored[city]?'照片保存在此浏览器':'通用 AI 示例 · 非本地区实拍';
    document.body.dataset.city = String(city); document.body.dataset.columns = String(groups.length);
    updatePeriod();
  }
  function resize() {
    width=stage.clientWidth; height=stage.clientHeight; dpr=Math.min(devicePixelRatio||1,2);
    for(const c of [back,front,shadow]) {c.width=Math.round(width*dpr);c.height=Math.round(height*dpr);c.getContext('2d').setTransform(dpr,0,0,dpr,0,0);}
    base=Math.min(width*.46/480,(height-130)/680); base=Math.max(.28,base);
  }
  function world(screenX,screenY) { const s=base*zoom; return {x:(screenX-width/2)/s+camX,y:(screenY-height/2)/s+camY}; }
  function screen(x,y) { const s=base*zoom; return {x:(x-camX)*s+width/2,y:(y-camY)*s+height/2}; }
  function nearestColumn(x,y=selectedRow*DY) { let closest=0,distance=Infinity;for(let c=0;c<columns.length;c++){const r=Math.max(0,Math.min(columns[c].length-1,Math.round(y/DY)));const d=Math.abs(columns[c][r].x-x);if(d<distance){distance=d;closest=c;}}return closest; }
  function chooseAt(x,y) { const p=world(x,y); selected=nearestColumn(p.x,p.y); selectedRow=Math.max(0,Math.min(columns[selected].length-1,Math.round(p.y/DY))); updatePeriod(); }
  function updatePeriod() {
    if(!groups.length) return;
    selectedRow=Math.max(0,Math.min(columns[selected].length-1,selectedRow));
    $('period-name').textContent=groups[selected].name;
    $('period-city').textContent=`${cities[city].name} · ${cities[city].subtitle}`;
    $('period-count').textContent=stored[city] ? `${groups[selected].photos.length} 张照片` : '通用 AI 示例 · 非本地区实拍';
    document.body.dataset.selected=String(selected);
  }
  function setZoom(value) { if(!curtainOpen && value>1) return; zoomTarget=Math.max(1,Math.min(72,value)); }
  function focusColumn() { setZoom(56); updatePeriod(); }
  function reset() { zoomTarget=1; hover=null; actionPhoto=null; pointer.active=false; $('photo-action').hidden=true; }
  function toggleRoof() {
    if(!ready)return;
    curtainOpen=!curtainOpen;reset();revealStarted=performance.now();
    if(!curtainOpen)reveal=0;
    $('roof-toggle').setAttribute('aria-expanded',String(curtainOpen));
    $('roof-toggle').setAttribute('aria-label',`${curtainOpen?'收起':'展开'}${cities[city].name}照片珠帘`);
  }
  async function swapCity(value) {
    if(busy)return false;if(!Number.isInteger(value)||!cities[value])return false;
    busy=true;try{await TravelPlaces.select(value);city=value;reset();curtainOpen=false;reveal=0;refreshFilters();
      $('roof-toggle').setAttribute('aria-expanded','false');$('roof-toggle').setAttribute('aria-label',`展开${cities[city].name}照片珠帘`);
      window.dispatchEvent(new CustomEvent('curtain:place-changed',{detail:{index:value}}));return true;
    }finally{busy=false;}
  }
  function spring(dt,time) {
    const iterations = 3;
    const wind = reduced ? 0 : Math.sin(time*.00052)*.002;
    for(let c=0;c<columns.length;c++) {
      const line=columns[c];
      for(let r=1;r<line.length;r++) {
        const p=line[r],vx=(p.x-p.px)*.945,vy=(p.y-p.py)*.945; p.px=p.x;p.py=p.y;
        p.x+=vx+wind*(r/line.length)+((p.ox-p.x)*.0004);p.y+=vy+.006;
        if(pointer.active && zoom<18) {
          const ddx=p.x-pointer.wx,ddy=p.y-pointer.wy,radius=24;
          const dist=Math.hypot(ddx,ddy);
          if(dist<radius) { const direction=ddx===0?(c%2?1:-1):Math.sign(ddx); p.x+=direction*(radius-dist)*.15*Math.max(.1,r/18); }
        }
        if(pointer.active && dragging && zoom>=18 && c===selected) {
          const dx=p.x-pointer.wx,dy=p.y-pointer.wy;
          if(Math.abs(dy)<9 && Math.abs(dx)<8) p.x+=Math.sign(dx||1)*.025*(9-Math.abs(dy));
        }
      }
      line[0].x=line[0].ox;line[0].y=0;
      for(let iter=0;iter<iterations;iter++) for(let r=1;r<line.length;r++) {
        const a=line[r-1],b=line[r],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
        const diff=(len-DY)/len;
        if(r===1) {b.x-=dx*diff;b.y-=dy*diff;} else {a.x+=dx*diff*.5;a.y+=dy*diff*.5;b.x-=dx*diff*.5;b.y-=dy*diff*.5;}
        b.y=Math.max(b.y,a.y+DY*.7);
      }
      for(let r=1;r<line.length-1;r++)line[r].x+=((line[r-1].x+line[r+1].x)*.5-line[r].x)*.12;
    }
  }
  function drawRoof(ctx,alpha=1,isShadow=false) {
    if(!roof.naturalWidth) return;
    const s=base*zoom,p=screen(-240,-266),rw=480*s,rh=305*s;
    if(p.y>height || p.y+rh<0) return;
    ctx.save();ctx.globalAlpha=alpha;
    if(isShadow) {ctx.translate(p.x+80*s,p.y+54*s);ctx.transform(1,0,.3,1,0,0);ctx.filter='brightness(0)';}
    const custom=TravelPlaces.roof(city);
    if(custom?.image){const img=custom.image,ratio=Math.min(rw/img.naturalWidth,rh/img.naturalHeight),w=img.naturalWidth*ratio,h=img.naturalHeight*ratio;ctx.drawImage(img,(isShadow?0:p.x)+(rw-w)/2,(isShadow?0:p.y)+rh-h,w,h);}
    else {const cell=roof.naturalWidth/3,preset=custom?.preset??cities[city].roofIndex,margin=preset===1?cell*.06:0;ctx.drawImage(roof,preset*cell+margin,100,cell-margin*2,460,isShadow?0:p.x,isShadow?0:p.y,rw,rh);}
    ctx.restore();
  }
  function drawStrand(ctx,c,alpha) {
    if(reveal<=0)return;
    const line=columns[c],s=base*zoom;
    const fall=Math.max(0,Math.min(1,reveal*1.15-(Math.sin(c*.71)+1)*.075));
    const visibleRows=Math.ceil(line.length*fall);
    ctx.globalAlpha=alpha;
    if(zoom>9) {
      ctx.beginPath(); let begun=false;
      for(const p of line.slice(0,visibleRows)) {const q=screen(p.x,p.y);if(q.y< -20 || q.y>height+20) continue;if(!begun){ctx.moveTo(q.x,q.y);begun=true;}else ctx.lineTo(q.x,q.y);}
      ctx.lineWidth=Math.min(.6,s*.07);ctx.strokeStyle='#988b7440';ctx.stroke();
    }
    for(let r=0;r<visibleRows;r++) {
      const p=line[r],entry=reveal>=1?1:Math.min(1,Math.max(0,(fall-r/line.length)*12));
      const q=screen(p.x,p.y-(1-entry)*7),w=BW*s,h=BH*s;
      if(q.x<-w||q.x>width+w||q.y<-h||q.y>height+h)continue;
      const photo=photoAt(c,r);const image=photo?.thumb;
      if(!image)continue;
      ctx.globalAlpha=alpha*entry;ctx.drawImage(image,q.x-w/2,q.y-h/2,w,h);
      if(zoom>18) {ctx.strokeStyle='rgba(255,250,238,.6)';ctx.lineWidth=.6;ctx.strokeRect(q.x-w/2,q.y-h/2,w,h);}
    }
    ctx.globalAlpha=1;
  }
  function drawShadow() {
    sh.clearRect(0,0,width,height);
    if(zoom>5)return;
    // Shadows belong to objects only. There is no dark fill behind the curtain.
    drawRoof(sh,.11,true);
    const s=base*zoom;sh.fillStyle='rgba(101,78,44,.07)';
    if(reveal<=0)return;
    for(let c=0;c<columns.length;c+=2) {
      sh.beginPath();
      for(let r=0;r<columns[c].length*reveal;r+=4) {const p=columns[c][r],q=screen(p.x+75+p.y*.2,p.y*.58+54);if(r===0)sh.moveTo(q.x,q.y);else sh.lineTo(q.x,q.y);}
      sh.lineWidth=1.7*s;sh.strokeStyle='rgba(94,69,36,.09)';sh.stroke();
    }
  }
  function hitPhoto(x,y) {
    if(zoom<22)return null;
    const s=base*zoom;
    for(let r=0;r<columns[selected].length;r++) {const q=screen(columns[selected][r].x,columns[selected][r].y);if(Math.abs(x-q.x)<BW*s/2+6 && Math.abs(y-q.y)<BH*s/2+6)return {col:selected,row:r,x:q.x,y:q.y};}
    return null;
  }
  function render(time) {
    const dt=Math.min(2,(time-lastTime)/16.67||1);lastTime=time;
    if(ready && !document.hidden) {
      reveal=curtainOpen?(reduced?1:Math.min(1,Math.pow(Math.max(0,(time-revealStarted)/1900),1.3))):0;
      const ease=reduced?1:1-Math.pow(.88,dt);zoom+=(zoomTarget-zoom)*ease;
      if(Math.abs(zoom-zoomTarget)<.002)zoom=zoomTarget;
      const focus=Math.max(0,Math.min(1,(Math.log(zoom)-Math.log(5))/(Math.log(35)-Math.log(5))));
      const a=columns[selected][Math.floor(selectedRow)],b=columns[selected][Math.ceil(selectedRow)],fraction=selectedRow%1;
      const focalPoint={x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction};
      const overviewY=-110+174*reveal;
      const targetX=focalPoint.x*focus, targetY=overviewY*(1-focus)+focalPoint.y*focus;
      camX+=(targetX-camX)*ease;camY+=(targetY-camY)*ease;
      if(pointer.active){const p=world(pointer.x,pointer.y);pointer.wx=p.x;pointer.wy=p.y;}
      if(!reduced && reveal>.95)spring(dt,time);
      bg.clearRect(0,0,width,height);fg.clearRect(0,0,width,height);
      drawShadow();
      const roofCorner=screen(-240,-266),roofScale=base*zoom;
      Object.assign($('roof-toggle').style,{left:roofCorner.x+'px',top:roofCorner.y+'px',width:480*roofScale+'px',height:305*roofScale+'px'});
      $('roof-toggle').hidden=focus>.05;
      $('back-to-curtain').hidden=zoomTarget<1.2 && zoom<1.2;$('hint').hidden=!curtainOpen;
      back.style.filter=`blur(${(focus*6).toFixed(2)}px)`;
      $('vignette').style.opacity=(focus*.7).toFixed(3);
      for(let c=0;c<columns.length;c++) {if(c===selected && focus>.05)drawStrand(fg,c,.9+.1*focus);else drawStrand(bg,c,.8-focus*.60);}
      drawRoof(fg,1-focus);
      $('intro').style.opacity=String(1-focus);
      $('intro').setAttribute('aria-hidden',String(focus>.8));
      $('period').hidden=focus<.8;
      $('hint').textContent=!curtainOpen?'点击屋顶，让照片倾泻而下':focus>.8?'上下滚动浏览 · 点击照片放大':'轻轻划过，拨开一帘风景';
      $('instructions').textContent=!curtainOpen?'点击屋顶展开旅程':focus>.8?'滚轮浏览 · 点击照片 · Esc 返回珠帘':'移动鼠标拨开 · 滚轮放大 · 双击聚焦';
      $('zoom-in').disabled=!curtainOpen || reveal<1;$('zoom-out').disabled=!curtainOpen;
      document.querySelector('.zoom-controls').hidden=!curtainOpen;
      document.body.dataset.curtain=curtainOpen?'open':'closed';document.body.dataset.reveal=reveal.toFixed(3);
      $('zoom-label').textContent=zoom<1.1?'远景':`${zoom.toFixed(0)}×`;
      document.body.dataset.zoom=zoom.toFixed(2);document.body.dataset.focus=focus.toFixed(2);
      if(pointer.active && !dragging) {
        hover=hitPhoto(pointer.x,pointer.y);stage.style.cursor=hover?'pointer':zoom>20?'grab':'default';
      }
      if(zoom>=22 && !dragging && curtainOpen && groups[selected].photos.length) {
        const retained=actionPhoto?.col===selected && Math.abs(selectedRow-actionPhoto.anchorRow)<.1;
        const row=hover?.row??(retained?actionPhoto.row:Math.round(selectedRow));
        const pos=screen(columns[selected][row].x,columns[selected][row].y);
        actionPhoto={col:selected,row,anchorRow:!hover && retained?actionPhoto.anchorRow:selectedRow};$('photo-action').hidden=false;
        $('photo-action').style.left=Math.max(8,Math.min(width-150,pos.x+BW*base*zoom/2+12))+'px';
        $('photo-action').style.top=Math.max(8,Math.min(height-50,pos.y-15))+'px';
      }else{$('photo-action').hidden=true;actionPhoto=null;}
      drawFrame++;
    }
    requestAnimationFrame(render);
  }
  function pointerMove(e) {
    if(e.target!==stage && !dragging){pointer.active=false;return;}
    const rect=stage.getBoundingClientRect(), x=e.clientX-rect.left,y=e.clientY-rect.top;
    if(dragging && zoom>18 && pointers.size<2) {if(Math.abs(y-pointer.y)>2)dragged=true;selectedRow=Math.max(0,Math.min(columns[selected].length-1,selectedRow-(y-pointer.y)/(base*zoom*DY)));}
    if(dragging && Math.hypot(x-pointer.x,y-pointer.y)>3)dragged=true;
    pointer.x=x;pointer.y=y;pointer.active=true;
    if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x,y});
    if(pointers.size===2) {const [a,b]=[...pointers.values()],dist=Math.hypot(a.x-b.x,a.y-b.y);if(pinch)setZoom(pinch.zoom*dist/pinch.dist);else pinch={dist,zoom:zoomTarget};}
  }
  stage.addEventListener('pointermove',pointerMove);
  stage.addEventListener('pointerdown',e=>{if(e.target!==stage || !curtainOpen || reveal<1)return;stage.focus({preventScroll:true});dragged=false;dragging=true;pointerMove(e);pointers.set(e.pointerId,{x:pointer.x,y:pointer.y});stage.setPointerCapture(e.pointerId);});
  stage.addEventListener('pointerup',e=>{if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);pinch=null;dragging=false;if(!dragged && zoom>22){const hit=hitPhoto(pointer.x,pointer.y);if(hit)openPhoto(hit.col,hit.row);else{const p=world(pointer.x,pointer.y);selected=nearestColumn(p.x,p.y);updatePeriod();}}});
  stage.addEventListener('pointercancel',()=>{dragging=false;pointer.active=false;pointers.clear();pinch=null;});
  stage.addEventListener('pointerleave',()=>{if(!dragging)pointer.active=false;hover=null;});
  stage.addEventListener('dblclick',e=>{if(e.target!==stage)return;if(zoom<22){const rect=stage.getBoundingClientRect();chooseAt(e.clientX-rect.left,e.clientY-rect.top);focusColumn();}});
  stage.addEventListener('wheel',e=>{
    if(e.target!==stage || !curtainOpen || reveal<1)return;e.preventDefault();
    const rect=stage.getBoundingClientRect();
    if(zoom<10 && zoomTarget<10)chooseAt(e.clientX-rect.left,e.clientY-rect.top);
    if(zoomTarget>35 && !e.ctrlKey)selectedRow=Math.max(0,Math.min(columns[selected].length-1,selectedRow+e.deltaY/(base*zoom*DY)));
    else setZoom(zoomTarget*Math.exp(-e.deltaY*.003));
  },{passive:false});
  stage.addEventListener('keydown',e=>{
    if(e.target!==stage)return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Escape','Enter'].includes(e.key))e.preventDefault();
    if(e.key==='Escape')reset();
    if(e.key==='+'||e.key==='=')setZoom(zoomTarget*2.2);
    if(e.key==='-')setZoom(zoomTarget/2.2);
    if(e.key==='ArrowLeft')changeColumn(-1);if(e.key==='ArrowRight')changeColumn(1);
    if(e.key==='ArrowDown')selectedRow=Math.min(columns[selected].length-1,selectedRow+1);if(e.key==='ArrowUp')selectedRow=Math.max(0,selectedRow-1);
    if(e.key==='Enter'){if(zoom<22)focusColumn();else openPhoto(selected,Math.round(selectedRow));}
  });
  function changeColumn(step) {selected=Math.max(0,Math.min(columns.length-1,selected+step));updatePeriod();}
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && !document.querySelector('dialog[open]')){e.preventDefault();reset();}});
  $('roof-toggle').onclick=toggleRoof;$('back-to-curtain').onclick=reset;
  $('previous-column').onclick=()=>changeColumn(-1);$('next-column').onclick=()=>changeColumn(1);
  $('home').onclick=reset;$('reset').onclick=reset;
  $('zoom-in').onclick=()=>{const stops=[3,9,22,56,72];setZoom(stops.find(x=>x>zoomTarget+.5)||72);};
  $('zoom-out').onclick=()=>setZoom(zoomTarget/2.6);
  document.querySelectorAll('.city').forEach(b=>b.onclick=()=>swapCity(Number(b.dataset.city)));
  $('photo-action').onclick=()=>{if(actionPhoto)openPhoto(actionPhoto.col,actionPhoto.row);};
  function drawFullPhoto(photo,canvas) {
    const ctx=canvas.getContext('2d');
    if(photo.sample!=null) {const sw=sheet.naturalWidth/4,hh=sheet.naturalHeight/3;canvas.width=sw;canvas.height=hh;ctx.drawImage(sheet,(photo.sample%4)*sw,Math.floor(photo.sample/4)*hh,sw,hh,0,0,sw,hh);}
    else {canvas.width=photo.image.naturalWidth;canvas.height=photo.image.naturalHeight;ctx.drawImage(photo.image,0,0);}
  }
  function queueFor(col,row){
    const photo=photoAt(col,row);if(!photo)return false;
    const candidates=stored[city]?groups:[groups[col]];
    photoQueue=[...new Map(candidates.flatMap(g=>g.photos.map(p=>[photoKey(p),{photo:p,group:g.name}]))).values()];
    photoIndex=Math.max(0,photoQueue.findIndex(p=>photoKey(p.photo)===photoKey(photo)));return true;
  }
  function openPhoto(col,row){if(!queueFor(col,row))return toast('暂无照片，请切换筛选');showQueuedPhoto();$('photo-dialog').showModal();}
  function showQueuedPhoto(direction=0){
    const item=photoQueue[photoIndex];if(!item)return;currentPhoto=item.photo;
    document.querySelectorAll('.saved-photo-link').forEach(link=>link.remove());
    const canvas=document.createElement('canvas');drawFullPhoto(currentPhoto,canvas);$('large-photo').replaceChildren(canvas);
    if(direction && !reduced)gsap.fromTo('.story-image',{opacity:.35,x:direction*24},{opacity:1,x:0,duration:.35,overwrite:true});
    $('photo-caption').textContent=`${cities[city].name} · ${item.group}`;
    $('photo-title').textContent=currentPhoto.name.replace(/\.[^.]+$/,'');
    $('photo-position').textContent=`${photoIndex+1} / ${photoQueue.length}`;
    $('photo-return').textContent=$('gallery-dialog').open?'← 返回相册':'← 返回珠帘';
    $('taken-date').textContent=currentPhoto.takenAt || (currentPhoto.sample!=null?'AI 示例 · 无真实拍摄日期':'拍摄日期未知');
    $('date-source').textContent=currentPhoto.dateSource || '';
    const record=recordFor(currentPhoto);$('photo-mood').value=record.mood || '';$('photo-address').value=record.address || '';
    $('photo-category').value=categoryFor(currentPhoto);$('mood-status').textContent=record.savedAt?'已保存':'';
    $('carousel-prev').disabled=photoIndex===0;$('carousel-next').disabled=photoIndex===photoQueue.length-1;
  }
  function saveCurrent(){if(!currentPhoto)return true;const mood=$('photo-mood').value,address=$('photo-address').value.trim(),category=$('photo-category').value,old=recordFor(currentPhoto);if(mood===(old.mood||'')&&address===(old.address||'')&&category===categoryFor(currentPhoto))return true;return saveRecord(currentPhoto,{mood,address,category,categorySource:category!==categoryFor(currentPhoto)?'手动标记':old.categorySource,savedAt:new Date().toISOString()});}
  function slidePhoto(step){if(!saveCurrent())return;const next=Math.max(0,Math.min(photoQueue.length-1,photoIndex+step));if(next===photoIndex)return;photoIndex=next;showQueuedPhoto(Math.sign(step));}
  $('carousel-prev').onclick=()=>slidePhoto(-1);$('carousel-next').onclick=()=>slidePhoto(1);
  $('save-mood').onclick=()=>{if(saveCurrent())$('mood-status').textContent='已保存';};
  $('photo-dialog').addEventListener('close',()=>{saveCurrent();currentPhoto=null;refreshFilters(true);});
  $('photo-dialog').addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();slidePhoto(e.key==='ArrowLeft'?-1:1);}});
  function openOriginal(){if(!currentPhoto)return;const canvas=document.createElement('canvas');drawFullPhoto(currentPhoto,canvas);$('zoom-photo').replaceChildren(canvas);$('zoom-dialog').showModal();}
  $('large-photo').onclick=openOriginal;$('open-original').onclick=openOriginal;
  $('zoom-return').onclick=()=>$('zoom-dialog').close();$('zoom-close').onclick=()=>$('zoom-dialog').close();
  async function downloadPhoto(){
    if(!currentPhoto)return;const photo=currentPhoto,canvas=document.createElement('canvas');drawFullPhoto(photo,canvas);
    if(window.TRAVEL_PUBLIC){
      const parent=$('zoom-dialog').open?$('zoom-dialog'):$('photo-dialog');
      parent.querySelectorAll('.saved-photo-link').forEach(link=>link.remove());
      const link=document.createElement('a');link.className='saved-photo-link';link.href=canvas.toDataURL('image/png');link.download=photo.name.replace(/\.[^.]+$/,'')+'.png';link.textContent='下载图片（未弹出时点这里）';parent.append(link);link.click();$('mood-status').textContent='已发起下载';return;
    }
    const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));if(!blob)return toast('图片保存失败');
    const parent=$('zoom-dialog').open?$('zoom-dialog'):$('photo-dialog');
    try{
      const response=await fetch('/api/save-photo?name='+encodeURIComponent(photo.name.replace(/\.[^.]+$/,'')),{method:'POST',headers:{'Content-Type':'image/png'},body:blob});
      if(!response.ok)throw new Error('本地保存接口不可用');const saved=await response.json();if(currentPhoto!==photo)return;
      let link=parent.querySelector('.saved-photo-link');if(!link){link=document.createElement('a');link.className='saved-photo-link';parent.append(link);}
      link.href=saved.url;link.target='_blank';link.textContent='图片已保存到本机 · 打开图片';$('mood-status').textContent='图片已保存';
    }catch{
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=photo.name.replace(/\.[^.]+$/,'')+'.png';parent.append(link);link.click();link.textContent='打开图片 / 另存为';link.target='_blank';link.className='saved-photo-link';
    }
  }
  $('save-photo').onclick=downloadPhoto;$('zoom-save').onclick=downloadPhoto;
  let ringCards=[],ringState={turn:0},ringDrag=null,ringSlotCount=0;
  function paintRing(){
    const scene=$('ring-scene'),radius=Math.max(155,Math.min(340,scene.clientWidth*.31)),step=360/ringSlotCount;
    for(let i=0;i<ringCards.length;i++){const angle=(i+ringState.turn)*step,rad=angle*Math.PI/180,frontness=Math.cos(rad),card=ringCards[i];gsap.set(card,{x:Math.sin(rad)*radius,y:0,z:(frontness-1)*radius,rotationY:angle,opacity:.26+.74*Math.pow((frontness+1)/2,.65)});card.style.pointerEvents='auto';card.inert=false;}
    const slot=((Math.round(-ringState.turn)%ringSlotCount)+ringSlotCount)%ringSlotCount,index=Number(ringCards[slot].dataset.index);
    $('ring-position').textContent=`${index+1} / ${photoQueue.length} · ${photoQueue[index].photo.name}`;
  }
  function rotateRing(step){gsap.to(ringState,{turn:Math.round(ringState.turn)-step,duration:reduced?0:.75,ease:'power3.out',overwrite:true,onUpdate:paintRing});}
  function openRing(){
    const col=groups[selected]?.photos.length?selected:groups.findIndex(g=>g.photos.length);if(col<0||!queueFor(col,Math.round(selectedRow)))return toast('暂无照片，请切换筛选');
    ringSlotCount=photoQueue.length<8?Math.ceil(8/photoQueue.length)*photoQueue.length:Math.min(10,photoQueue.length);
    // For long albums, reuse visual slots and refresh the window as the ring turns.
    ringCards=[];for(let i=0;i<ringSlotCount;i++){const button=document.createElement('button'),canvas=document.createElement('canvas');const index=i%photoQueue.length;drawFullPhoto(photoQueue[index].photo,canvas);button.className='ring-card';button.append(canvas);button.setAttribute('aria-label',`打开照片：${photoQueue[index].photo.name}`);button.onclick=()=>{if(ringDrag?.moved)return;photoIndex=Number(button.dataset.index);showQueuedPhoto();$('photo-dialog').showModal();};button.dataset.index=index;ringCards.push(button);}
    $('photo-ring').replaceChildren(...ringCards);ringState.turn=-photoIndex;$('gallery-dialog').showModal();paintRing();
  }
  // Virtual window keeps all imported images reachable with at most 10 display slots.
  function refreshRingWindow(){if(photoQueue.length<=ringSlotCount)return;const center=Math.round(-ringState.turn),half=Math.floor(ringSlotCount/2);for(let offset=-half;offset<ringSlotCount-half;offset++){const absolute=center+offset,slot=((absolute%ringSlotCount)+ringSlotCount)%ringSlotCount,index=((absolute%photoQueue.length)+photoQueue.length)%photoQueue.length,button=ringCards[slot];if(Number(button.dataset.index)!==index){const canvas=document.createElement('canvas');drawFullPhoto(photoQueue[index].photo,canvas);button.replaceChildren(canvas);button.dataset.index=index;button.setAttribute('aria-label',`打开照片：${photoQueue[index].photo.name}`);}}}
  const basicPaint=paintRing;paintRing=()=>{refreshRingWindow();basicPaint();};
  $('browse-album').onclick=openRing;$('ring-prev').onclick=()=>rotateRing(-1);$('ring-next').onclick=()=>rotateRing(1);
  $('gallery-close').onclick=()=>$('gallery-dialog').close();$('gallery-return').onclick=()=>$('gallery-dialog').close();
  $('gallery-dialog').addEventListener('close',()=>gsap.killTweensOf(ringState));
  $('gallery-dialog').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();rotateRing(e.key==='ArrowLeft'?-1:1);}});
  $('ring-scene').addEventListener('pointerdown',e=>{gsap.killTweensOf(ringState);ringDrag={x:e.clientX,turn:ringState.turn,moved:false};});
  $('ring-scene').addEventListener('pointermove',e=>{if(!ringDrag)return;const dx=e.clientX-ringDrag.x;if(Math.abs(dx)>6){ringDrag.moved=true;ringState.turn=ringDrag.turn+dx/150;paintRing();}});
  document.addEventListener('pointerup',()=>{if(!ringDrag)return;const moved=ringDrag.moved;gsap.to(ringState,{turn:Math.round(ringState.turn),duration:reduced?0:.6,ease:'power3.out',overwrite:true,onUpdate:paintRing});setTimeout(()=>ringDrag=null,moved?50:0);});
  $('ring-scene').addEventListener('pointercancel',()=>ringDrag=null);
  window.addEventListener('resize',()=>{if($('gallery-dialog').open)paintRing();});
  $('category-filter').onchange=e=>{categoryFilter=e.target.value;refreshFilters();};
  $('density').oninput=e=>{COLS=Number(e.target.value);DX=408/COLS;BW=Math.min(7.3,DX*.5);$('density-value').textContent=COLS<32?'疏一些':COLS===36?'最密':'适中';refreshFilters();};

  async function classifyPhotos(input){
    if(busy)return toast('照片正在导入，请稍候');
    const run=++classificationRun,targetCity=city,photos=[...new Map((Array.isArray(input)?input:sourceGroups().flatMap(g=>g.photos)).map(p=>[photoKey(p),p])).values()];
    const todo=photos.filter(p=>p.sample==null && !recordFor(p).category);if(!todo.length)return toast('示例已标为风景；新照片导入后可自动分类。已有分类可在大图里修正。');
    busy=true;$('classify-photos').disabled=true;
    try{for(let i=0;i<todo.length;i++){if(run!==classificationRun)break;$('classify-photos').textContent=`分类 ${i+1}/${todo.length}`;if(i===0)toast('首次需下载本站完整分类模型，照片在浏览器内识别');const result=await TravelFeatures.classify(todo[i]);if(!saveRecord(todo[i],{...result,categorySource:'CLIP 自动建议'}))throw new Error('分类结果无法保存');}if(city===targetCity)refreshFilters();toast('分类完成，低置信度照片留在“待确认”，可手动修正');}
    catch(error){toast('自动分类未完成：'+error.message+'；已完成结果保留，可手动分类');}
    finally{busy=false;$('classify-photos').disabled=false;$('classify-photos').textContent='自动分类';}
  };
  $('classify-photos').onclick=()=>classifyPhotos();
  $('gesture-toggle').onclick=()=>TravelFeatures.toggle();$('gesture-close').onclick=()=>TravelFeatures.stop();
  window.addEventListener('curtain:error',e=>toast(e.detail));
  window.addEventListener('curtain:gesture',e=>{
    const {action,value}=e.detail;if(action==='stop'){pointer.active=false;return;}
    if($('destinations-dialog').open || $('appearance-dialog').open || $('building-dialog').open || $('import-dialog').open || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName))return;
    if($('zoom-dialog').open)return;
    if($('photo-dialog').open){if(action==='left')slidePhoto(1);if(action==='right')slidePhoto(-1);return;}
    if($('gallery-dialog').open){if(action==='left')rotateRing(1);if(action==='right')rotateRing(-1);return;}
    if(!curtainOpen && action!=='point')toggleRoof();
    if(action==='scale')setZoom(zoomTarget*Math.pow(value,3.2));
    if(action==='left'||action==='right'){if(zoomTarget>18)changeColumn(action==='left'?-1:1);else{pointer.active=true;pointer.x=width*(action==='left'?.35:.65);pointer.y=height*.6;}}
    if(action==='point' && reveal===1){pointer.active=true;pointer.x=width*value.x;pointer.y=height*value.y;}
  });
  $('photo-close').onclick=()=>$('photo-dialog').close();
  $('photo-return').onclick=()=>$('photo-dialog').close();
  $('import-open').onclick=()=>$('import-dialog').showModal();$('import-close').onclick=()=>$('import-dialog').close();
  for(const dialog of [$('photo-dialog'),$('import-dialog'),$('gallery-dialog'),$('zoom-dialog'),$('building-dialog'),$('destinations-dialog'),$('appearance-dialog')]) dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  $('choose-folder').onclick=()=>$('folder-input').click();$('choose-files').onclick=()=>$('files-input').click();
  function makeThumb(image) {const canvas=document.createElement('canvas');canvas.width=180;canvas.height=132;const ctx=canvas.getContext('2d');const s=Math.max(180/image.naturalWidth,132/image.naturalHeight);ctx.drawImage(image,(180-image.naturalWidth*s)/2,(132-image.naturalHeight*s)/2,image.naturalWidth*s,image.naturalHeight*s);return canvas;}
  async function openDB() {
    return new Promise((resolve,reject)=>{const request=indexedDB.open('travel-curtain-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('cities');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  }
  function storageKey(key){return key===0?0:key===1?1:key===2?'taiyuan':'region-'+cities[key].id;}
  async function saveCity(key,value) {if(!db)throw new Error('当前浏览器不支持保存照片');return new Promise((resolve,reject)=>{const tx=db.transaction('cities','readwrite');if(value)tx.objectStore('cities').put(value,storageKey(key));else tx.objectStore('cities').delete(storageKey(key));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('保存失败'));});}
  async function restoreCity(key) {if(!db)return null;return new Promise((resolve,reject)=>{const tx=db.transaction('cities');const req=tx.objectStore('cities').get(storageKey(key));req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function hydrate(raw) {
    const hydrated=[];
    for(const group of raw) {const photos=[];for(const item of group.photos){const image=new Image();const url=URL.createObjectURL(item.blob);image.src=url;await loadImage(image);photos.push({...item,image,thumb:makeThumb(image),url});}hydrated.push({name:group.name,photos});}
    return hydrated;
  }
  async function importFiles(files) {
    if(busy)return;
    const list=[...files].filter(f=>/^image\/(jpeg|png|webp|gif|avif|bmp)/.test(f.type));
    if(!list.length)return toast('请选择 JPG、PNG、WebP 等照片文件');
    busy=true;const importCity=city,batches=new Map();let skipped=0;const imported=[];
    $('import-dialog').close();toast(`正在整理 ${list.length} 张照片…`);
    try {
      const ordered=list.sort((a,b)=>(a.webkitRelativePath||a.name).localeCompare(b.webkitRelativePath||b.name,'zh-CN',{numeric:true}));
      for(const file of ordered) {
        try {const img=new Image();const url=URL.createObjectURL(file);img.src=url;await loadImage(img);
          // Store a bounded display-resolution image; preserve aspect ratio and avoid storing multi-megabyte originals.
          const max=1800,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),cv=document.createElement('canvas');cv.width=Math.round(img.naturalWidth*scale);cv.height=Math.round(img.naturalHeight*scale);cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',.88));URL.revokeObjectURL(url);if(!blob)throw new Error('转换失败');
          const dateInfo=await TravelFeatures.readDate(file);
          const path=file.webkitRelativePath?.split('/')||[];let label;
          if(path.length>2)label=path.slice(1,-1).join(' / ');
          else {const month=(dateInfo.takenAt || file.name).match(/(20\d{2})[-_]?([01]\d)/);if(month && +month[2]>0 && +month[2]<=12)label=`${month[1]}年${+month[2]}月`;else if(path.length>1)label=path[0];else label='新旅程';}
          const bytes=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
          const sourceKey=[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
          const inferred=$('auto-region').checked?TravelPlaces.infer(file.webkitRelativePath||file.name):null,target=inferred??importCity;
          if(!batches.has(target))batches.set(target,new Map());const grouped=batches.get(target);
          if(!grouped.has(label))grouped.set(label,[]);grouped.get(label).push({name:file.name,blob,sourceKey,...dateInfo,regionSource:inferred===null?'导入时选择地区':'目录或文件名中的地区名称',category:'unknown'});
        }catch{skipped++;}
      }
      if(!batches.size)throw new Error('这些图片无法打开');
      const prepared=new Map();let added=0;
      for(const [target,grouped] of batches){
        const incoming=[...grouped].map(([name,photos])=>({name,photos})),raw=await restoreCity(target)||[];
        const known=new Set(raw.flatMap(g=>g.photos.map(p=>p.sourceKey).filter(Boolean)));
        for(const group of incoming){const unique=group.photos.filter(photo=>{if(known.has(photo.sourceKey))return false;known.add(photo.sourceKey);return true;});if(!unique.length)continue;let dest=raw.find(g=>g.name===group.name);if(!dest){dest={name:group.name,photos:[]};raw.push(dest);}dest.photos.push(...unique);added+=unique.length;}
        for(const group of raw)group.photos.sort((a,b)=>(a.takenAt||'9999').localeCompare(b.takenAt||'9999')||a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
        raw.sort((a,b)=>(a.photos.find(p=>p.takenAt)?.takenAt||'9999').localeCompare(b.photos.find(p=>p.takenAt)?.takenAt||'9999'));
        const hydrated=await hydrate(raw);prepared.set(target,{raw,hydrated});
      }
      try{await new Promise((resolve,reject)=>{if(!db)return reject(new Error('当前浏览器不支持保存'));const tx=db.transaction('cities','readwrite');for(const [target,{raw}] of prepared)tx.objectStore('cities').put(raw,storageKey(target));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('保存失败'));});}
      catch(error){for(const {hydrated} of prepared.values())for(const g of hydrated)for(const p of g.photos)URL.revokeObjectURL(p.url);throw error;}
      for(const [target,{hydrated}] of prepared){releaseStored(target);stored[target]=hydrated;window.dispatchEvent(new CustomEvent('curtain:album-updated',{detail:{index:target,imported:true}}));imported.push(...hydrated.flatMap(g=>g.photos));}
      refreshFilters();
      toast(`新增 ${added} 张照片，保存到 ${prepared.size} 个地区${added<list.length-skipped?'（重复照片已跳过）':''}${skipped?'；'+skipped+' 张无法读取':''}。可在顶部切换查看。`);
    }catch(error){toast(`导入未完成：${error.message}。原相册仍保留。`);}
    finally{busy=false;$('folder-input').value='';$('files-input').value='';if(imported.length && $('auto-classify').checked)await classifyPhotos(imported);}
  }
  function releaseStored(key) {if(stored[key])for(const g of stored[key])for(const p of g.photos)if(p.url)URL.revokeObjectURL(p.url);}
  $('folder-input').onchange=e=>importFiles(e.target.files);$('files-input').onchange=e=>importFiles(e.target.files);
  $('restore-demo').onclick=async()=>{if(busy)return;try{await saveCity(city,null);releaseStored(city);delete stored[city];refreshFilters();$('import-dialog').close();toast('已恢复示例风景');}catch(error){toast('恢复失败：'+error.message);}};
  async function init() {
    try {
      await Promise.all([loadImage(roof),loadImage(sheet)]);
      const sw=sheet.naturalWidth/4,hh=sheet.naturalHeight/3;
      for(let i=0;i<12;i++){const cv=document.createElement('canvas');cv.width=180;cv.height=132;cv.getContext('2d').drawImage(sheet,(i%4)*sw,Math.floor(i/4)*hh,sw,hh,0,0,180,132);demoPhotos.push({sample:i,name:sampleTitles[Math.floor(i/4)][i%4],category:'landscape',thumb:cv});}
      try {db=await openDB();for(let key=0;key<cities.length;key++){const raw=await restoreCity(key);if(raw?.length)stored[key]=await hydrate(raw);}}catch(error){toast('浏览器保存暂不可用；示例风景仍可浏览');}
      refreshFilters();resize();ready=true;$('loading').hidden=true;document.body.dataset.ready='true';window.dispatchEvent(new CustomEvent('curtain:ready'));
      requestAnimationFrame(render);
    }catch(error){$('loading').textContent='素材加载失败，请刷新重试';console.error(error);}
  }
  new ResizeObserver(resize).observe(stage);
  window.addEventListener('curtain:region',e=>{if(busy||!ready){e.preventDefault();toast('正在处理照片或加载素材，请稍候切换地区');return;}swapCity(e.detail.index).catch(error=>toast('切换未完成：'+error.message));});
  window.TravelAlbum={importFiles,getPlace:()=>cities[city],isBusy:()=>busy,notify:toast,roofSheet:()=>roof,async selectPlace(index){if(busy||!ready)return false;return await swapCity(index);},overview(index){const demo=!stored[index],raw=stored[index]||[{photos:demoPhotos.slice(cities[index].demoIndex*4,cities[index].demoIndex*4+4)}],all=[...new Map(raw.flatMap(g=>g.photos).map(p=>[photoKey(p),p])).values()];return {demo,count:all.length,photos:all.filter(p=>categoryFilter==='all'||categoryFor(p)===categoryFilter)};}};
  init();
})();



