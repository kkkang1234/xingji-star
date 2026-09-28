const assert=require('node:assert/strict');const S=require('../selection.js');
assert.equal(S.sampleTimes(0,641.73).times.length,321);
assert.equal(S.nearbyTimes(350,641.73).length,21);
assert(S.nearbyTimes(0,1).every(t=>t>=0&&t<1));
assert.equal(new Set(S.nearbyTimes(0,1)).size,S.nearbyTimes(0,1).length);
function f(t,score,review=false,blink=0){return{time:t,baseRank:score,rank:score,baseReview:review,baseReasons:['test'],hash:'1'.repeat(64),analysis:{faces:[{area:.1,bbox:{x:.3,y:.2,width:.2,height:.3},smile:.1,blink,clarity:100}]}}}
const good=f(1,65),bad=f(1.1,90,true);let r=S.select([good,bad],12,true);assert.equal(r.selected[0],good);assert.equal(good.alternatives[0],bad);
const blink=f(1,65,false,.9),open=f(1.2,65,false,.05);S.rankTemporal([blink,open]);assert(blink.review);assert(!open.review);
const sustained=[f(1,65,false,.9),f(1.2,65,false,.85)];S.rankTemporal(sustained);assert(sustained.every(x=>!x.review),'Sustained closed eyes must not be equated with transitional blink');
r=S.select([f(1,60),f(1.1,59)],12,true);assert.equal(r.selected.length,1);assert.equal(r.collapsed,1);
r=S.select([f(1,30,true)],12,true);assert.equal(r.selected.length,0);assert.equal(r.backups.length,1);
assert(S.refineTimes([f(0,65)],0,.005,1).every(t=>t>=0&&t<=.005));
console.log('PASS selection: dense sampling, boundaries, review grouping, temporal blink, sustained closed eyes, duplicate folding, no filler');
