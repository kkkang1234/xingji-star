(function(root){
  'use strict';
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  function sampleTimes(start,end){
    const length=end-start,step=length<=30?.5:length<=120?1:Math.max(2,length/600);
    const times=[];for(let t=start;t<end-.005;t+=step)times.push(+t.toFixed(3));
    return {times,step};
  }
  function nearbyTimes(center,duration){
    const result=[];for(let i=-10;i<=10;i++){const t=+clamp(center+i*.1,0,Math.max(0,duration-.01)).toFixed(3);if(!result.includes(t))result.push(t)}return result;
  }
  function hashDistance(a,b){if(!a||!b||a.length!==b.length)return Infinity;let n=0;for(let i=0;i<a.length;i++)n+=a[i]!==b[i];return n}
  function faceArea(f){return f.area??((f.bbox?.width||f.bbox?.w||0)*(f.bbox?.height||f.bbox?.h||0))}
  function mainFaces(f){const faces=f.analysis?.faces||[];const max=Math.max(0,...faces.map(faceArea));return faces.filter(x=>faceArea(x)>=max*.32&&faceArea(x)>.0004)}
  function compatibleFaces(a,b){const fa=mainFaces(a),fb=mainFaces(b);if(!fa.length||fa.length!==fb.length)return false;return fa.every(x=>fb.some(y=>{const ax=x.bbox?.x||0,ay=x.bbox?.y||0,bx=y.bbox?.x||0,by=y.bbox?.y||0;return Math.abs(ax-bx)<.12&&Math.abs(ay-by)<.12}))}
  function refineTimes(pool,start,end,limit){
    const seeds=[];for(const f of [...pool].sort((a,b)=>b.rank-a.rank)){
      if(f.analysis?.faces?.length&&!seeds.some(x=>Math.abs(x.time-f.time)<1.5))seeds.push(f);
      if(seeds.length>=limit)break;
    }
    const existing=new Set(pool.map(f=>f.time.toFixed(3))),times=[];
    for(const f of seeds)for(const offset of [-.3,-.15,.15,.3]){const t=+clamp(f.time+offset,start,Math.max(start,end-.001)).toFixed(3);if(!existing.has(t.toFixed(3))){times.push(t);existing.add(t.toFixed(3))}}
    return times.sort((a,b)=>a-b);
  }
  function rankTemporal(pool){
    const ordered=[...pool].sort((a,b)=>a.time-b.time);
    for(const f of ordered){
      f.rank=f.baseRank;f.review=!!f.baseReview;f.reasons=[...f.baseReasons];
      const people=mainFaces(f);if(!people.length)continue;
      const neighbors=ordered.filter(n=>n!==f&&Math.abs(n.time-f.time)<=.65&&compatibleFaces(f,n));
      const blink=Math.max(...people.map(x=>x.blink||0));
      if(blink>.68&&neighbors.some(n=>mainFaces(n).every(x=>(x.blink||0)<.32))){f.rank-=18;f.review=true;f.reasons.unshift('相邻对比：疑似眨眼过渡')}
      const clarity=people.reduce((s,x)=>s+(x.clarity||0),0)/people.length;
      const sharper=neighbors.find(n=>{const nf=mainFaces(n);return nf.reduce((s,x)=>s+(x.clarity||0),0)/nf.length>clarity*1.5&&clarity>0&&n.baseRank>f.baseRank});
      if(sharper){f.rank-=7;f.reasons.push('附近有人物更清楚的画面')}
    }
    return ordered;
  }
  function similar(a,b){
    if(Math.abs(a.time-b.time)>3)return false;
    if(Math.abs(a.time-b.time)<.4&&hashDistance(a.hash,b.hash)<=24)return true;
    const fa=mainFaces(a),fb=mainFaces(b);
    if(fa.length&&fb.length&&Math.abs(Math.max(...fa.map(f=>f.smile||0))-Math.max(...fb.map(f=>f.smile||0)))>.3)return false;
    const gap=Math.abs(a.time-b.time);return hashDistance(a.hash,b.hash)<=(gap<.65?24:gap<1.4?18:10);
  }
  function select(pool,count,modelEnabled){
    rankTemporal(pool);const groups=[];
    for(const f of [...pool].sort((a,b)=>Number(a.review)-Number(b.review)||b.rank-a.rank)){
      f.alternatives=[];const group=groups.find(g=>similar(g,f));
      if(group)group.alternatives.push(f);else groups.push(f);
    }
    const eligible=groups.filter(f=>!modelEnabled||!f.review);
    const selected=eligible.slice(0,count),selectedSet=new Set(selected);
    const backups=groups.filter(f=>!selectedSet.has(f));
    return {selected,backups,groupCount:groups.length,collapsed:pool.length-groups.length};
  }
  const api={sampleTimes,nearbyTimes,refineTimes,select,hashDistance,mainFaces,rankTemporal};
  root.StarTraceSelection=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
