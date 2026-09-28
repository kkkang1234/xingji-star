/* Local MediaPipe face landmarks. These are feature heuristics, not a semantic
   judge of natural poses, identity, gaze, hand gestures or real-vs-screen faces. */
(function(){
  'use strict';
  let model=null,poseModel=null,handModel=null,pending=null;
  const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
  async function init(){
    if(model&&poseModel&&handModel)return {ready:true};if(pending)return pending;
    pending=(async()=>{try{
      if(location.protocol==='file:')throw Error('请双击启动星迹.cmd，通过本地网址打开');
      const {FaceLandmarker,PoseLandmarker,HandLandmarker,FilesetResolver}=await import('./assets/mediapipe/vision_bundle.mjs');
      const files=await FilesetResolver.forVisionTasks('./assets/mediapipe/wasm');
      model=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'./assets/mediapipe/face_landmarker.task',delegate:'CPU'},runningMode:'IMAGE',numFaces:8,minFaceDetectionConfidence:.45,minFacePresenceConfidence:.5,outputFaceBlendshapes:true});
      poseModel=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'./assets/mediapipe/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'IMAGE',numPoses:6,minPoseDetectionConfidence:.4,minPosePresenceConfidence:.5});
      handModel=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'./assets/mediapipe/hand_landmarker.task',delegate:'CPU'},runningMode:'IMAGE',numHands:8,minHandDetectionConfidence:.45,minHandPresenceConfidence:.5});
      return {ready:true};
    }catch(e){for(const m of [model,poseModel,handModel]){try{m?.close()}catch{}}model=poseModel=handModel=null;pending=null;return {ready:false,reason:e.message}}})();return pending;
  }
  function crop(canvas,b){const c=document.createElement('canvas');c.width=Math.max(2,Math.round(b.width*canvas.width));c.height=Math.max(2,Math.round(b.height*canvas.height));c.getContext('2d').drawImage(canvas,b.x*canvas.width,b.y*canvas.height,b.width*canvas.width,b.height*canvas.height,0,0,c.width,c.height);return c}
  function roiQuality(canvas,b){
    const c=document.createElement('canvas');c.width=64;c.height=64;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,b.x*canvas.width,b.y*canvas.height,b.width*canvas.width,b.height*canvas.height,0,0,64,64);const d=ctx.getImageData(0,0,64,64).data,g=[];let bright=0,dark=0;
    for(let i=0;i<4096;i++){const v=.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2];g.push(v);bright+=v>247;dark+=v<15}
    let sum=0,sq=0,n=0;for(let y=1;y<63;y++)for(let x=1;x<63;x++){const i=y*64+x,v=4*g[i]-g[i-1]-g[i+1]-g[i-64]-g[i+64];sum+=v;sq+=v*v;n++}
    return {clarity:sq/n-(sum/n)**2,over:bright/4096,dark:dark/4096};
  }
  function overlap(a,b){const x=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)),y=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));return x*y/Math.max(.000001,Math.min(a.width*a.height,b.width*b.height))}
  async function analyze(canvas,time,options={}){
    if(!model||!poseModel||!handModel)return {available:false,reasons:['模型尚未就绪']};
    try{
      const region=options.roi||{x:0,y:0,width:1,height:1};const tiles=[region];
      // Overlapping tiles improve recall for smaller concert faces without changing export.
      if(options.tileScan!==false){const w=region.width*.66,h=Math.min(region.height,region.width*canvas.width/canvas.height*.72);for(const dx of [0,region.width-w])for(const dy of [0,(region.height-h)/2,region.height-h])tiles.push({x:region.x+dx,y:region.y+dy,width:w,height:h})}
      const faces=[];
      for(const tile of tiles){const result=model.detect(crop(canvas,tile));for(let i=0;i<result.faceLandmarks.length;i++){
        const lm=result.faceLandmarks[i],xs=lm.map(p=>p.x),ys=lm.map(p=>p.y),left=clamp(Math.min(...xs)),top=clamp(Math.min(...ys)),right=clamp(Math.max(...xs)),bottom=clamp(Math.max(...ys));
        const bbox={x:tile.x+left*tile.width,y:tile.y+top*tile.height,width:(right-left)*tile.width,height:(bottom-top)*tile.height};
        if(bbox.width*canvas.width<18||bbox.height*canvas.height<22||faces.some(f=>overlap(f.bbox,bbox)>.5))continue;
        const bs=Object.fromEntries((result.faceBlendshapes[i]?.categories||[]).map(c=>[c.categoryName,c.score]));
        const smile=((bs.mouthSmileLeft||0)+(bs.mouthSmileRight||0))/2,blink=((bs.eyeBlinkLeft||0)+(bs.eyeBlinkRight||0))/2;
        const a=lm[234],b=lm[454],nose=lm[1];const facing=clamp(1-Math.abs(nose.x-(a.x+b.x)/2)/Math.max(.001,Math.abs(a.x-b.x)/2));
        const quality=roiQuality(canvas,bbox),clarityScore=clamp(Math.log1p(quality.clarity)/Math.log(1300));
        const clipped=bbox.x<.003||bbox.y<.003||bbox.x+bbox.width>.997||bbox.y+bbox.height>.997;
        const tiny=bbox.width*canvas.width<30||bbox.height*canvas.height<35;
        const score=32+smile*28*(.35+.65*facing)+facing*12+clarityScore*22-(quality.over>.35?18:0)-(quality.dark>.6?15:0)-(clipped?15:0)-(tiny?8:0);
        faces.push({bbox,area:bbox.width*bbox.height,smile,blink,facing,...quality,score,clipped,tiny,uncertain:tiny||clipped});
      }}
      const poseResult=poseModel.detect(crop(canvas,region));
      const poses=poseResult.landmarks.map(points=>{const lm=points.map(p=>({...p,x:region.x+p.x*region.width,y:region.y+p.y*region.height})),nose=lm[0],shoulder=Math.hypot((lm[11].x-lm[12].x)*canvas.width,(lm[11].y-lm[12].y)*canvas.height),torso=Math.hypot((lm[11].x-lm[23].x)*canvas.width,(lm[11].y-lm[23].y)*canvas.height);const face=faces.find(f=>nose.x>=f.bbox.x-f.bbox.width*.35&&nose.x<=f.bbox.x+f.bbox.width*1.35&&nose.y>=f.bbox.y-f.bbox.height*.2&&nose.y<=f.bbox.y+f.bbox.height*1.2);const handNearEyes=face&&[15,16,17,18,19,20,21,22].some(i=>{const p=lm[i],b=face.bbox;return p.visibility>.65&&p.x>b.x+b.width*.2&&p.x<b.x+b.width*.8&&p.y>b.y+b.height*.15&&p.y<b.y+b.height*.6});return{area:shoulder*torso/(canvas.width*canvas.height),headVisible:nose.visibility,missingFace:!face,handNearEyes:!!handNearEyes,points:lm.filter((p,i)=>[0,11,12,15,16,23,24].includes(i)).map(({x,y,visibility})=>({x,y,visibility}))}});
      const largestBody=Math.max(0,...poses.map(p=>p.area)),mainBodies=poses.filter(p=>p.area>=largestBody*.4&&p.area>.008),missingSubject=mainBodies.some(p=>p.headVisible>.6&&p.missingFace),handNearEyes=mainBodies.some(p=>p.handNearEyes);
      if(!faces.length)return {available:true,time,faces:[],poses,score:0,needsReview:true,confidence:'low',reasons:['未检测到足够清楚的脸，保留为备选'],bodyNaturalness:'landmark-assisted'};
      const largest=Math.max(...faces.map(f=>f.area));const main=faces.filter(f=>f.area>=largest*.32);
      const hands=handModel.detect(crop(canvas,region)).landmarks.map(lm=>lm.map(p=>({x:region.x+p.x*region.width,y:region.y+p.y*region.height})));
      const eyeOccluded=main.some(f=>hands.some(hand=>hand.filter(p=>{const b=f.bbox;return p.x>b.x+b.width*.1&&p.x<b.x+b.width*.9&&p.y>b.y+b.height*.1&&p.y<b.y+b.height*.6}).length>=4));
      const screenAmbiguous=!options.roi&&(main.some(f=>f.area>.045)||faces.some(f=>f.bbox.y<.5&&faces.some(o=>o!==f&&o.bbox.y>f.bbox.y+.15&&f.area>o.area*3)));
      const worst=Math.min(...main.map(f=>f.score)),avg=main.reduce((s,f)=>s+f.score,0)/main.length;
      const score=.6*worst+.4*avg-(screenAmbiguous?12:0)-(missingSubject?22:0)-(eyeOccluded?18:handNearEyes?9:0);
      const reasons=[];if(screenAmbiguous)reasons.push('大屏或超近景待确认，可框选舞台区域');if(missingSubject)reasons.push('主要人物面部未能确认，需复核');if(eyeOccluded)reasons.push('检测到手部与眼部区域重叠');else if(handNearEyes)reasons.push('手部靠近眼部，需复核遮挡');
      if(main.some(f=>f.smile>.35))reasons.push('检测到笑容线索');else reasons.push('面部可辨认');
      if(main.length>1)reasons.push(`兼顾 ${main.length} 张主要面部`);
      if(main.some(f=>f.blink>.68))reasons.push('闭眼线索，需结合相邻画面');
      if(main.some(f=>f.clipped))reasons.push('面部靠近画面边缘');
      if(main.some(f=>f.clarity<80))reasons.push('人物脸部细节不足');
      if(score<52)reasons.push('综合把握不足，保留为备选');
      return {available:true,time,faces,poses,score,reasons,confidence:'medium',needsReview:score<52||eyeOccluded||screenAmbiguous||missingSubject||main.some(f=>f.clipped||f.over>.5||f.dark>.7||f.clarity<80),screenAmbiguous,bodyNaturalness:'landmark-assisted',occlusion:'hand-landmark-overlap'};
    }catch(e){return {available:false,reasons:[e.message]}}
  }
  window.StarTraceVision={init,analyze};
})();
