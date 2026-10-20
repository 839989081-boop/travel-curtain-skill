'use strict';
// Pinned local dependencies. Images and camera frames stay on this computer.
window.TravelFeatures = (() => {
  let visionPromise=null, classifierPromise=null, detector=null, stream=null, session=0, animation=0, lastVideo=-1;
  let baseline=null, trail=[], lastSwipe=0, lastFrame=0;
  const $=id=>document.getElementById(id);
  const labels=['a scenic landscape or architecture photograph without people','a portrait photograph focused on a person or people','a travel photograph showing people together with scenery'];
  const categories=['landscape','portrait','mixed'];
  async function classify(photo,onProgress) {
    if(!classifierPromise) classifierPromise=(async()=>{
      if(!('serviceWorker' in navigator))throw new Error('当前浏览器不支持完整分类模型，请使用新版 Chrome 或 Edge');
      await navigator.serviceWorker.register('./model-worker.js');
      await navigator.serviceWorker.ready;
      if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
      const {pipeline,env}=await import('./vendor/transformers.js');
      env.allowRemoteModels=false;env.localModelPath='./models/';
      env.backends.onnx.wasm.wasmPaths='./vendor/onnx/';env.backends.onnx.wasm.numThreads=1;
      return pipeline('zero-shot-image-classification','Xenova/clip-vit-base-patch32',{quantized:true,progress_callback:onProgress});
    })().catch(e=>{classifierPromise=null;throw e;});
    const classifier=await classifierPromise;
    const image=photo.url || photo.thumb.toDataURL('image/png');
    const scores=await classifier(image,labels);
    const top=scores[0],second=scores[1];
    return {category:top.score<.52 || top.score-second.score<.13?'unknown':categories[labels.indexOf(top.label)],confidence:top.score};
  }
  async function readDate(file) {
    try {
      const meta=await exifr.parse(file,{pick:['DateTimeOriginal','CreateDate','OffsetTimeOriginal']});
      const d=meta?.DateTimeOriginal || meta?.CreateDate;
      if(d instanceof Date && !isNaN(d))return {takenAt:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,dateSource:meta.DateTimeOriginal?'EXIF 拍摄日期':'EXIF 创建日期'};
    }catch{}
    const match=file.name.match(/(?:^|\D)(20\d{2})[-_]?(0[1-9]|1[0-2])[-_]?(0[1-9]|[12]\d|3[01])(?:\D|$)/);
    if(match){const value=`${match[1]}-${match[2]}-${match[3]}`,d=new Date(value+'T12:00:00');if(!isNaN(d) && d.getDate()===+match[3])return {takenAt:value,dateSource:'由文件名推测，待确认'};}
    return {takenAt:null,dateSource:'未找到拍摄日期'};
  }
  function emit(action,value){window.dispatchEvent(new CustomEvent('curtain:gesture',{detail:{action,value}}));}
  function interpret(hands,time) {
    if(hands.length>=2) {
      trail=[];const a=hands[0][9],b=hands[1][9],distance=Math.hypot(a.x-b.x,a.y-b.y);
      if(!baseline)baseline={distance};
      else if(distance>.04){const ratio=distance/baseline.distance;if(Math.abs(Math.log(ratio))>.025){emit('scale',Math.max(.8,Math.min(1.25,ratio)));baseline.distance=distance;$('gesture-status').textContent=ratio>1?'双手展开 · 放大':'双手合拢 · 缩小';}}
      return;
    }
    baseline=null;
    if(!hands.length){trail=[];$('gesture-status').textContent='把手放入画面 · 双手缩放 / 单手左右拨动';return;}
    const h=hands[0],cx=1-h[9].x,cy=h[9].y;
    // Swipes require an open hand. Mirrored coordinates follow the preview.
    const open=[8,12,16,20].filter(i=>Math.hypot(h[i].x-h[0].x,h[i].y-h[0].y)>Math.hypot(h[i-2].x-h[0].x,h[i-2].y-h[0].y)*1.15).length>=3;
    if(!open){trail=[];return;}
    emit('point',{x:cx,y:cy});trail.push({x:cx,y:cy,t:time});trail=trail.filter(p=>time-p.t<550);
    const first=trail[0],dx=cx-first.x;
    if(time-lastSwipe>900 && time-first.t>100 && Math.abs(dx)>.17 && Math.abs(cy-first.y)<.16){emit(dx>0?'right':'left');$('gesture-status').textContent=dx>0?'向右拨动':'向左拨动';lastSwipe=time;trail=[];}
  }
  function stop() {
    session++;cancelAnimationFrame(animation);stream?.getTracks().forEach(t=>t.stop());stream=null;
    detector?.close();detector=null;baseline=null;trail=[];lastVideo=-1;
    $('gesture-panel').hidden=true;$('gesture-toggle').disabled=false;$('gesture-toggle').textContent='手势互动';$('gesture-toggle').setAttribute('aria-pressed','false');
    emit('stop');
  }
  function loadVision() {
    if(window.TravelVision)return Promise.resolve(window.TravelVision);
    if(!visionPromise)visionPromise=new Promise((resolve,reject)=>{
      let attempt=0;
      function load(){
        attempt++;const script=document.createElement('script');
        script.src=new URL('./vendor/vision-global.js?v=gesture2&try='+attempt,document.baseURI).href;
        let settled=false;
        const timer=setTimeout(failed,18000);
        function failed(){if(settled)return;settled=true;clearTimeout(timer);script.remove();if(attempt<2){$('gesture-status').textContent='识别程序加载较慢，正在重试…';load();}else reject(new Error('手势识别程序下载失败，请刷新页面后重试'));}
        script.onerror=failed;
        script.onload=()=>{if(settled)return;settled=true;clearTimeout(timer);if(window.TravelVision?.HandLandmarker && window.TravelVision?.FilesetResolver)resolve(window.TravelVision);else{script.remove();reject(new Error('手势识别程序没有正确初始化'));}};
        document.head.append(script);
      }
      load();
    }).catch(error=>{visionPromise=null;throw error;});
    return visionPromise;
  }
  async function start() {
    const token=++session;let phase='识别程序加载';
    $('gesture-panel').hidden=false;$('gesture-status').textContent='正在加载本机手部识别…';$('gesture-toggle').disabled=true;
    try {
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('当前浏览器不支持摄像头，请使用本机或 HTTPS 页面');
      const {FilesetResolver,HandLandmarker}=await loadVision();
      if(token!==session)return;phase='识别引擎加载';$('gesture-status').textContent='正在加载手部识别引擎…';
      const files=await FilesetResolver.forVisionTasks('./vendor/mediapipe');
      if(token!==session)return;phase='手势模型加载';$('gesture-status').textContent='正在加载手势模型，首次需要稍等…';
      const created=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'./models/hand_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.65,minTrackingConfidence:.65});
      if(token!==session){created.close();return;}
      detector=created;$('gesture-status').textContent='手部识别已就绪，请允许摄像头访问';
      phase='摄像头授权';const media=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:'user'},audio:false});
      if(token!==session){media.getTracks().forEach(t=>t.stop());return;}
      stream=media;$('gesture-video').srcObject=stream;await $('gesture-video').play();
      if(token!==session)return;
      $('gesture-toggle').textContent='关闭手势';$('gesture-toggle').setAttribute('aria-pressed','true');
      $('gesture-status').textContent='双手展开 / 合拢缩放 · 张开单手左右拨动';
      function frame(time){if(token!==session)return;try{if(!document.hidden && time-lastFrame>65 && $('gesture-video').currentTime!==lastVideo){lastFrame=time;lastVideo=$('gesture-video').currentTime;interpret(detector.detectForVideo($('gesture-video'),time).landmarks,time);}}catch(e){stop();window.dispatchEvent(new CustomEvent('curtain:error',{detail:'手势识别中断：'+e.message}));return;}animation=requestAnimationFrame(frame);}
      animation=requestAnimationFrame(frame);
    } catch(e) {if(token!==session)return;stop();window.dispatchEvent(new CustomEvent('curtain:error',{detail:e.name==='NotAllowedError'?'摄像头未获授权，鼠标操作仍可使用':e.name==='NotFoundError'?'未找到摄像头，鼠标操作仍可使用':'手势暂不可用（'+phase+'）：'+e.message}));}
    finally{if(token===session || !stream)$('gesture-toggle').disabled=false;}
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden){trail=[];baseline=null;emit('stop');}});
  window.addEventListener('pagehide',stop);
  return {classify,readDate,start,stop,toggle:()=>stream?stop():start()};
})();
