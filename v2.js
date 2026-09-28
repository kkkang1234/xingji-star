'use strict';
const selection=window.StarTraceSelection;
let pool=[],backups=[],nearby=[],visionReady=false,currentFrame=null,roi=null,roiDraft=null,roiImage=null,scanKind='local';
controls=function(){
 document.querySelectorAll('[data-step],#capture,#extract,#setRange,#roiOpen').forEach(b=>b.disabled=!ready||busy);
 document.querySelectorAll('#file,#count,#rangeStart,#rangeEnd,#scanMode,#roiClear').forEach(b=>b.disabled=busy);
 document.querySelectorAll('.frame button,.saved-item button,#viewerSave,#viewerNearby').forEach(b=>b.disabled=busy);
 $('download').disabled=!saved.length||busy;$('cancel').hidden=!busy;
};
guarded=async function(action){if(busy||!ready)return;busy=true;stopped=false;video.pause();video.controls=false;controls();try{await action()}catch(e){status(e.message)}finally{busy=false;video.controls=true;$('progress').hidden=true;controls()}};
function previewCanvas(c){const p=document.createElement('canvas'),s=Math.min(1,900/Math.max(c.width,c.height));p.width=Math.round(c.width*s);p.height=Math.round(c.height*s);p.getContext('2d').drawImage(c,0,0,p.width,p.height);return p}
function imageHash(c){const s=document.createElement('canvas');s.width=9;s.height=8;const x=s.getContext('2d',{willReadFrequently:true});x.drawImage(c,0,0,9,8);const p=x.getImageData(0,0,9,8).data;let hash='';const l=i=>p[i*4]*.299+p[i*4+1]*.587+p[i*4+2]*.114;for(let y=0;y<8;y++)for(let z=0;z<8;z++)hash+=l(y*9+z)>l(y*9+z+1)?'1':'0';return hash}
function release(list){for(const f of list)if(f.url)URL.revokeObjectURL(f.url)}
function resetCandidates(){release(pool);release(nearby);pool=[];frames=[];backups=[];nearby=[];currentFrame=null;$('viewer').close();$('nearbySection').hidden=true;$('backupFrames').hidden=true;renderFrames()}
async function ensureVision(){if(visionReady)return true;$('visionState').textContent='正在载入本地表情模型…';try{const result=await window.StarTraceVision.init();visionReady=!!result.ready;$('visionState').textContent=visionReady?'本地模型已就绪 · 表情线索辅助，动作与互动仍需复核':`模型不可用：${result.reason||'请通过启动器打开'}。改用基础候选。`;return visionReady}catch(e){$('visionState').textContent=`模型未启动，改用基础候选：${e.message}`;return false}}
$('file').onchange=async()=>{
 const file=$('file').files[0];if(!file||busy)return;busy=true;ready=false;stopped=false;controls();video.pause();status('正在读取视频…');
 try{resetCandidates();if(sourceURL)URL.revokeObjectURL(sourceURL);sourceURL=URL.createObjectURL(file);await eventOnce(video,'loadeddata',()=>{video.src=sourceURL;video.load()});if(!Number.isFinite(video.duration)||!video.videoWidth)throw new Error('无法读取视频时长或尺寸，请换一个视频。');sourceName=file.name;ready=true;$('empty').hidden=true;$('stage').classList.toggle('portrait',video.videoHeight>video.videoWidth);$('filename').textContent=file.name;$('rangeStart').value='0';$('rangeEnd').value=video.duration.toFixed(3);$('rangeStart').max=$('rangeEnd').max=video.duration;roi=null;updateRoi();$('scanSummary').textContent='选择全片或时间范围，再开始选片。';status(`视频已就绪 · ${video.videoWidth} × ${video.videoHeight} · ${stamp(video.duration)}。收藏仅保留在当前页面，请及时下载。`)}catch(e){status(e.message);$('empty').hidden=false;$('filename').textContent='视频未就绪';$('time').textContent='00:00.000 / 00:00.000'}finally{busy=false;controls();$('file').value=''}
};
$('setRange').onclick=()=>{if(!ready||busy)return;$('rangeStart').value=Math.max(0,video.currentTime-10).toFixed(3);$('rangeEnd').value=Math.min(video.duration,video.currentTime+10).toFixed(3);status('已设置当前时间前后各 10 秒，可调整起止秒数。')};
function readRange(){const start=$('rangeStart').value===''?0:Number($('rangeStart').value),end=$('rangeEnd').value===''?video.duration:Number($('rangeEnd').value);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>video.duration+.005)throw new Error('请填写有效范围：开始不小于 0，结束大于开始，且不超过视频时长。');return{start,end:Math.min(end,video.duration)}}
async function captureCandidate(t,modelEnabled){
 await seek(t);const c=canvasAt(Math.min(video.videoWidth,Math.round(1280*video.videoWidth/Math.max(video.videoWidth,video.videoHeight))));const score=sharpness(c);let analysis=null;
 if(modelEnabled){analysis=await window.StarTraceVision.analyze(c,video.currentTime,{roi:roi||undefined,tileScan:true});if(!analysis.available)throw new Error(`视觉分析中断：${analysis.reasons?.join('；')||'模型不可用'}。保留已完成候选，可切换基础采样。`)}
 const blob=await blobOf(previewCanvas(c),'image/jpeg'),baseRank=modelEnabled?(Number(analysis.score)||0):Math.log1p(score)*8;
 const reasons=modelEnabled?(analysis.reasons?.length?analysis.reasons:['面部特征辅助排序，动作仍请复核']):['基础候选 · 未判断表情与动作'];
 return{id:++serial,time:video.currentTime,score,baseRank,rank:baseRank,analysis,baseReview:modelEnabled?!!(analysis.needsReview||!analysis.faces?.length):false,review:false,baseReasons:reasons,reasons:[...reasons],url:URL.createObjectURL(blob),hash:imageHash(c),alternatives:[]};
}
function finishSelection(n,modelEnabled){const result=selection.select(pool,n,modelEnabled);frames=result.selected;backups=result.backups;renderFrames();$('scanSummary').textContent=`已检查 ${pool.length} 帧 · ${modelEnabled?'表情辅助推荐':'基础候选'} ${frames.length} 张 · 备选 ${backups.length} 组 · 折叠相似画面 ${result.collapsed} 张${roi?' · 已框选分析区域':''}`}
$('extract').onclick=()=>guarded(async()=>{
 const {start,end}=readRange(),n=Number($('count').value),old=video.currentTime;resetCandidates();$('progress').hidden=false;$('progress').value=0;
 const modelEnabled=$('scanMode').value==='auto'&&await ensureVision();scanKind=modelEnabled?'auto':'local';const plan=selection.sampleTimes(start,end);let failure=null;
 try{for(let i=0;i<plan.times.length;i++){if(stopped)break;pool.push(await captureCandidate(plan.times[i],modelEnabled));$('progress').value=.7*(i+1)/plan.times.length;status(`扫描 ${i+1}/${plan.times.length} · 每 ${plan.step.toFixed(2)} 秒取样 · ${modelEnabled?'比较人物表情线索':'基础候选'}`);if((i+1)%12===0)finishSelection(n,modelEnabled);await new Promise(r=>setTimeout(r,0))}
 if(modelEnabled&&!stopped){finishSelection(n,true);const refine=selection.refineTimes(pool,start,end,Math.min(n*2,32));for(let i=0;i<refine.length;i++){if(stopped)break;pool.push(await captureCandidate(refine[i],true));$('progress').value=.7+.3*(i+1)/Math.max(1,refine.length);status(`比较相邻表情 ${i+1}/${refine.length} · 已检查 ${pool.length} 帧`);await new Promise(r=>setTimeout(r,0))}}
 }catch(e){failure=e}finally{finishSelection(n,modelEnabled);await seek(old)}
 if(failure)throw failure;
 status(`${stopped?'已停止，保留已完成结果。':'选片完成。'}${frames.length?`推荐 ${frames.length} 张，可查看备选或在附近再找。`:'没有足够把握的推荐，请展开备选查看。'}${modelEnabled?'动作自然度与多人互动仍请复核。':'本次为基础候选，未判断表情。'}`)
});
$('cancel').onclick=()=>{stopped=true;status('正在停止，当前帧完成后保留结果…')};$('sort').onchange=()=>renderFrames();
function button(text,action,cls){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=action;if(cls)b.className=cls;b.disabled=busy;return b}
function renderCard(f){const card=document.createElement('article');card.className='frame';card.dataset.time=f.time;
 const jump=button('',()=>guarded(()=>seek(f.time)),'jump');jump.title=`跳转到 ${stamp(f.time)}`;jump.setAttribute('aria-label',jump.title);const img=document.createElement('img');img.src=f.url;img.alt=`视频 ${stamp(f.time)} 的真实画面`;img.loading='lazy';jump.append(img);
 const meta=document.createElement('div');meta.className='frame-meta';const time=document.createElement('span');time.textContent=stamp(f.time);const badge=document.createElement('span');badge.className='frame-badge';badge.textContent=f.analysis?(f.review?'待复核':'表情辅助'):'基础候选';meta.append(time,badge);
 const reason=document.createElement('p');reason.className='frame-reason';reason.textContent=f.reasons.slice(0,2).join(' · ');reason.title=f.reasons.join('；');const actions=document.createElement('div');actions.className='frame-actions';actions.append(button('放大',()=>openViewer(f)),button('♡ 收藏',()=>guarded(async()=>{await seek(f.time);await saveCurrent()})),button('附近再找',()=>findNearby(f)));if(f.alternatives?.length)actions.append(button(`相似 ${f.alternatives.length+1} 张`,()=>showAlternatives(f)));card.append(jump,meta,reason,actions);return card;
}
function drawList(root,list,empty){root.replaceChildren();if(!list.length){const p=document.createElement('p');p.className='placeholder';p.textContent=empty;root.append(p)}else list.forEach(f=>root.append(renderCard(f)))}
renderFrames=function(){const sort=$('sort').value,list=[...frames].sort((a,b)=>sort==='time'?a.time-b.time:sort==='sharp'?b.score-a.score:b.rank-a.rank);drawList($('frames'),list,'完成扫描后，推荐画面会出现在这里。没有推荐时可展开备选。');$('showBackups').hidden=!backups.length;$('showBackups').textContent=`${$('backupFrames').hidden?'展开':'收起'}备选（${backups.length} 组）`;if(!$('backupFrames').hidden)drawList($('backupFrames'),backups,'没有备选');controls()};
$('showBackups').onclick=()=>{$('backupFrames').hidden=!$('backupFrames').hidden;renderFrames()};
function openViewer(f){if(busy)return;currentFrame=f;$('viewerImage').src=f.url;$('viewerTime').textContent=stamp(f.time);$('viewerReason').textContent=f.reasons.join(' · ');$('viewer').showModal()}
$('viewerClose').onclick=()=>$('viewer').close();$('viewerSave').onclick=()=>{if(currentFrame)guarded(async()=>{await seek(currentFrame.time);await saveCurrent()})};$('viewerNearby').onclick=()=>{if(currentFrame){const f=currentFrame;$('viewer').close();findNearby(f)}};
function findNearby(f){return guarded(async()=>{const old=video.currentTime;release(nearby);nearby=[];$('nearbySection').hidden=false;$('nearbyTitle').textContent=`${stamp(f.time)} 附近 · 前后各 1 秒`;drawList($('nearbyFrames'),[],'正在读取附近画面…');$('progress').hidden=false;
 try{const times=selection.nearbyTimes(f.time,video.duration);for(let i=0;i<times.length;i++){if(stopped)break;nearby.push(await captureCandidate(times[i],visionReady&&scanKind==='auto'));$('progress').value=(i+1)/times.length;status(`附近再找 ${i+1}/${times.length}`);await new Promise(r=>setTimeout(r,0))}selection.rankTemporal(nearby)}finally{drawList($('nearbyFrames'),nearby,'没有完成的附近画面');await seek(old)}
 $('nearbySection').scrollIntoView({behavior:'smooth',block:'start'});status(`已显示 ${nearby.length} 张附近画面，按时间排列。`)
})}
function showAlternatives(f){if(busy)return;$('nearbySection').hidden=false;$('nearbyTitle').textContent=`${stamp(f.time)} · 相似画面对比`;drawList($('nearbyFrames'),[f,...f.alternatives].sort((a,b)=>a.time-b.time),'没有相似画面');$('nearbySection').scrollIntoView({behavior:'smooth',block:'start'})}
$('nearbyClose').onclick=()=>{if(busy)return;$('nearbySection').hidden=true;release(nearby);nearby=[]};
function updateRoi(){$('roiClear').hidden=!roi;$('roiStatus').textContent=roi?'已框选舞台分析区域 · 导出保留完整画面':'大屏人脸可能干扰，可框选舞台人物区域'}
function drawRoi(){const c=$('roiCanvas'),ctx=c.getContext('2d');ctx.drawImage(roiImage,0,0,c.width,c.height);if(roiDraft){const{x,y,width,height}=roiDraft;ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(roiImage,x*c.width,y*c.height,width*c.width,height*c.height,x*c.width,y*c.height,width*c.width,height*c.height);ctx.strokeStyle='#bb96ff';ctx.lineWidth=3;ctx.strokeRect(x*c.width,y*c.height,width*c.width,height*c.height)}}
$('roiOpen').onclick=()=>{if(!ready||busy)return;video.pause();roiImage=canvasAt(Math.min(720,video.videoWidth));const c=$('roiCanvas');c.width=roiImage.width;c.height=roiImage.height;roiDraft=roi?{...roi}:null;drawRoi();$('roiError').textContent='';$('roiDialog').showModal()};
let roiAnchor=null;
function roiPoint(e){const r=$('roiCanvas').getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}}
$('roiCanvas').onpointerdown=e=>{roiAnchor=roiPoint(e);$('roiCanvas').setPointerCapture(e.pointerId)};$('roiCanvas').onpointermove=e=>{if(!roiAnchor)return;const p=roiPoint(e);roiDraft={x:Math.min(p.x,roiAnchor.x),y:Math.min(p.y,roiAnchor.y),width:Math.abs(p.x-roiAnchor.x),height:Math.abs(p.y-roiAnchor.y)};drawRoi()};$('roiCanvas').onpointerup=()=>{roiAnchor=null};$('roiCanvas').onpointercancel=()=>{roiAnchor=null};
$('roiApply').onclick=()=>{if(!roiDraft||roiDraft.width<.1||roiDraft.height<.1){$('roiError').textContent='请拖动框选足够大的舞台人物区域。';return}roi={...roiDraft};updateRoi();$('roiDialog').close();status('已设置区域。请重新开始选片，使新区域生效。')};$('roiCancel').onclick=()=>$('roiDialog').close();$('roiClear').onclick=()=>{roi=null;updateRoi();status('已恢复整幅画面分析，请重新开始选片。')};
controls();
